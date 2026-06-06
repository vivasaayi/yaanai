/**
 * DuplicateTool — Find true duplicates using SHA256 content hashing.
 *
 * Uses the current central scan snapshot as the candidate list.
 * Features:
 * - Parallel hashing for speed
 * - Real-time progress reporting
 * - Live stats during scan
 */

import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useScanState } from '../state/ScanStateContext';
import { CButton, CBadge, CCollapse, CFormCheck, CProgress, CProgressBar } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilFile, cilTrash, cilCopy, cilMediaStop } from '@coreui/icons';
import { buildDuplicateCandidates } from '../utils/treeAnalysis';

export default function DuplicateTool() {
    const { currentSnapshot, hasData } = useScanState();

    const [scanResult, setScanResult] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [deleting, setDeleting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [displayedProgressPercent, setDisplayedProgressPercent] = useState(0);
    const [resultVersion, setResultVersion] = useState(null);

    // Progress state
    const [progress, setProgress] = useState(null);
    const [progressText, setProgressText] = useState('');

    useEffect(() => {
        setScanResult(null);
        setSelectedFiles(new Set());
        setExpandedGroups(new Set());
        setResultVersion(null);
    }, [currentSnapshot?.version]);

    // Setup progress listener
    useEffect(() => {
        const unlisten = listen('duplicate-progress', (event) => {
            const p = event.payload;
            setProgress(p);

            // Update progress text based on phase
            let text = '';
            switch (p.phase) {
                case 'scanning':
                    text = `Scanning files... (${p.files_processed} files, ${p.total_candidates} candidates)`;
                    break;
                case 'grouping':
                    text = `Analyzing duplicates... (${p.files_processed} scanned)`;
                    break;
                case 'hashing':
                    const percent = p.total_candidates > 0
                        ? Math.round((p.files_processed / p.total_candidates) * 100)
                        : 0;
                    text = `Hashing files... ${percent}% (${p.files_processed}/${p.total_candidates})`;
                    if (p.groups_found > 0) {
                        text += ` • ${p.groups_found} duplicate groups found`;
                    }
                    break;
                case 'complete':
                    text = `Scan complete: ${p.groups_found} duplicate groups, ${p.files_hashed} files hashed, ${p.cached_hashes_reused} cache hits`;
                    break;
                case 'cancelled':
                    text = `Cancelling scan... processed ${p.files_processed} candidates so far`;
                    break;
                default:
                    text = p.current_file;
            }
            setProgressText(text);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const progressPercent = useMemo(() => {
        if (!progress || progress.total_candidates <= 0 || progress.phase !== 'hashing') {
            return 0;
        }
        return Math.round((progress.files_processed / progress.total_candidates) * 100);
    }, [progress]);

    useEffect(() => {
        if (!scanning) {
            setDisplayedProgressPercent(progressPercent);
            return undefined;
        }

        const nextFrame = window.requestAnimationFrame(() => {
            setDisplayedProgressPercent((previous) => {
                const delta = progressPercent - previous;
                if (Math.abs(delta) < 1) {
                    return progressPercent;
                }
                return previous + delta * 0.2;
            });
        });

        return () => window.cancelAnimationFrame(nextFrame);
    }, [progressPercent, scanning]);

    async function runScan() {
        if (!currentSnapshot?.tree) return;
        const snapshotVersion = currentSnapshot.version;
        const files = buildDuplicateCandidates(currentSnapshot.tree);
        setScanning(true);
        setSelectedFiles(new Set());
        setProgress(null);
        setResultVersion(snapshotVersion);
        setProgressText(`Initializing scan from snapshot v${snapshotVersion}...`);
        try {
            const result = await invoke("find_true_duplicates_for_files", { files });
            if (result.cancelled) {
                setProgressText(`Scan cancelled after ${result.files_hashed + result.cached_hashes_reused} candidates`);
                return;
            }
            setScanResult(result);
        } catch (e) {
            console.error("Duplicate scan failed:", e);
            setProgressText("Scan failed: " + e);
        } finally {
            setScanning(false);
        }
    }

    async function cancelScan() {
        setProgressText('Cancelling scan...');
        try {
            await invoke('cancel_duplicate_scan');
        } catch (e) {
            console.error('Cancel failed:', e);
        }
    }

    function toggleGroup(hash) {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(hash)) next.delete(hash); else next.add(hash);
            return next;
        });
    }

    function toggleFile(path) {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });
    }

    function selectAllDuplicates() {
        if (!scanResult) return;
        const paths = new Set();
        scanResult.groups.forEach(g => {
            g.files.slice(1).forEach(f => paths.add(f.path));
        });
        setSelectedFiles(paths);
    }

    function selectGroupDuplicates(group) {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            group.files.slice(1).forEach(f => next.add(f.path));
            return next;
        });
    }

    async function handleDelete() {
        if (selectedFiles.size === 0) return;
        setDeleting(true);
        try {
            await invoke("delete_files", {
                paths: Array.from(selectedFiles),
                useTrash: true,
            });
            setSelectedFiles(new Set());
            // Re-scan to refresh
            await runScan();
        } catch (e) {
            console.error("Delete failed:", e);
        }
        setDeleting(false);
    }

    async function handleExport(format) {
        setExporting(true);
        try {
            const homeDir = await invoke("get_home_directory");
            const filePath = `${homeDir}/yaanai_duplicates.${format}`;
            await invoke("export_duplicate_result", {
                format,
                filePath,
                result: scanResult,
            });
            alert(`Exported to: ${filePath}`);
        } catch (e) {
            alert("Export failed: " + e);
        }
        setExporting(false);
    }

    const groups = scanResult?.groups || [];
    const indeterminateProgress = scanning && progress && progress.phase !== 'hashing' && progress.phase !== 'complete';

    return (
        <div className="p-3">
            {/* Controls */}
            <div className="d-flex align-items-center gap-2 mb-3">
                <CButton onClick={runScan} color="primary" size="sm" disabled={scanning || !hasData}>
                    {scanning ? (
                        <><span className="spinner-border spinner-border-sm me-1" /> Scanning...</>
                    ) : scanResult ? 'Re-scan' : 'Find Duplicates'}
                </CButton>

                {scanning && (
                    <CButton onClick={cancelScan} color="outline-danger" size="sm">
                        <CIcon icon={cilMediaStop} className="me-1" />
                        Cancel
                    </CButton>
                )}

                {scanResult && groups.length > 0 && (
                    <CButton onClick={selectAllDuplicates} color="outline-warning" size="sm">
                        Select All Duplicates
                    </CButton>
                )}

                {selectedFiles.size > 0 && (
                    <CButton onClick={handleDelete} color="danger" size="sm" disabled={deleting}>
                        <CIcon icon={cilTrash} className="me-1" />
                        Delete {selectedFiles.size} to Trash
                    </CButton>
                )}

                {scanResult && (
                    <div className="ms-auto d-flex gap-1">
                        <CButton size="sm" color="outline-secondary" onClick={() => handleExport('json')} disabled={exporting}>JSON</CButton>
                        <CButton size="sm" color="outline-secondary" onClick={() => handleExport('csv')} disabled={exporting}>CSV</CButton>
                    </div>
                )}
            </div>

            {/* Progress bar during scanning */}
            {scanning && (
                <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2" style={{ fontSize: '12px' }}>
                        <span className="text-muted">{progressText}</span>
                        {progress && progress.phase === 'hashing' && <span className="badge bg-info">{progressPercent}%</span>}
                    </div>
                    <CProgress className="mb-2" style={{ height: '24px' }}>
                        <CProgressBar animated color={indeterminateProgress ? 'info' : 'primary'} value={indeterminateProgress ? 100 : displayedProgressPercent} />
                    </CProgress>

                    {/* Live stats during hashing */}
                    {progress && (
                        <div className="d-flex gap-4 p-2 bg-light border rounded" style={{ fontSize: '12px' }}>
                            <div>
                                <span className="text-muted">Candidates Processed:</span> <strong>{progress.files_processed}</strong>
                            </div>
                            <div>
                                <span className="text-muted">Total Candidates:</span> <strong>{progress.total_candidates}</strong>
                            </div>
                            <div>
                                <span className="text-muted">Groups Found:</span> <strong className="text-warning">{progress.groups_found}</strong>
                            </div>
                            <div>
                                <span className="text-muted">Files Hashed:</span> <strong>{progress.files_hashed}</strong>
                            </div>
                            <div>
                                <span className="text-muted">Cache Hits:</span> <strong className="text-success">{progress.cached_hashes_reused}</strong>
                            </div>
                            {progress.current_file && (
                                <div className="flex-grow-1 text-truncate" style={{ fontSize: '11px' }}>
                                    <span className="text-muted">Current:</span> <code>{progress.current_file.split('/').pop()}</code>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Summary */}
            {scanResult && (
                <div className="d-flex gap-4 mb-3 p-3 bg-light border rounded" style={{ fontSize: '13px' }}>
                    <div>
                        <strong>{scanResult.total_files_scanned.toLocaleString()}</strong>
                        <div className="text-muted small">Files Scanned</div>
                    </div>
                    <div>
                        <strong className="text-warning">{groups.length}</strong>
                        <div className="text-muted small">Duplicate Groups</div>
                    </div>
                    <div>
                        <strong className="text-danger">{scanResult.total_duplicates}</strong>
                        <div className="text-muted small">Duplicate Files</div>
                    </div>
                    <div>
                        <strong className="text-danger">{scanResult.total_wasted_space_h}</strong>
                        <div className="text-muted small">Wasted Space</div>
                    </div>
                    <div>
                        <strong className="text-success">{scanResult.cached_hashes_reused}</strong>
                        <div className="text-muted small">Cache Hits</div>
                    </div>
                    <div>
                        <strong>{scanResult.files_hashed}</strong>
                        <div className="text-muted small">Files Hashed</div>
                    </div>
                    <div>
                        <strong>{(scanResult.duration_ms / 1000).toFixed(2)}s</strong>
                        <div className="text-muted small">Elapsed</div>
                    </div>
                    {scanResult.errors.length > 0 && (
                        <div>
                            <strong className="text-warning">{scanResult.errors.length}</strong>
                            <div className="text-muted small">Errors</div>
                        </div>
                    )}
                    {resultVersion != null && (
                        <div>
                            <strong>v{resultVersion}</strong>
                            <div className="text-muted small">Snapshot</div>
                        </div>
                    )}
                </div>
            )}

            {/* Duplicate groups */}
            {groups.length > 0 ? (
                <div style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
                    {groups.map((group) => (
                        <div key={group.hash} className="border rounded mb-2">
                            <div
                                className="d-flex justify-content-between align-items-center p-2 bg-light"
                                style={{ cursor: 'pointer', fontSize: '13px' }}
                                onClick={() => toggleGroup(group.hash)}
                            >
                                <div className="d-flex align-items-center gap-2">
                                    <CIcon icon={cilCopy} className="text-warning" />
                                    <strong>{group.files[0]?.name}</strong>
                                    <CBadge color="warning">{group.files.length} copies</CBadge>
                                    <CBadge color="info">{group.size_h}</CBadge>
                                    <CBadge color="danger">Wasting {group.wasted_space_h}</CBadge>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <CButton size="sm" color="outline-danger"
                                        onClick={(e) => { e.stopPropagation(); selectGroupDuplicates(group); }}>
                                        Select Dupes
                                    </CButton>
                                    <span>{expandedGroups.has(group.hash) ? '\u25B2' : '\u25BC'}</span>
                                </div>
                            </div>
                            <CCollapse visible={expandedGroups.has(group.hash)}>
                                <div className="p-2">
                                    {group.files.map((file, fi) => (
                                        <div key={file.path}
                                            className={`d-flex align-items-center gap-2 py-1 px-2 ${fi === 0 ? 'border-start border-3 border-success' : ''}`}
                                            style={{ fontSize: '12px' }}>
                                            <CFormCheck
                                                checked={selectedFiles.has(file.path)}
                                                onChange={() => toggleFile(file.path)}
                                            />
                                            <CIcon icon={cilFile} size="sm" className="text-primary" />
                                            <span className="flex-grow-1 text-truncate" title={file.path}>
                                                {file.path}
                                            </span>
                                            <span className="text-muted">{file.size_h}</span>
                                            {fi === 0 && <CBadge color="success" size="sm">Keep</CBadge>}
                                        </div>
                                    ))}
                                    <div className="text-muted mt-1" style={{ fontSize: '10px' }}>
                                        SHA256: {group.hash.substring(0, 24)}...
                                    </div>
                                </div>
                            </CCollapse>
                        </div>
                    ))}
                </div>
            ) : scanResult ? (
                <div className="text-center text-muted py-4">No duplicates found.</div>
            ) : !scanning ? (
                <div className="text-center text-muted py-4">
                    <CIcon icon={cilCopy} size="3xl" className="mb-3 text-muted" />
                    <h6>Duplicate Finder</h6>
                    <p>{hasData ? 'Click "Find Duplicates" to hash files from the current scan snapshot.' : 'Scan a directory before finding duplicates.'}</p>
                    <p className="small">Uses parallel hashing with incremental cache reuse for faster repeat scans.</p>
                </div>
            ) : null}
        </div>
    );
}
