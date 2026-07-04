/**
 * FileBrowserTool — Browse files from the scanned state.
 *
 * Unlike FileExplorer which calls the backend, this reads
 * directly from the current snapshot tree for instant navigation.
 * Only falls back to backend for unscanned paths.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useScanState } from '../state/ScanStateContext';
import { CButton, CBadge } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilFolder, cilFile, cilTrash, cilArrowLeft, cilExternalLink, cilImage, cilSync, cilVideo } from '@coreui/icons';
import { formatBytes, isDirectoryNode } from '../utils/treeAnalysis';
import { filePreviewSrc, isImagePath, isPreviewableMediaPath, isVideoPath, revealInFinder } from '../utils/fileActions';

// Find a node in the tree by path
function findNode(tree, path) {
    if (!tree) return null;
    if (tree.disk_entry?.path === path) return tree;
    if (tree.children) {
        for (const child of tree.children) {
            const found = findNode(child, path);
            if (found) return found;
        }
    }
    return null;
}

export default function FileBrowserTool() {
    const { currentSnapshot, hasData, refreshFolder, isScanning } = useScanState();

    const [browsePath, setBrowsePath] = useState(null);
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [sortBy, setSortBy] = useState('size');
    const [sortAsc, setSortAsc] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [refreshingPath, setRefreshingPath] = useState(null);
    const [refreshError, setRefreshError] = useState('');
    const [previewNode, setPreviewNode] = useState(null);
    const [previewError, setPreviewError] = useState(false);

    // Start at the scanned root
    useEffect(() => {
        if (currentSnapshot?.path) {
            setBrowsePath(currentSnapshot.path);
            setPreviewNode(null);
            setRefreshError('');
        }
    }, [currentSnapshot?.path]);

    // Get the children of the current browse path from the snapshot tree
    const { currentNode, children } = useMemo(() => {
        if (!currentSnapshot?.tree || !browsePath) {
            return { currentNode: null, children: [] };
        }
        const node = findNode(currentSnapshot.tree, browsePath);
        if (!node) return { currentNode: null, children: [] };
        const kids = node.children || [];
        return { currentNode: node, children: kids };
    }, [currentSnapshot, browsePath]);

    // Sort children
    const sortedChildren = useMemo(() => {
        const sorted = [...children].sort((a, b) => {
            // Directories first
            if (isDirectoryNode(a) && !isDirectoryNode(b)) return -1;
            if (!isDirectoryNode(a) && isDirectoryNode(b)) return 1;

            let cmp = 0;
            switch (sortBy) {
                case 'name':
                    cmp = (a.disk_entry?.path || '').localeCompare(b.disk_entry?.path || '');
                    break;
                case 'size':
                    cmp = (a.disk_entry?.size || 0) - (b.disk_entry?.size || 0);
                    break;
                default:
                    cmp = 0;
            }
            return sortAsc ? cmp : -cmp;
        });
        return sorted;
    }, [children, sortBy, sortAsc]);

    function navigateInto(path) {
        setBrowsePath(path);
        setSelectedPaths(new Set());
        setPreviewNode(null);
        setPreviewError(false);
        setRefreshError('');
    }

    function navigateUp() {
        if (!browsePath) return;
        const parent = browsePath.substring(0, browsePath.lastIndexOf('/'));
        if (parent) {
            setBrowsePath(parent);
            setSelectedPaths(new Set());
            setPreviewNode(null);
            setPreviewError(false);
            setRefreshError('');
        }
    }

    function toggleSort(col) {
        if (sortBy === col) setSortAsc(!sortAsc);
        else { setSortBy(col); setSortAsc(false); }
    }

    function toggleSelect(path) {
        setSelectedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }

    function openPreview(node) {
        if (!node?.disk_entry?.path || !isPreviewableMediaPath(node.disk_entry.path)) return;
        setPreviewNode(node);
        setPreviewError(false);
    }

    async function handleReveal(path) {
        try {
            await revealInFinder(path);
        } catch (error) {
            console.error("Reveal failed:", error);
        }
    }

    async function handleRefreshFolder(path) {
        if (!path || refreshingPath || isScanning) return;
        setRefreshingPath(path);
        setRefreshError('');
        try {
            await refreshFolder(path);
        } catch (error) {
            const message = error?.message || String(error);
            setRefreshError(message);
            console.error("Folder refresh failed:", error);
        } finally {
            setRefreshingPath(null);
        }
    }

    async function handleDelete() {
        if (selectedPaths.size === 0) return;
        setDeleting(true);
        try {
            await invoke("delete_files", {
                paths: Array.from(selectedPaths),
                useTrash: true,
            });
            setSelectedPaths(new Set());
        } catch (e) {
            console.error("Delete failed:", e);
        }
        setDeleting(false);
    }

    if (!hasData) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                Scan a directory to browse files.
            </div>
        );
    }

    const previewEntry = previewNode?.disk_entry;
    const previewPath = previewEntry?.path || '';
    const previewSrc = previewPath ? filePreviewSrc(previewPath) : '';
    const previewIsImage = previewPath ? isImagePath(previewPath) : false;
    const previewIsVideo = previewPath ? isVideoPath(previewPath) : false;
    const previewable = previewIsImage || previewIsVideo;
    const currentSize = formatBytes(currentNode?.disk_entry?.size);

    return (
        <div className="d-flex flex-column h-100">
            {/* Toolbar */}
            <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-light" style={{ fontSize: '12px' }}>
                <CButton size="sm" color="light" onClick={navigateUp}
                    disabled={!browsePath || browsePath === currentSnapshot?.path}
                    title="Go up">
                    <CIcon icon={cilArrowLeft} size="sm" />
                </CButton>

                {/* Breadcrumb path */}
                <div className="flex-grow-1 text-truncate" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {browsePath || '/'}
                </div>

                {refreshError && (
                    <span className="text-danger text-truncate" style={{ maxWidth: '260px' }} title={refreshError}>
                        {refreshError}
                    </span>
                )}

                {selectedPaths.size > 0 && (
                    <>
                        <CBadge color="primary">{selectedPaths.size} selected</CBadge>
                        <CButton size="sm" color="danger" onClick={handleDelete} disabled={deleting}>
                            <CIcon icon={cilTrash} size="sm" className="me-1" />
                            Move to Trash
                        </CButton>
                    </>
                )}

                <CButton
                    size="sm"
                    color="light"
                    onClick={() => handleRefreshFolder(browsePath)}
                    disabled={!currentNode || isScanning || Boolean(refreshingPath)}
                    title="Refresh this folder"
                >
                    <CIcon
                        icon={cilSync}
                        size="sm"
                        className={refreshingPath === browsePath ? 'spin me-1' : 'me-1'}
                    />
                    {refreshingPath === browsePath ? 'Refreshing...' : 'Refresh Folder'}
                </CButton>

                <span className="file-browser-summary">
                    <strong>{currentSize}</strong>
                    <span className="text-muted">{sortedChildren.length} items</span>
                </span>
            </div>

            {/* File list */}
            <div className="file-browser-content flex-grow-1">
                <div className="file-browser-table-wrap">
                    <table className="table table-sm table-hover mb-0 file-browser-table">
                        <thead className="table-light sticky-top">
                            <tr>
                                <th style={{ width: '30px' }}></th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                                    Name {sortBy === 'name' && (sortAsc ? '\u25B2' : '\u25BC')}
                                </th>
                                <th className="file-size-header"
                                    onClick={() => toggleSort('size')}>
                                    Size {sortBy === 'size' && (sortAsc ? '\u25B2' : '\u25BC')}
                                </th>
                                <th className="file-type-header">Type</th>
                                <th className="file-actions-header"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedChildren.map((child) => {
                                const path = child.disk_entry?.path;
                                const name = path?.split('/').pop() || '';
                                const isDir = isDirectoryNode(child);
                                const selected = selectedPaths.has(path);
                                const imageFile = !isDir && isImagePath(path);
                                const videoFile = !isDir && isVideoPath(path);
                                const mediaFile = imageFile || videoFile;
                                const folderRefreshing = refreshingPath === path;

                                return (
                                    <tr
                                        key={path}
                                        className={selected ? 'table-primary' : ''}
                                        onClick={() => {
                                            if (isDir) navigateInto(path);
                                            else if (mediaFile) openPreview(child);
                                        }}
                                    >
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <input type="checkbox" checked={selected}
                                                onChange={() => toggleSelect(path)} />
                                        </td>
                                        <td className="file-name-cell">
                                            <span
                                                className={isDir ? 'file-row-name is-folder' : 'file-row-name'}
                                                title={path}
                                            >
                                                <CIcon icon={isDir ? cilFolder : cilFile}
                                                    size="sm"
                                                    className={`me-1 ${isDir ? 'text-warning' : 'text-primary'}`} />
                                                {isDir ? <strong>{name}</strong> : name}
                                            </span>
                                        </td>
                                        <td className="file-size-cell" title={formatBytes(child.disk_entry?.size)}>
                                            {formatBytes(child.disk_entry?.size)}
                                        </td>
                                        <td className="file-type-cell">
                                            {isDir ? 'DIR' : (name.includes('.') ? name.split('.').pop().toUpperCase() : '')}
                                        </td>
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <div className="d-flex justify-content-end gap-1">
                                                {isDir && (
                                                    <CButton
                                                        size="sm"
                                                        color="light"
                                                        className="py-0 px-1"
                                                        onClick={() => handleRefreshFolder(path)}
                                                        disabled={isScanning || Boolean(refreshingPath)}
                                                        title="Refresh folder"
                                                    >
                                                        <CIcon
                                                            icon={cilSync}
                                                            size="sm"
                                                            className={folderRefreshing ? 'spin' : ''}
                                                        />
                                                    </CButton>
                                                )}
                                                {mediaFile && (
                                                    <CButton
                                                        size="sm"
                                                        color="light"
                                                        className="py-0 px-1"
                                                        onClick={() => openPreview(child)}
                                                        title={videoFile ? 'Preview video' : 'Preview image'}
                                                    >
                                                        <CIcon icon={videoFile ? cilVideo : cilImage} size="sm" />
                                                    </CButton>
                                                )}
                                                <CButton
                                                    size="sm"
                                                    color="light"
                                                    className="py-0 px-1"
                                                    onClick={() => handleReveal(path)}
                                                    title="Reveal in Finder"
                                                >
                                                    <CIcon icon={cilExternalLink} size="sm" />
                                                </CButton>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedChildren.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center text-muted py-4">
                                        {currentNode ? 'Empty directory' : 'Path not found in scan data'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {previewEntry && previewable && (
                    <aside className="file-preview-panel">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                            <div className="fw-semibold text-truncate" title={previewEntry.name}>
                                {previewEntry.name}
                            </div>
                            <CButton size="sm" color="light" className="py-0 px-2" onClick={() => setPreviewNode(null)}>
                                Close
                            </CButton>
                        </div>
                        <div className="file-preview-frame">
                            {previewSrc && previewIsImage && !previewError ? (
                                <img
                                    src={previewSrc}
                                    alt={previewEntry.name}
                                    className="file-preview-image"
                                    onLoad={() => setPreviewError(false)}
                                    onError={() => setPreviewError(true)}
                                />
                            ) : previewSrc && previewIsVideo && !previewError ? (
                                <video
                                    src={previewSrc}
                                    className="file-preview-video"
                                    controls
                                    preload="metadata"
                                    onLoadedMetadata={() => setPreviewError(false)}
                                    onError={() => setPreviewError(true)}
                                />
                            ) : (
                                <div className="file-preview-empty text-muted">
                                    Preview unavailable
                                </div>
                            )}
                        </div>
                        <div className="mt-2 small text-muted">
                            <div>{formatBytes(previewEntry.size)}</div>
                            <div className="text-truncate" title={previewPath}>{previewPath}</div>
                        </div>
                        <CButton
                            size="sm"
                            color="outline-secondary"
                            className="mt-2 w-100"
                            onClick={() => handleReveal(previewPath)}
                        >
                            <CIcon icon={cilExternalLink} size="sm" className="me-1" />
                            Reveal in Finder
                        </CButton>
                    </aside>
                )}
            </div>
        </div>
    );
}
