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
 * Only ScanController can trigger scans. Tools are read-only consumers.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { setTheme as setAppTheme } from '@tauri-apps/api/app';
import { computeTreeStats, formatBytes } from '../utils/treeAnalysis';

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

function timeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
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
        setScanProgressText('Starting scan...');

        try {
            const tree = await invoke("get_file_tree_with_progress", { folderName: scanPath });
            const newVersion = versionRef.current + 1;
            versionRef.current = newVersion;

            const errors = scanProgress?.errors || [];
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
    }, [currentPath, currentSnapshot, scanProgress]);

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

        // Scan control (only ScanController should use this)
        startScan,

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
