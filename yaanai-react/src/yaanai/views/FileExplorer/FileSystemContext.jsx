import React, { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";

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
    const [treeData, setTreeData] = useState(null); // Shared tree data
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [progressText, setProgressText] = useState("");
    const [scanErrors, setScanErrors] = useState([]); // List of scan errors

    // Initialize home directory
    useEffect(() => {
        const getHomeDirectory = async () => {
            try {
                const homeDir = await invoke("get_home_directory");
                setCurrentPath(homeDir);
            } catch (error) {
                console.error("Failed to get home directory:", error);
                setCurrentPath("/");
            }
        };
        getHomeDirectory();
    }, []);

    // Listen for tree build progress events
    useEffect(() => {
        const unlisten = listen('tree-build-progress', (event) => {
            const progressData = event.payload;
            setProgress(progressData);
            
            // Update progress text with error count if errors exist
            const errorCount = progressData.errors ? progressData.errors.length : 0;
            const errorText = errorCount > 0 ? ` (${errorCount} errors)` : '';
            setProgressText(`Scanning: ${progressData.current_path} (${progressData.files_processed} files, ${progressData.directories_processed} dirs)${errorText}`);

            // Store errors
            if (progressData.errors && progressData.errors.length > 0) {
                setScanErrors(progressData.errors);
            }

            // Show partial tree data for progressive visualization
            if (progressData.partial_tree) {
                setTreeData(progressData.partial_tree);
            }
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    // Shared scan function
    const scanDirectory = async (path) => {
        if (!path) return;

        setLoading(true);
        setProgress(null);
        setProgressText("Starting tree scan...");
        setScanErrors([]); // Clear previous errors

        try {
            console.log("Fetching tree with progress for:", path);
            const tree = await invoke("get_file_tree_with_progress", { folderName: path });
            console.log("Tree received:", tree);

            // Cache the tree data globally
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
            // Don't clear progress/errors immediately - let user see the results
            setTimeout(() => {
                setProgress(null);
            }, 2000);
        }
    };

    // Shared analysis functions that use the cached tree
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

    const findDuplicates = async () => {
        if (!treeData) {
            await scanDirectory(currentPath);
            return;
        }

        setLoading(true);
        try {
            const duplicates = await invoke("get_files_map", { folderName: currentPath });
            return duplicates;
        } catch (error) {
            console.error("Duplicate analysis failed:", error);
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

    // Choose folder function
    const chooseFolder = async () => {
        try {
            console.log("Opening folder picker...");
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: currentPath || undefined,
            });
            console.log("Folder picker result:", selected);
            if (selected) {
                setCurrentPath(selected);
                console.log("Set current path to:", selected);
            } else {
                console.log("No folder selected");
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

        // Actions
        setCurrentPath,
        scanDirectory,
        analyzeDiskUsage,
        findDuplicates,
        listFiles,
        chooseFolder,
        setScanErrors,
    };

    return (
        <FileSystemContext.Provider value={value}>
            {children}
        </FileSystemContext.Provider>
    );
};