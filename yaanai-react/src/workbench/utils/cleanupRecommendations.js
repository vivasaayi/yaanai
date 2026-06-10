import { flattenTree, formatBytes, isDirectoryNode, isFileNode } from './treeAnalysis';

const LARGE_FILE_BYTES = 1024 * 1024 * 1024;

const CATEGORY_ORDER = [
    'Build and dependency folders',
    'Empty folders',
    'Temporary and log files',
    'Installers and archives',
    'Screenshots and recordings',
    'Large files',
];

const BUILD_DIR_NAMES = new Set([
    'node_modules',
    'target',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.turbo',
    '.parcel-cache',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.gradle',
    'DerivedData',
]);

const DEV_CACHE_PATHS = [
    '/Library/Developer/Xcode/DerivedData/',
    '/Library/Developer/CoreSimulator/',
    '/Library/Caches/Homebrew/',
    '/.npm/',
    '/.cargo/registry/',
];

const INSTALLER_ARCHIVE_EXTS = new Set([
    'dmg',
    'pkg',
    'iso',
    'zip',
    'rar',
    '7z',
    'tar',
    'gz',
    'tgz',
    'bz2',
    'xz',
]);

const TEMP_EXTS = new Set([
    'tmp',
    'temp',
    'log',
    'crash',
    'bak',
    'old',
    'swp',
    'part',
    'download',
    'crdownload',
]);

export function buildCleanupRecommendations(tree) {
    const allEntries = flattenTree(tree, {
        includeRoot: false,
        includeFiles: true,
        includeDirs: true,
    });
    const files = allEntries.filter(({ node }) => isFileNode(node));
    const directories = allEntries.filter(({ node }) => isDirectoryNode(node));
    const recommendations = [];
    const recommendedPaths = new Set();
    const recommendedDirectories = [];

    function addRecommendation(node, details) {
        const entry = node.disk_entry || {};
        const path = entry.path || '';
        if (!path || recommendedPaths.has(path) || isInsideDirectory(path, recommendedDirectories)) {
            return;
        }

        const recommendation = {
            id: `${details.category}:${path}`,
            path,
            name: entry.name || fileName(path),
            size: entry.size || 0,
            sizeH: entry.size_h || formatBytes(entry.size || 0),
            isDir: isDirectoryNode(node),
            suggestedAction: 'Move to Trash',
            ...details,
        };

        recommendations.push(recommendation);
        recommendedPaths.add(path);

        if (recommendation.isDir) {
            recommendedDirectories.push(path);
        }
    }

    directories.forEach(({ node }) => {
        const path = node.disk_entry?.path || '';
        const name = node.disk_entry?.name || fileName(path);
        if (isBuildOrCacheDirectory(name, path)) {
            addRecommendation(node, {
                category: 'Build and dependency folders',
                confidence: 'review',
                reason: 'Regenerable dependency or build output folder.',
            });
        }
    });

    directories.forEach(({ node }) => {
        if ((node.children || []).length === 0 && (node.disk_entry?.size || 0) === 0) {
            addRecommendation(node, {
                category: 'Empty folders',
                confidence: 'safe',
                reason: 'Directory has no scanned contents.',
            });
        }
    });

    files.forEach(({ node }) => {
        const name = node.disk_entry?.name || fileName(node.disk_entry?.path || '');
        if (TEMP_EXTS.has(fileExtension(name))) {
            addRecommendation(node, {
                category: 'Temporary and log files',
                confidence: 'safe',
                reason: 'Temporary, partial, backup, or log file extension.',
            });
        }
    });

    files.forEach(({ node }) => {
        const name = node.disk_entry?.name || fileName(node.disk_entry?.path || '');
        if (INSTALLER_ARCHIVE_EXTS.has(fileExtension(name))) {
            addRecommendation(node, {
                category: 'Installers and archives',
                confidence: isDownloadsPath(node.disk_entry?.path || '') ? 'safe' : 'review',
                reason: 'Installer, disk image, or compressed archive.',
            });
        }
    });

    files.forEach(({ node }) => {
        const name = node.disk_entry?.name || fileName(node.disk_entry?.path || '');
        if (isScreenshotName(name)) {
            addRecommendation(node, {
                category: 'Screenshots and recordings',
                confidence: 'review',
                reason: 'Mac screenshot or screen recording naming pattern.',
            });
        }
    });

    files.forEach(({ node }) => {
        const size = node.disk_entry?.size || 0;
        if (size >= LARGE_FILE_BYTES) {
            addRecommendation(node, {
                category: 'Large files',
                confidence: 'review',
                reason: `File is larger than ${formatBytes(LARGE_FILE_BYTES)}.`,
            });
        }
    });

    return recommendations.sort((a, b) => {
        const categoryDelta = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (categoryDelta !== 0) return categoryDelta;
        return b.size - a.size;
    });
}

export function summarizeRecommendations(recommendations) {
    return recommendations.reduce(
        (summary, item) => {
            summary.count += 1;
            summary.bytes += item.size || 0;
            summary.byCategory[item.category] = (summary.byCategory[item.category] || 0) + 1;
            summary.byConfidence[item.confidence] = (summary.byConfidence[item.confidence] || 0) + 1;
            return summary;
        },
        {
            count: 0,
            bytes: 0,
            byCategory: {},
            byConfidence: {},
        },
    );
}

export function categoryOrder(category) {
    const index = CATEGORY_ORDER.indexOf(category);
    return index >= 0 ? index : CATEGORY_ORDER.length;
}

function isBuildOrCacheDirectory(name, path) {
    if (BUILD_DIR_NAMES.has(name)) return true;
    return DEV_CACHE_PATHS.some((segment) => path.includes(segment));
}

function isInsideDirectory(path, directories) {
    return directories.some((dir) => path !== dir && path.startsWith(`${dir}/`));
}

function isDownloadsPath(path) {
    return path.includes('/Downloads/');
}

function isScreenshotName(name) {
    return /^(screen shot|screenshot|screen recording)[\s_-]/i.test(name);
}

function fileExtension(name) {
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function fileName(path) {
    return path.split('/').filter(Boolean).pop() || path;
}
