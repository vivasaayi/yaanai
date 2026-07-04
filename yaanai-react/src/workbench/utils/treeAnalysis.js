export function nodeKind(node) {
    return String(node?.node_type || '').toLowerCase();
}

export function isFileNode(node) {
    return nodeKind(node) === 'file';
}

export function isDirectoryNode(node) {
    return nodeKind(node) === 'directory';
}

export function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

export function timeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function flattenTree(tree, options = {}) {
    const {
        includeRoot = false,
        includeFiles = true,
        includeDirs = true,
        recursive = true,
    } = options;
    const nodes = [];

    function walk(node, depth, isRoot) {
        if (!node) return;

        const includeNode =
            (!isRoot || includeRoot) &&
            ((includeFiles && isFileNode(node)) || (includeDirs && isDirectoryNode(node)));

        if (includeNode) {
            nodes.push({ node, depth });
        }

        if (!recursive && !isRoot) {
            return;
        }

        (node.children || []).forEach((child) => walk(child, depth + 1, false));
    }

    walk(tree, 0, true);
    return nodes;
}

export function computeTreeStats(tree) {
    let fileCount = 0;
    let dirCount = 0;

    flattenTree(tree, { includeRoot: true }).forEach(({ node }) => {
        if (isFileNode(node)) fileCount += 1;
        else if (isDirectoryNode(node)) dirCount += 1;
    });

    return {
        fileCount,
        dirCount,
        totalSize: tree?.disk_entry?.size || 0,
    };
}

export function searchTree(tree, query) {
    const pattern = query.pattern.trim();
    const patternLower = pattern.toLowerCase();
    const regex = buildRegex(pattern);
    const globRegex = buildGlobRegex(patternLower);
    const extensions = normalizeExtensions(query.extensions);
    const results = [];
    let filesSearched = 0;

    const entries = flattenTree(tree, {
        includeRoot: false,
        includeFiles: true,
        includeDirs: false,
        recursive: query.recursive,
    });

    entries.forEach(({ node }) => {
        const path = node.disk_entry?.path || '';
        const name = node.disk_entry?.name || path.split('/').pop() || '';
        const size = node.disk_entry?.size || 0;
        filesSearched += 1;

        if (query.minSize != null && size < query.minSize) return;
        if (query.maxSize != null && size > query.maxSize) return;

        if (extensions.length > 0) {
            const ext = fileExtension(name);
            if (!extensions.includes(ext)) return;
        }

        const nameLower = name.toLowerCase();
        const pathLower = path.toLowerCase();
        let matchedOn = null;

        if (matchesPattern(nameLower, patternLower, regex, globRegex)) {
            matchedOn = 'name';
        } else if (matchesPattern(pathLower, patternLower, regex, globRegex)) {
            matchedOn = 'path';
        }

        if (!matchedOn) return;

        results.push({
            path,
            name,
            size,
            size_h: node.disk_entry?.size_h || formatBytes(size),
            is_dir: false,
            matched_on: matchedOn,
        });
    });

    return {
        results,
        total_matches: results.length,
        files_searched: filesSearched,
        errors: [],
    };
}

export const DUPLICATE_MATCH_MODES = [
    {
        id: 'name_size',
        label: 'Same name + size',
        description: 'Fast metadata match. Best first pass for large scans.',
    },
    {
        id: 'name_size_modified',
        label: 'Same name + size + modified',
        description: 'Stricter match when the snapshot includes modified time.',
    },
    {
        id: 'size_modified',
        label: 'Same size + modified',
        description: 'Finds renamed copies, with more review needed.',
    },
];

export async function buildMetadataDuplicateGroupsAsync(tree, options = {}, onProgress = () => {}) {
    const state = createDuplicateState(tree, options);
    const chunkSize = Math.max(100, Number(options.chunkSize) || 5000);
    const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : () => false;
    const stack = tree ? [{ node: tree, isRoot: true }] : [];

    while (stack.length > 0) {
        let processed = 0;
        while (stack.length > 0 && processed < chunkSize) {
            if (shouldCancel()) {
                return finalizeDuplicateState(state, { cancelled: true });
            }

            const { node, isRoot } = stack.pop();
            processed += 1;

            if (!isRoot && isFileNode(node)) {
                visitDuplicateCandidate(node, state);
            }

            const children = Array.isArray(node?.children) ? node.children : [];
            for (let i = children.length - 1; i >= 0; i -= 1) {
                stack.push({ node: children[i], isRoot: false });
            }
        }

        onProgress({
            filesScanned: state.filesScanned,
            duplicateCandidates: state.duplicateCandidates,
            groupsSeen: state.groupsByKey.size,
            skippedSmallFiles: state.skippedSmallFiles,
            missingMetadataFiles: state.missingMetadataFiles,
        });
        await yieldToMainThread();
    }

    return finalizeDuplicateState(state);
}

function createDuplicateState(tree, options) {
    return {
        tree,
        options: normalizeDuplicateOptions(options),
        startedAt: Date.now(),
        filesScanned: 0,
        skippedSmallFiles: 0,
        missingMetadataFiles: 0,
        duplicateCandidates: 0,
        groupsByKey: new Map(),
    };
}

function normalizeDuplicateOptions(options = {}) {
    return {
        matchMode: DUPLICATE_MATCH_MODES.some((mode) => mode.id === options.matchMode)
            ? options.matchMode
            : 'name_size',
        minSizeBytes: Math.max(0, Number(options.minSizeBytes) || 0),
        includeZeroByte: Boolean(options.includeZeroByte),
    };
}

function visitDuplicateCandidate(node, state) {
    const entry = node.disk_entry || {};
    const size = Number(entry.size) || 0;
    state.filesScanned += 1;

    if (!state.options.includeZeroByte && size === 0) {
        state.skippedSmallFiles += 1;
        return;
    }
    if (size < state.options.minSizeBytes) {
        state.skippedSmallFiles += 1;
        return;
    }

    const fingerprint = buildMetadataFingerprint(entry, state.options.matchMode);
    if (!fingerprint) {
        state.missingMetadataFiles += 1;
        return;
    }

    const file = {
        path: entry.path || '',
        name: entry.name || fileName(entry.path || ''),
        size,
        size_h: entry.size_h || formatBytes(size),
        modified_unix_secs: normalizeTimestamp(entry.modified_unix_secs),
        created_unix_secs: normalizeTimestamp(entry.created_unix_secs),
    };

    if (!file.path) return;

    let group = state.groupsByKey.get(fingerprint.key);
    if (!group) {
        group = {
            key: fingerprint.key,
            match_fields: fingerprint.fields,
            match_label: fingerprint.label,
            confidence: confidenceForMatchMode(state.options.matchMode),
            files: [],
        };
        state.groupsByKey.set(fingerprint.key, group);
    }

    group.files.push(file);
    if (group.files.length === 2) {
        state.duplicateCandidates += 2;
    } else if (group.files.length > 2) {
        state.duplicateCandidates += 1;
    }
}

function finalizeDuplicateState(state, overrides = {}) {
    const groups = Array.from(state.groupsByKey.values())
        .filter((group) => group.files.length > 1)
        .map((group, index) => {
            const files = [...group.files].sort((a, b) => {
                const pathDelta = a.path.length - b.path.length;
                if (pathDelta !== 0) return pathDelta;
                return a.path.localeCompare(b.path);
            });
            const size = files[0]?.size || 0;
            const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
            const wastedSpace = files.slice(1).reduce((sum, file) => sum + (file.size || 0), 0);
            return {
                id: `metadata:${index}:${group.key}`,
                key: group.key,
                match_fields: group.match_fields,
                match_label: group.match_label,
                confidence: group.confidence,
                files,
                size,
                size_h: formatBytes(size),
                total_size: totalSize,
                total_size_h: formatBytes(totalSize),
                wasted_space: wastedSpace,
                wasted_space_h: formatBytes(wastedSpace),
            };
        })
        .sort((a, b) => {
            const wastedDelta = b.wasted_space - a.wasted_space;
            if (wastedDelta !== 0) return wastedDelta;
            return b.files.length - a.files.length;
        });

    const totalDuplicates = groups.reduce((sum, group) => sum + Math.max(0, group.files.length - 1), 0);
    const totalWastedSpace = groups.reduce((sum, group) => sum + group.wasted_space, 0);

    return {
        match_mode: state.options.matchMode,
        match_label: DUPLICATE_MATCH_MODES.find((mode) => mode.id === state.options.matchMode)?.label || state.options.matchMode,
        total_files_scanned: state.filesScanned,
        total_candidates: state.duplicateCandidates,
        total_groups: groups.length,
        total_duplicates: totalDuplicates,
        total_wasted_space: totalWastedSpace,
        total_wasted_space_h: formatBytes(totalWastedSpace),
        skipped_small_files: state.skippedSmallFiles,
        missing_metadata_files: state.missingMetadataFiles,
        duration_ms: Date.now() - state.startedAt,
        groups,
        cancelled: false,
        ...overrides,
    };
}

function buildMetadataFingerprint(entry, matchMode) {
    const name = normalizeFileName(entry.name || fileName(entry.path || ''));
    const size = Number(entry.size) || 0;
    const modified = normalizeTimestamp(entry.modified_unix_secs);

    switch (matchMode) {
        case 'name_size_modified':
            if (modified == null) return null;
            return {
                key: ['name', name, 'size', size, 'modified', modified].join('|'),
                fields: ['name', 'size', 'modified'],
                label: 'name + size + modified',
            };
        case 'size_modified':
            if (modified == null) return null;
            return {
                key: ['size', size, 'modified', modified].join('|'),
                fields: ['size', 'modified'],
                label: 'size + modified',
            };
        case 'name_size':
        default:
            return {
                key: ['name', name, 'size', size].join('|'),
                fields: ['name', 'size'],
                label: 'name + size',
            };
    }
}

function confidenceForMatchMode(matchMode) {
    switch (matchMode) {
        case 'name_size_modified':
            return 'strong';
        case 'size_modified':
            return 'review';
        case 'name_size':
        default:
            return 'review';
    }
}

function normalizeTimestamp(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeFileName(name) {
    return String(name || '').trim().toLowerCase();
}

function yieldToMainThread() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function normalizeExtensions(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list
        .map((ext) => String(ext).trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean);
}

function fileExtension(name) {
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function fileName(path) {
    return String(path || '').split('/').filter(Boolean).pop() || '';
}

function matchesPattern(text, patternLower, regex, globRegex) {
    if (text.includes(patternLower)) return true;
    if (regex?.test(text)) return true;
    if (globRegex?.test(text)) return true;
    return false;
}

function buildRegex(pattern) {
    try {
        return new RegExp(pattern, 'i');
    } catch {
        return null;
    }
}

function buildGlobRegex(patternLower) {
    if (!patternLower.includes('*') && !patternLower.includes('?')) return null;
    const escaped = patternLower
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    try {
        return new RegExp(`^${escaped}$`, 'i');
    } catch {
        return null;
    }
}
