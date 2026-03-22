import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import React, {useState, useEffect} from "react";
import { useFileSystem } from './FileSystemContext';
import {
    CButton, CCard, CCardBody, CCardHeader,
    CCol, CRow, CBadge, CFormCheck
} from "@coreui/react";
import CIcon from '@coreui/icons-react';
import { cilFolder, cilFile, cilTrash, cilStar, cilSearch } from '@coreui/icons';
import { DataGrid, Column } from 'devextreme-react/data-grid';
import 'devextreme/dist/css/dx.light.css';

function FileExplorer() {
    const {
        currentPath, loading, setCurrentPath, listFiles, searchFiles,
        deleteFiles, addFavorite, favorites, progressText
    } = useFileSystem();

    const [stack, setStack] = useState([]);
    const [files, setFiles] = useState([]);
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [searchMode, setSearchMode] = useState(false);
    const [searchPattern, setSearchPattern] = useState('');
    const [searchResults, setSearchResults] = useState(null);

    async function fetchFiles() {
        try {
            const fileList = await listFiles();
            if (fileList) {
                setFiles(fileList);
                setSearchMode(false);
                setSearchResults(null);
            }
        } catch (error) {
            setFiles([]);
        }
    }

    async function chooseFolder() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: currentPath
            });
            if (selected && typeof selected === 'string') {
                setStack([]);
                setCurrentPath(selected);
            }
        } catch (error) {
            console.error("Failed to open folder picker:", error);
        }
    }

    async function handleSearch() {
        if (!searchPattern.trim()) return;
        try {
            const result = await searchFiles(searchPattern);
            if (result) {
                setSearchResults(result);
                setSearchMode(true);
                // Convert search results to same shape as file list
                setFiles(result.results.map(r => ({
                    name: r.name,
                    path: r.path,
                    size: r.size,
                    size_h: r.size_h,
                    is_dir: r.is_dir,
                    is_file: !r.is_dir,
                    matched_on: r.matched_on,
                })));
            }
        } catch (error) {
            console.error("Search failed:", error);
        }
    }

    async function handleDelete() {
        if (selectedPaths.size === 0) return;
        const paths = Array.from(selectedPaths);
        if (!confirm(`Move ${paths.length} item(s) to trash?`)) return;
        try {
            const result = await deleteFiles(paths, true);
            if (result) {
                setSelectedPaths(new Set());
                await fetchFiles(); // Refresh
            }
        } catch (error) {
            console.error("Delete failed:", error);
        }
    }

    async function handleAddFavorite() {
        const name = currentPath.split('/').pop() || currentPath;
        try {
            await addFavorite(currentPath, name);
        } catch (error) {
            console.error("Failed to add favorite:", error);
        }
    }

    // Initialize
    useEffect(() => {
        if (!currentPath) {
            invoke("get_home_directory").then(setCurrentPath).catch(() => setCurrentPath("/"));
        }
    }, [currentPath]);

    // Fetch files when path changes
    useEffect(() => {
        if (currentPath) {
            fetchFiles();
        }
    }, [currentPath]);

    function handlePathChange(e) {
        const path = e.target.getAttribute("data-path");
        if (path) {
            setStack(prev => [...prev, currentPath]);
            setCurrentPath(path);
        }
    }

    function navBack() {
        if (stack.length <= 0) return;
        const prev = stack[stack.length - 1];
        setStack(s => s.slice(0, -1));
        setCurrentPath(prev);
    }

    function toggleSelection(path) {
        setSelectedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }

    function renderFileName(data) {
        if (data.data.is_dir) {
            return (
                <span data-path={data.data.path} onClick={handlePathChange} style={{ cursor: 'pointer' }}>
                    <CIcon className="text-success" data-path={data.data.path} icon={cilFolder}/>
                    <b data-path={data.data.path}> {data.value}</b>
                </span>
            );
        }
        return (
            <span>
                <CIcon icon={cilFile}/> {data.value}
            </span>
        );
    }

    const isFavorited = favorites.some(f => f.path === currentPath);

    return (
        <CRow>
            <CCol xs={12}>
                <CCard className="mb-4">
                    <CCardHeader>
                        <div className="d-flex justify-content-between align-items-center">
                            <span>File Explorer</span>
                            {searchMode && searchResults && (
                                <CBadge color="info">{searchResults.total_matches} matches</CBadge>
                            )}
                        </div>
                    </CCardHeader>
                    <CCardBody>
                        {/* Control Panel */}
                        <div className="mb-3">
                            <div className="d-flex gap-2 align-items-center mb-2">
                                <CButton onClick={chooseFolder} color="secondary" size="sm">
                                    Choose Folder
                                </CButton>
                                <div className="flex-grow-1">
                                    <input type="text" className="form-control form-control-sm"
                                        value={currentPath}
                                        onChange={(e) => setCurrentPath(e.target.value)}
                                        placeholder="Enter folder path..." disabled={loading} />
                                </div>
                                <CButton onClick={fetchFiles}
                                    color={files.length > 0 ? "success" : "primary"}
                                    disabled={loading || !currentPath} size="sm">
                                    {loading ? "Scanning..." : files.length > 0 ? "Refresh" : "List Files"}
                                </CButton>
                                {stack.length > 0 && (
                                    <CButton onClick={navBack} color="secondary" size="sm">Back</CButton>
                                )}
                                <CButton onClick={handleAddFavorite}
                                    color={isFavorited ? "warning" : "outline-warning"} size="sm"
                                    title="Add to favorites">
                                    <CIcon icon={cilStar} />
                                </CButton>
                            </div>

                            {/* Search bar */}
                            <div className="d-flex gap-2 align-items-center mb-2">
                                <CIcon icon={cilSearch} className="text-muted" />
                                <input type="text" className="form-control form-control-sm"
                                    value={searchPattern}
                                    onChange={(e) => setSearchPattern(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder="Search files (regex, glob, or substring)..." />
                                <CButton onClick={handleSearch} color="info" size="sm" disabled={loading || !searchPattern.trim()}>
                                    Search
                                </CButton>
                                {searchMode && (
                                    <CButton onClick={() => { setSearchMode(false); fetchFiles(); }}
                                        color="outline-secondary" size="sm">
                                        Clear
                                    </CButton>
                                )}
                            </div>

                            {/* Actions bar */}
                            {selectedPaths.size > 0 && (
                                <div className="d-flex gap-2 align-items-center mb-2">
                                    <CBadge color="primary">{selectedPaths.size} selected</CBadge>
                                    <CButton onClick={handleDelete} color="danger" size="sm">
                                        <CIcon icon={cilTrash} className="me-1" />
                                        Move to Trash
                                    </CButton>
                                    <CButton onClick={() => setSelectedPaths(new Set())}
                                        color="outline-secondary" size="sm">
                                        Deselect All
                                    </CButton>
                                </div>
                            )}

                            {/* Status */}
                            {currentPath && !loading && (
                                <div className="small text-muted">
                                    {files.length > 0 ? `${files.length} items listed` : 'Ready to scan'}
                                    {progressText && ` | ${progressText}`}
                                </div>
                            )}
                        </div>

                        <DataGrid id="dataGrid" dataSource={files} className="mt-3"
                            showBorders={true} columnAutoWidth={true}
                            onSelectionChanged={(e) => {
                                const paths = new Set(e.selectedRowsData.map(r => r.path));
                                setSelectedPaths(paths);
                            }}
                            selection={{ mode: 'multiple', showCheckBoxesMode: 'always' }}>
                            <Column dataField="name" cellRender={renderFileName} />
                            <Column dataField="path" />
                            <Column dataField="size_h" caption="Size" width={100} />
                            <Column dataField="is_dir" caption="Dir" width={60} />
                            {searchMode && <Column dataField="matched_on" caption="Match" width={80} />}
                        </DataGrid>
                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    );
}

export default FileExplorer;
