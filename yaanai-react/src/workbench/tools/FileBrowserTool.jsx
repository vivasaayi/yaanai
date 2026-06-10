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
import { cilFolder, cilFile, cilTrash, cilArrowLeft, cilExternalLink, cilImage } from '@coreui/icons';
import { formatBytes, isDirectoryNode } from '../utils/treeAnalysis';
import { imagePreviewSrc, isImagePath, revealInFinder } from '../utils/fileActions';

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
    const { currentSnapshot, hasData } = useScanState();

    const [browsePath, setBrowsePath] = useState(null);
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [sortBy, setSortBy] = useState('size');
    const [sortAsc, setSortAsc] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [previewNode, setPreviewNode] = useState(null);
    const [previewError, setPreviewError] = useState(false);

    // Start at the scanned root
    useEffect(() => {
        if (currentSnapshot?.path) {
            setBrowsePath(currentSnapshot.path);
            setPreviewNode(null);
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
    }

    function navigateUp() {
        if (!browsePath) return;
        const parent = browsePath.substring(0, browsePath.lastIndexOf('/'));
        if (parent) {
            setBrowsePath(parent);
            setSelectedPaths(new Set());
            setPreviewNode(null);
            setPreviewError(false);
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
        if (!node?.disk_entry?.path || !isImagePath(node.disk_entry.path)) return;
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
    const previewSrc = previewPath ? imagePreviewSrc(previewPath) : '';

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

                {selectedPaths.size > 0 && (
                    <>
                        <CBadge color="primary">{selectedPaths.size} selected</CBadge>
                        <CButton size="sm" color="danger" onClick={handleDelete} disabled={deleting}>
                            <CIcon icon={cilTrash} size="sm" className="me-1" />
                            Move to Trash
                        </CButton>
                    </>
                )}

                <span className="text-muted">{sortedChildren.length} items</span>
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
                                <th style={{ width: '100px', cursor: 'pointer', textAlign: 'right' }}
                                    onClick={() => toggleSort('size')}>
                                    Size {sortBy === 'size' && (sortAsc ? '\u25B2' : '\u25BC')}
                                </th>
                                <th style={{ width: '60px' }}>Type</th>
                                <th style={{ width: '78px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedChildren.map((child) => {
                                const path = child.disk_entry?.path;
                                const name = path?.split('/').pop() || '';
                                const isDir = isDirectoryNode(child);
                                const selected = selectedPaths.has(path);
                                const imageFile = !isDir && isImagePath(path);

                                return (
                                    <tr
                                        key={path}
                                        className={selected ? 'table-primary' : ''}
                                        onClick={() => {
                                            if (isDir) navigateInto(path);
                                            else if (imageFile) openPreview(child);
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
                                        <td className="text-end text-muted">
                                            {formatBytes(child.disk_entry?.size)}
                                        </td>
                                        <td className="text-muted">
                                            {isDir ? 'DIR' : (name.includes('.') ? name.split('.').pop().toUpperCase() : '')}
                                        </td>
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <div className="d-flex justify-content-end gap-1">
                                                {imageFile && (
                                                    <CButton
                                                        size="sm"
                                                        color="light"
                                                        className="py-0 px-1"
                                                        onClick={() => openPreview(child)}
                                                        title="Preview image"
                                                    >
                                                        <CIcon icon={cilImage} size="sm" />
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

                {previewEntry && isImagePath(previewPath) && (
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
                            {previewSrc && !previewError ? (
                                <img
                                    src={previewSrc}
                                    alt={previewEntry.name}
                                    className="file-preview-image"
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
