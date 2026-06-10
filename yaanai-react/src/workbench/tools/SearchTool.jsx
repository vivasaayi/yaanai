/**
 * SearchTool — Search files using regex, glob, or substring patterns.
 *
 * Searches the current central scan snapshot instead of walking the filesystem.
 */

import React, { useEffect, useState } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useScanState } from '../state/ScanStateContext';
import { CButton, CBadge, CFormCheck } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilExternalLink, cilFile, cilFolder, cilSearch, cilTrash } from '@coreui/icons';
import { searchTree } from '../utils/treeAnalysis';
import { revealInFinder } from '../utils/fileActions';

export default function SearchTool() {
    const { currentSnapshot, hasData } = useScanState();

    const [pattern, setPattern] = useState('');
    const [extensions, setExtensions] = useState('');
    const [minSizeMB, setMinSizeMB] = useState('');
    const [maxSizeMB, setMaxSizeMB] = useState('');
    const [recursive, setRecursive] = useState(true);
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        setResults(null);
        setSelectedPaths(new Set());
    }, [currentSnapshot?.version]);

    async function handleSearch() {
        if (!pattern.trim() || !currentSnapshot?.tree) return;
        setSearching(true);
        setResults(null);
        setSelectedPaths(new Set());
        try {
            const extList = extensions.trim()
                ? extensions.split(',').map(e => e.trim()).filter(Boolean)
                : null;
            const minSize = minSizeMB ? Math.floor(parseFloat(minSizeMB) * 1024 * 1024) : null;
            const maxSize = maxSizeMB ? Math.floor(parseFloat(maxSizeMB) * 1024 * 1024) : null;

            const result = searchTree(currentSnapshot.tree, {
                pattern: pattern.trim(),
                recursive,
                extensions: extList,
                minSize,
                maxSize,
            });
            setResults(result);
        } catch (e) {
            console.error("Search failed:", e);
        }
        setSearching(false);
    }

    function toggleSelect(path) {
        setSelectedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });
    }

    async function handleDelete() {
        if (selectedPaths.size === 0) return;
        setDeleting(true);
        try {
            await invoke("delete_files", {
                paths: Array.from(selectedPaths),
                useTrash: true,
            });
            const deleted = new Set(selectedPaths);
            setSelectedPaths(new Set());
            setResults((prev) => {
                if (!prev) return prev;
                const nextResults = prev.results.filter((item) => !deleted.has(item.path));
                return {
                    ...prev,
                    results: nextResults,
                    total_matches: nextResults.length,
                };
            });
        } catch (e) {
            console.error("Delete failed:", e);
        }
        setDeleting(false);
    }

    async function handleReveal(path) {
        try {
            await revealInFinder(path);
        } catch (error) {
            console.error("Reveal failed:", error);
        }
    }

    const items = results?.results || [];

    return (
        <div className="p-3">
            {/* Search form */}
            <div className="mb-3">
                <div className="d-flex gap-2 mb-2">
                    <div className="flex-grow-1">
                        <input type="text" className="form-control form-control-sm"
                            value={pattern}
                            onChange={(e) => setPattern(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search pattern (regex, glob*, or substring)..."
                            style={{ fontFamily: 'monospace' }}
                        />
                    </div>
                    <CButton onClick={handleSearch} color="primary" size="sm" disabled={searching || !pattern.trim() || !hasData}>
                        {searching ? (
                            <><span className="spinner-border spinner-border-sm me-1" /> Searching...</>
                        ) : (
                            <><CIcon icon={cilSearch} className="me-1" /> Search</>
                        )}
                    </CButton>
                </div>

                {/* Filters */}
                <div className="d-flex gap-3 align-items-center" style={{ fontSize: '12px' }}>
                    <div className="d-flex align-items-center gap-1">
                        <label className="text-muted">Extensions:</label>
                        <input type="text" className="form-control form-control-sm" style={{ width: '150px' }}
                            value={extensions}
                            onChange={(e) => setExtensions(e.target.value)}
                            placeholder="rs, js, py" />
                    </div>
                    <div className="d-flex align-items-center gap-1">
                        <label className="text-muted">Min MB:</label>
                        <input type="number" className="form-control form-control-sm" style={{ width: '80px' }}
                            value={minSizeMB}
                            onChange={(e) => setMinSizeMB(e.target.value)}
                            placeholder="0" />
                    </div>
                    <div className="d-flex align-items-center gap-1">
                        <label className="text-muted">Max MB:</label>
                        <input type="number" className="form-control form-control-sm" style={{ width: '80px' }}
                            value={maxSizeMB}
                            onChange={(e) => setMaxSizeMB(e.target.value)}
                            placeholder="any" />
                    </div>
                    <CFormCheck
                        label="Recursive"
                        checked={recursive}
                        onChange={(e) => setRecursive(e.target.checked)}
                    />
                </div>
            </div>

            {/* Actions bar */}
            {selectedPaths.size > 0 && (
                <div className="d-flex align-items-center gap-2 mb-2">
                    <CBadge color="primary">{selectedPaths.size} selected</CBadge>
                    <CButton onClick={handleDelete} color="danger" size="sm" disabled={deleting}>
                        <CIcon icon={cilTrash} className="me-1" />Move to Trash
                    </CButton>
                    <CButton onClick={() => setSelectedPaths(new Set())} color="outline-secondary" size="sm">
                        Deselect
                    </CButton>
                </div>
            )}

            {/* Summary */}
            {results && (
                <div className="mb-2" style={{ fontSize: '12px' }}>
                    <span className="text-muted">
                        {results.total_matches} matches in {results.files_searched.toLocaleString()} files searched
                        {results.errors.length > 0 && <> &middot; <span className="text-warning">{results.errors.length} errors</span></>}
                    </span>
                </div>
            )}

            {/* Results table */}
            {items.length > 0 ? (
                <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                    <table className="table table-sm table-hover" style={{ fontSize: '12px' }}>
                        <thead className="table-light sticky-top">
                            <tr>
                                <th style={{ width: '30px' }}></th>
                                <th>Name</th>
                                <th>Path</th>
                                <th style={{ width: '80px', textAlign: 'right' }}>Size</th>
                                <th style={{ width: '60px' }}>Match</th>
                                <th style={{ width: '44px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.path} className={selectedPaths.has(item.path) ? 'table-primary' : ''}>
                                    <td>
                                        <input type="checkbox"
                                            checked={selectedPaths.has(item.path)}
                                            onChange={() => toggleSelect(item.path)} />
                                    </td>
                                    <td>
                                        <CIcon icon={item.is_dir ? cilFolder : cilFile}
                                            size="sm"
                                            className={`me-1 ${item.is_dir ? 'text-warning' : 'text-primary'}`} />
                                        {item.name}
                                    </td>
                                    <td className="text-muted text-truncate" style={{ maxWidth: '300px' }} title={item.path}>
                                        {item.path}
                                    </td>
                                    <td className="text-end text-muted">{item.size_h}</td>
                                    <td><CBadge color="info" size="sm">{item.matched_on}</CBadge></td>
                                    <td>
                                        <CButton
                                            size="sm"
                                            color="light"
                                            className="py-0 px-1"
                                            onClick={() => handleReveal(item.path)}
                                            title="Reveal in Finder"
                                        >
                                            <CIcon icon={cilExternalLink} size="sm" />
                                        </CButton>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : results ? (
                <div className="text-center text-muted py-4">
                    No files matching "{pattern}" found.
                </div>
            ) : !searching ? (
                <div className="text-center text-muted py-4">
                    <CIcon icon={cilSearch} size="3xl" className="mb-3 text-muted" />
                    <h6>File Search</h6>
                    <p>{hasData ? 'Enter a search pattern to query the current scan snapshot.' : 'Scan a directory before searching.'}</p>
                    <div className="small text-muted mt-2">
                        Supports: <code>*.log</code> (glob), <code>test.*</code> (regex), <code>readme</code> (substring)
                    </div>
                </div>
            ) : null}
        </div>
    );
}
