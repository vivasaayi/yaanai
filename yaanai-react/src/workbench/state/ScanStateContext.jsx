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

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Scan status enum
export const ScanStatus = Object.freeze({
    IDLE: 'IDLE',
    SCANNING: 'SCANNING',
    READY: 'READY',
    RE_SCANNING: 'RE_SCANNING',
    ERROR: 'ERROR',
});

const ScanStateContext = createContext();

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

function computeTreeStats(tree) {
    if (!tree) return { fileCount: 0, dirCount: 0, totalSize: 0 };

    let fileCount = 0;
    let dirCount = 0;

    function walk(node) {
        if (!node) return;
        if (node.node_type === 'file') fileCount++;
        else if (node.node_type === 'directory') dirCount++;
        if (node.children) {
            node.children.forEach(walk);
        }
    }

    walk(tree);
    const totalSize = tree.disk_entry?.size || 0;
    return { fileCount, dirCount, totalSize };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
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
    const [currentPath, setCurrentPath] = useState('');
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
            try {
                const homeDir = await invoke("get_home_directory");
                setCurrentPath(homeDir);
            } catch (e) {
                setCurrentPath("/");
            }
            try { setFavorites(await invoke("get_favorites")); } catch (e) { /* ignore */ }
            try { setIgnorePatterns(await invoke("get_ignore_patterns")); } catch (e) { /* ignore */ }
        };
        init();
    }, []);

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

    // ========================
    // SCAN — the only way to build state
    // ========================
    const startScan = useCallback(async (path) => {
        const scanPath = path || currentPath;
        if (!scanPath) return;

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
            if (currentSnapshot) {
                setPreviousSnapshot(currentSnapshot);
            }
            setCurrentSnapshot(snapshot);

            // Keep history (max 10)
            setSnapshotHistory(prev => {
                const next = [snapshot, ...prev].slice(0, 10);
                return next;
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
