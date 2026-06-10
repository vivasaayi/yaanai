import React, { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

// Create the context
const FileSystemContext = createContext();

// Custom hook to use the FileSystem context
export const useFileSystem = () => {
    const context = useContext(FileSystemContext);
    if (!context) {
        throw new Error('useFileSystem must be used within a FileSystemProvider');
    }
    return context;
};

// Provider component
export const FileSystemProvider = ({ children }) => {
    // Shared state across all file system components
    const [currentPath, setCurrentPath] = useState("");
    const [treeData, setTreeData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [progressText, setProgressText] = useState("");
    const [scanErrors, setScanErrors] = useState([]);

    // Favorites & ignore patterns
    const [favorites, setFavorites] = useState([]);
    const [ignorePatterns, setIgnorePatterns] = useState([]);

    // Initialize home directory and load persisted data
    useEffect(() => {
        const init = async () => {
            try {
                const homeDir = await invoke("get_home_directory");
                setCurrentPath(homeDir);
            } catch (error) {
                console.error("Failed to get home directory:", error);
                setCurrentPath("/");
            }

            // Load favorites and ignore patterns from DB
            try {
                const favs = await invoke("get_favorites");
                setFavorites(favs);
            } catch (e) {
                console.error("Failed to load favorites:", e);
            }
            try {
                const patterns = await invoke("get_ignore_patterns");
                setIgnorePatterns(patterns);
            } catch (e) {
                console.error("Failed to load ignore patterns:", e);
            }
        };
        init();
    }, []);

    // Listen for tree build progress events
    useEffect(() => {
        const unlisten = listen('tree-build-progress', (event) => {
            const progressData = event.payload;
            setProgress(progressData);

            const errorCount = progressData.errors ? progressData.errors.length : 0;
            const errorText = errorCount > 0 ? ` (${errorCount} errors)` : '';
            setProgressText(`Scanning: ${progressData.current_path} (${progressData.files_processed} files, ${progressData.directories_processed} dirs)${errorText}`);

            if (progressData.errors && progressData.errors.length > 0) {
                setScanErrors(progressData.errors);
            }

            if (progressData.partial_tree) {
                setTreeData(progressData.partial_tree);
            }
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    // --- Tree / Disk Usage ---

    const scanDirectory = async (path) => {
        if (!path) return;
        setLoading(true);
        setProgress(null);
        setProgressText("Starting tree scan...");
        setScanErrors([]);
        try {
            const tree = await invoke("get_file_tree_with_progress", { folderName: path });
            setTreeData(tree);
            const errorCount = scanErrors.length;
            setProgressText(errorCount > 0
                ? `Scan complete with ${errorCount} errors. Check error list below.`
                : "Scan complete! Select analysis type."
            );
        } catch (error) {
            console.error("Failed to fetch tree:", error);
            setTreeData(null);
            setProgressText("Scan failed");
        } finally {
            setLoading(false);
            setTimeout(() => setProgress(null), 2000);
        }
    };

    const analyzeDiskUsage = async () => {
        if (!treeData) {
            await scanDirectory(currentPath);
            return;
        }
        setLoading(true);
        try {
            const diskUsage = await invoke("analyze_disk_usage", { folderName: currentPath });
            return diskUsage;
        } catch (error) {
            console.error("Disk analysis failed:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const listFiles = async () => {
        setLoading(true);
        try {
            const files = await invoke("recursively_list_files", { folderName: currentPath });
            return files;
        } catch (error) {
            console.error("File listing failed:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    // --- File Search ---

    const searchFiles = async (pattern, options = {}) => {
        setLoading(true);
        setProgressText(`Searching for "${pattern}"...`);
        try {
            const result = await invoke("search_files", {
                folderName: currentPath,
                pattern,
                recursive: options.recursive !== undefined ? options.recursive : true,
                extensions: options.extensions || null,
                minSize: options.minSize || null,
                maxSize: options.maxSize || null,
            });
            setProgressText(`Found ${result.total_matches} matches in ${result.files_searched} files`);
            return result;
        } catch (error) {
            console.error("Search failed:", error);
            setProgressText("Search failed");
            throw error;
        } finally {
            setLoading(false);
        }
    };

    // --- File Operations ---

    const deleteFiles = async (paths, useTrash = true) => {
        setLoading(true);
        setProgressText(`Deleting ${paths.length} file(s)...`);
        try {
            const result = await invoke("delete_files", { paths, useTrash });
            setProgressText(
                `Deleted ${result.deleted.length} file(s), freed ${result.total_size_freed_h}` +
                (result.failed.length > 0 ? ` (${result.failed.length} failed)` : '')
            );
            return result;
        } catch (error) {
            console.error("Delete failed:", error);
            setProgressText("Delete failed");
            throw error;
        } finally {
            setLoading(false);
        }
    };

    // --- Export ---

    const exportReport = async (format, reportType, filePath, folderName) => {
        setLoading(true);
        setProgressText(`Exporting ${reportType} as ${format}...`);
        try {
            const resultPath = await invoke("export_report", {
                format,
                reportType,
                filePath,
                folderName: folderName || currentPath,
            });
            setProgressText(`Exported to ${resultPath}`);
            return resultPath;
        } catch (error) {
            console.error("Export failed:", error);
            setProgressText("Export failed");
            throw error;
        } finally {
            setLoading(false);
        }
    };

    // --- Favorites ---

    const addFavorite = async (path, name) => {
        try {
            const fav = await invoke("add_favorite", { path, name });
            setFavorites(prev => [...prev, fav]);
            return fav;
        } catch (error) {
            console.error("Failed to add favorite:", error);
            throw error;
        }
    };

    const removeFavorite = async (path) => {
        try {
            await invoke("remove_favorite", { path });
            setFavorites(prev => prev.filter(f => f.path !== path));
        } catch (error) {
            console.error("Failed to remove favorite:", error);
            throw error;
        }
    };

    // --- Ignore Patterns ---

    const addIgnorePattern = async (pattern) => {
        try {
            const pat = await invoke("add_ignore_pattern", { pattern });
            setIgnorePatterns(prev => [...prev, pat]);
            return pat;
        } catch (error) {
            console.error("Failed to add ignore pattern:", error);
            throw error;
        }
    };

    const removeIgnorePattern = async (pattern) => {
        try {
            await invoke("remove_ignore_pattern", { pattern });
            setIgnorePatterns(prev => prev.filter(p => p.pattern !== pattern));
        } catch (error) {
            console.error("Failed to remove ignore pattern:", error);
            throw error;
        }
    };

    // --- Choose Folder ---

    const chooseFolder = async () => {
        try {
            const selected = await openDialog({
                directory: true,
                multiple: false,
                defaultPath: currentPath || undefined,
            });
            if (selected) {
                setCurrentPath(selected);
            }
        } catch (error) {
            console.error("Failed to open folder picker:", error);
        }
    };

    const value = {
        // State
        currentPath,
        treeData,
        loading,
        progress,
        progressText,
        scanErrors,
        favorites,
        ignorePatterns,

        // Actions
        setCurrentPath,
        scanDirectory,
        analyzeDiskUsage,
        listFiles,
        searchFiles,
        deleteFiles,
        exportReport,
        addFavorite,
        removeFavorite,
        addIgnorePattern,
        removeIgnorePattern,
        chooseFolder,
        setScanErrors,
    };

    return (
        <FileSystemContext.Provider value={value}>
            {children}
        </FileSystemContext.Provider>
    );
};
