/**
 * ScanStateContext — Central state machine for all file scanning.
 *
 * States:
 *   IDLE         - No scan done yet
 *   SCANNING     - First scan in progress (no data to show)
 *   READY        - Scan complete, data available to all tools
 *   RE_SCANNING  - New scan in progress, old data still usable
 *   ERROR        - Scan failed
 *
 * State Versioning:
 *   Each completed scan creates a "snapshot" with version number.
 *   During RE_SCANNING, tools display the previous snapshot.
 *   When the new scan completes, it atomically becomes the current snapshot.
 *
 * Scan mutations go through this provider so tools share one coherent snapshot.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { setTheme as setAppTheme } from '@tauri-apps/api/app';
import { computeTreeStats, formatBytes, timeAgo } from '../utils/treeAnalysis';

// Scan status enum
export const ScanStatus = Object.freeze({
    IDLE: 'IDLE',
    SCANNING: 'SCANNING',
    READY: 'READY',
    RE_SCANNING: 'RE_SCANNING',
    ERROR: 'ERROR',
});

const ScanStateContext = createContext();

const STORAGE_KEYS = {
    currentPath: 'yaanai.currentPath',
    activeTab: 'yaanai.activeTab',
    themeMode: 'yaanai.themeMode',
};

function readStoredValue(key, fallbackValue) {
    try {
        return window.localStorage.getItem(key) ?? fallbackValue;
    } catch {
        return fallbackValue;
    }
}

function writeStoredValue(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage errors in private/locked-down environments.
    }
}

export const useScanState = () => {
    const ctx = useContext(ScanStateContext);
    if (!ctx) throw new Error('useScanState must be used within ScanStateProvider');
    return ctx;
};

/**
 * A snapshot is a frozen view of a completed scan:
 * {
 *   version: number,
 *   path: string,
 *   scannedAt: Date,
 *   tree: TreeNode,
 *   fileCount: number,
 *   dirCount: number,
 *   totalSize: number,
 *   totalSizeH: string,
 *   errors: [],
 * }
 */
function buildSnapshot(version, path, tree, errors) {
    const stats = computeTreeStats(tree);
    return {
        version,
        path,
        scannedAt: new Date(),
        tree,
        fileCount: stats.fileCount,
        dirCount: stats.dirCount,
        totalSize: stats.totalSize,
        totalSizeH: formatBytes(stats.totalSize),
        errors: errors || [],
    };
}

function normalizePath(path) {
    const value = String(path || '').trim();
    if (!value || value === '/') return value || '';
    return value.replace(/\/+$/, '');
}

function isSameOrDescendantPath(rootPath, candidatePath) {
    const root = normalizePath(rootPath);
    const candidate = normalizePath(candidatePath);
    if (!root || !candidate) return false;
    if (root === '/') return candidate.startsWith('/');
    return candidate === root || candidate.startsWith(`${root}/`);
}

function replaceTreeNodeByPath(tree, targetPath, replacementNode) {
    const target = normalizePath(targetPath);
    let replaced = false;

    function replaceNode(node) {
        if (!node) return node;

        if (normalizePath(node.disk_entry?.path) === target) {
            replaced = true;
            return replacementNode;
        }

        const originalChildren = Array.isArray(node.children) ? node.children : [];
        let childChanged = false;
        const nextChildren = originalChildren.map((child) => {
            const nextChild = replaceNode(child);
            if (nextChild !== child) {
                childChanged = true;
            }
            return nextChild;
        });

        if (!childChanged) {
            return node;
        }

        const nextNode = {
            ...node,
            children: nextChildren,
        };

        const diskEntry = node.disk_entry || {};
        if (diskEntry.is_dir) {
            const size = nextChildren.reduce(
                (sum, child) => sum + (child?.disk_entry?.size || 0),
                0,
            );
            nextNode.disk_entry = {
                ...diskEntry,
                size,
                size_h: formatBytes(size),
            };
        }

        return nextNode;
    }

    return {
        tree: replaceNode(tree),
        replaced,
    };
}

function filterRefreshErrors(errors, refreshedPath) {
    return (errors || []).filter((error) => (
        !isSameOrDescendantPath(refreshedPath, error?.path)
    ));
}

export const ScanStateProvider = ({ children }) => {
    // --- Core state machine ---
    const [status, setStatus] = useState(ScanStatus.IDLE);
    const [currentPath, setCurrentPath] = useState(() => readStoredValue(STORAGE_KEYS.currentPath, ''));
    const [currentSnapshot, setCurrentSnapshot] = useState(null);
    const [previousSnapshot, setPreviousSnapshot] = useState(null);
    const [snapshotHistory, setSnapshotHistory] = useState([]);
    const versionRef = useRef(0);

    // --- Scan progress ---
    const [scanProgress, setScanProgress] = useState(null);
    const [scanProgressText, setScanProgressText] = useState('');
    const scanProgressRef = useRef(null);

    // --- Favorites & ignore patterns ---
    const [favorites, setFavorites] = useState([]);
    const [ignorePatterns, setIgnorePatterns] = useState([]);

    // --- Workbench preferences ---
    const [activeTab, setActiveTabState] = useState(() => readStoredValue(STORAGE_KEYS.activeTab, 'overview'));
    const [themeMode, setThemeModeState] = useState(() => {
        const storedTheme = readStoredValue(STORAGE_KEYS.themeMode, '');
        if (storedTheme === 'light' || storedTheme === 'dark') {
            return storedTheme;
        }
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    const [staleStatus, setStaleStatus] = useState({ stale: false, changedPath: null });

    // --- Time tracking ---
    const [, setTick] = useState(0);

    // Update "time ago" every 30s
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(interval);
    }, []);

    // Initialize
    useEffect(() => {
        const init = async () => {
            if (!currentPath) {
                try {
                    const homeDir = await invoke("get_home_directory");
                    setCurrentPath(homeDir);
                } catch (e) {
                    setCurrentPath("/");
                }
            }
            try { setFavorites(await invoke("get_favorites")); } catch (e) { /* ignore */ }
            try { setIgnorePatterns(await invoke("get_ignore_patterns")); } catch (e) { /* ignore */ }
        };
        init();
    }, []);

    useEffect(() => {
        if (currentPath) {
            writeStoredValue(STORAGE_KEYS.currentPath, currentPath);
        }
    }, [currentPath]);

    useEffect(() => {
        writeStoredValue(STORAGE_KEYS.activeTab, activeTab);
    }, [activeTab]);

    useEffect(() => {
        writeStoredValue(STORAGE_KEYS.themeMode, themeMode);
        document.documentElement.dataset.theme = themeMode;
        document.body.dataset.theme = themeMode;
        setAppTheme(themeMode).catch(() => {
            // Ignore native theme update failures; CSS theme still applies.
        });
    }, [themeMode]);

    // Listen for tree build progress
    useEffect(() => {
        const unlisten = listen('tree-build-progress', (event) => {
            const p = event.payload;
            scanProgressRef.current = p;
            setScanProgress(p);
            const errCount = p.errors ? p.errors.length : 0;
            const errText = errCount > 0 ? ` (${errCount} errors)` : '';
            setScanProgressText(
                `Scanning: ${p.current_path} | ${p.files_processed} files, ${p.directories_processed} dirs${errText}`
            );
        });
        return () => { unlisten.then(f => f()); };
    }, []);

    useEffect(() => {
        if (!currentSnapshot?.path || !currentSnapshot?.scannedAt) {
            setStaleStatus({ stale: false, changedPath: null });
            return undefined;
        }

        let cancelled = false;
        const sinceUnixSecs = Math.floor(new Date(currentSnapshot.scannedAt).getTime() / 1000);

        const checkForChanges = async () => {
            try {
                const result = await invoke('check_path_stale', {
                    path: currentSnapshot.path,
                    sinceUnixSecs,
                });
                if (!cancelled) {
                    setStaleStatus({
                        stale: Boolean(result?.stale),
                        changedPath: result?.changed_path || null,
                    });
                }
            } catch {
                if (!cancelled) {
                    setStaleStatus({ stale: false, changedPath: null });
                }
            }
        };

        checkForChanges();
        const interval = setInterval(checkForChanges, 20000);
        const handleFocus = () => checkForChanges();
        window.addEventListener('focus', handleFocus);

        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
        };
    }, [currentSnapshot?.path, currentSnapshot?.scannedAt]);

    // ========================
    // SCAN — the only way to build state
    // ========================
    const startScan = useCallback(async (path) => {
        const scanPath = path || currentPath;
        if (!scanPath) return;
        setCurrentPath(scanPath);
        setStaleStatus({ stale: false, changedPath: null });

        // Transition state
        if (currentSnapshot) {
            setStatus(ScanStatus.RE_SCANNING);
        } else {
            setStatus(ScanStatus.SCANNING);
        }

        setScanProgress(null);
        scanProgressRef.current = null;
        setScanProgressText('Starting scan...');

        try {
            const tree = await invoke("get_file_tree_with_progress", { folderName: scanPath });
            const newVersion = versionRef.current + 1;
            versionRef.current = newVersion;

            const errors = scanProgressRef.current?.errors || [];
            const snapshot = buildSnapshot(newVersion, scanPath, tree, errors);

            // Atomic swap: old current → previous, new → current
            startTransition(() => {
                if (currentSnapshot) {
                    setPreviousSnapshot(currentSnapshot);
                }
                setCurrentSnapshot(snapshot);

                // Keep history (max 10)
                setSnapshotHistory(prev => {
                    const next = [snapshot, ...prev].slice(0, 10);
                    return next;
                });
            });

            setStatus(ScanStatus.READY);
            setScanProgressText(`Scan complete: ${snapshot.fileCount} files, ${snapshot.dirCount} dirs, ${snapshot.totalSizeH}`);
        } catch (error) {
            console.error("Scan failed:", error);
            setStatus(currentSnapshot ? ScanStatus.READY : ScanStatus.ERROR);
            setScanProgressText(`Scan failed: ${error}`);
        } finally {
            setTimeout(() => setScanProgress(null), 2000);
        }
    }, [currentPath, currentSnapshot]);

    const refreshFolder = useCallback(async (path) => {
        const refreshPath = normalizePath(path || currentSnapshot?.path || currentPath);
        if (!refreshPath) return null;

        if (!currentSnapshot?.tree) {
            await startScan(refreshPath);
            return null;
        }

        if (!isSameOrDescendantPath(currentSnapshot.path, refreshPath)) {
            throw new Error('Folder is outside the current scan snapshot.');
        }

        setStatus(ScanStatus.RE_SCANNING);
        setScanProgress(null);
        scanProgressRef.current = null;
        setScanProgressText(`Refreshing folder: ${refreshPath}`);

        try {
            const refreshedTree = await invoke("get_file_tree_with_progress", { folderName: refreshPath });
            const replacement = replaceTreeNodeByPath(currentSnapshot.tree, refreshPath, refreshedTree);

            if (!replacement.replaced) {
                throw new Error('Folder was not found in the current scan snapshot.');
            }

            const newVersion = versionRef.current + 1;
            versionRef.current = newVersion;

            const refreshErrors = scanProgressRef.current?.errors || [];
            const errors = [
                ...filterRefreshErrors(currentSnapshot.errors, refreshPath),
                ...refreshErrors,
            ];
            const snapshot = buildSnapshot(
                newVersion,
                currentSnapshot.path,
                replacement.tree,
                errors,
            );

            startTransition(() => {
                setPreviousSnapshot(currentSnapshot);
                setCurrentSnapshot(snapshot);
                setSnapshotHistory(prev => [snapshot, ...prev].slice(0, 10));
            });

            setStaleStatus({ stale: false, changedPath: null });
            setStatus(ScanStatus.READY);
            setScanProgressText(
                `Folder refreshed: ${refreshPath} | ${snapshot.fileCount} files, ${snapshot.dirCount} dirs, ${snapshot.totalSizeH}`
            );

            return snapshot;
        } catch (error) {
            console.error("Folder refresh failed:", error);
            setStatus(ScanStatus.READY);
            setScanProgressText(`Folder refresh failed: ${error}`);
            throw error;
        } finally {
            setTimeout(() => {
                setScanProgress(null);
                scanProgressRef.current = null;
            }, 2000);
        }
    }, [currentPath, currentSnapshot, startScan]);

    // Navigate to a path (doesn't scan — just sets path)
    const navigateTo = useCallback((path) => {
        setCurrentPath(path);
    }, []);

    // Navigate and immediately scan
    const navigateAndScan = useCallback(async (path) => {
        setCurrentPath(path);
        await startScan(path);
    }, [startScan]);

    // Load a historical snapshot
    const loadSnapshot = useCallback((snapshot) => {
        setPreviousSnapshot(currentSnapshot);
        setCurrentSnapshot(snapshot);
        setCurrentPath(snapshot.path);
        setStatus(ScanStatus.READY);
    }, [currentSnapshot]);

    const setActiveTab = useCallback((tabId) => {
        setActiveTabState(tabId);
    }, []);

    const setThemeMode = useCallback((nextTheme) => {
        setThemeModeState(nextTheme);
    }, []);

    // ========================
    // FAVORITES
    // ========================
    const addFavorite = useCallback(async (path, name) => {
        try {
            const fav = await invoke("add_favorite", { path, name });
            setFavorites(prev => [...prev, fav]);
            return fav;
        } catch (e) { throw e; }
    }, []);

    const removeFavorite = useCallback(async (path) => {
        try {
            await invoke("remove_favorite", { path });
            setFavorites(prev => prev.filter(f => f.path !== path));
        } catch (e) { throw e; }
    }, []);

    // ========================
    // IGNORE PATTERNS
    // ========================
    const addIgnorePattern = useCallback(async (pattern) => {
        try {
            const pat = await invoke("add_ignore_pattern", { pattern });
            setIgnorePatterns(prev => [...prev, pat]);
            return pat;
        } catch (e) { throw e; }
    }, []);

    const removeIgnorePattern = useCallback(async (pattern) => {
        try {
            await invoke("remove_ignore_pattern", { pattern });
            setIgnorePatterns(prev => prev.filter(p => p.pattern !== pattern));
        } catch (e) { throw e; }
    }, []);

    // ========================
    // Derived helpers
    // ========================
    const isScanning = status === ScanStatus.SCANNING || status === ScanStatus.RE_SCANNING;
    const hasData = currentSnapshot !== null;
    const scannedTimeAgo = currentSnapshot ? timeAgo(currentSnapshot.scannedAt) : null;
    const isFavorite = favorites.some(f => f.path === currentPath);

    const value = {
        // State machine
        status,
        isScanning,
        hasData,

        // Path
        currentPath,
        navigateTo,
        navigateAndScan,

        // Snapshots
        currentSnapshot,
        previousSnapshot,
        snapshotHistory,
        loadSnapshot,
        scannedTimeAgo,

        // Scan control
        startScan,
        refreshFolder,

        // Progress
        scanProgress,
        scanProgressText,

        // Workbench preferences
        activeTab,
        setActiveTab,
        themeMode,
        setThemeMode,
        staleStatus,

        // Favorites
        favorites,
        isFavorite,
        addFavorite,
        removeFavorite,

        // Ignore patterns
        ignorePatterns,
        addIgnorePattern,
        removeIgnorePattern,
    };

    return (
        <ScanStateContext.Provider value={value}>
            {children}
        </ScanStateContext.Provider>
    );
};
