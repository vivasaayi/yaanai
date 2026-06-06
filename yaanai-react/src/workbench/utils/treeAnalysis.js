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

export function buildDuplicateCandidates(tree) {
    return flattenTree(tree, { includeDirs: false, includeFiles: true })
        .map(({ node }) => ({
            path: node.disk_entry?.path || '',
            name: node.disk_entry?.name || (node.disk_entry?.path || '').split('/').pop() || '',
            size: node.disk_entry?.size || 0,
        }))
        .filter((file) => file.path && file.size > 0);
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
