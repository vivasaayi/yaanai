/**
 * DuplicateTool - metadata-only duplicate candidate detection.
 *
 * This tool reads the current scan snapshot and never hashes file contents.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useScanState } from '../state/ScanStateContext';
import { CBadge, CButton, CFormCheck, CProgress, CProgressBar } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilCopy, cilExternalLink, cilFile, cilMediaStop, cilSearch, cilTrash } from '@coreui/icons';
import {
    DUPLICATE_MATCH_MODES,
    buildMetadataDuplicateGroupsAsync,
    formatBytes,
} from '../utils/treeAnalysis';
import { revealInFinder } from '../utils/fileActions';

const confidenceColor = {
    strong: 'success',
    review: 'warning',
};

const PAGE_SIZE = 200;

export default function DuplicateTool() {
    const { currentSnapshot, hasData, staleStatus } = useScanState();
    const [matchMode, setMatchMode] = useState('name_size');
    const [minSizeMB, setMinSizeMB] = useState('0');
    const [includeZeroByte, setIncludeZeroByte] = useState(false);
    const [result, setResult] = useState(null);
    const [progress, setProgress] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [visibleGroups, setVisibleGroups] = useState(PAGE_SIZE);
    const [deleting, setDeleting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const cancelRef = useRef(false);

    useEffect(() => {
        cancelRef.current = true;
        setResult(null);
        setProgress(null);
        setSelectedPaths(new Set());
        setExpandedGroups(new Set());
        setVisibleGroups(PAGE_SIZE);
        setAnalyzing(false);
    }, [currentSnapshot?.version]);

    const minSizeBytes = useMemo(() => {
        const parsed = Number.parseFloat(minSizeMB);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed * 1024 * 1024) : 0;
    }, [minSizeMB]);

    const groups = result?.groups || [];
    const displayedGroups = groups.slice(0, visibleGroups);
    const selectedBytes = useMemo(() => {
        if (!result) return 0;
        let total = 0;
        result.groups.forEach((group) => {
            group.files.forEach((file) => {
                if (selectedPaths.has(file.path)) {
                    total += file.size || 0;
                }
            });
        });
        return total;
    }, [result, selectedPaths]);

    async function runAnalysis() {
        if (!currentSnapshot?.tree) return;
        cancelRef.current = false;
        setAnalyzing(true);
        setResult(null);
        setProgress({
            filesScanned: 0,
            duplicateCandidates: 0,
            groupsSeen: 0,
            skippedSmallFiles: 0,
            missingMetadataFiles: 0,
        });
        setSelectedPaths(new Set());
        setExpandedGroups(new Set());
        setVisibleGroups(PAGE_SIZE);

        try {
            await new Promise((resolve) => window.requestAnimationFrame(resolve));
            const nextResult = await buildMetadataDuplicateGroupsAsync(
                currentSnapshot.tree,
                {
                    matchMode,
                    minSizeBytes,
                    includeZeroByte,
                    chunkSize: 10000,
                    shouldCancel: () => cancelRef.current,
                },
                setProgress,
            );
            setResult({
                ...nextResult,
                snapshot_version: currentSnapshot.version,
                snapshot_path: currentSnapshot.path,
            });
        } catch (error) {
            setResult({
                groups: [],
                total_files_scanned: 0,
                total_groups: 0,
                total_duplicates: 0,
                total_wasted_space: 0,
                total_wasted_space_h: '0 B',
                errors: [String(error)],
            });
        } finally {
            setAnalyzing(false);
        }
    }

    function cancelAnalysis() {
        cancelRef.current = true;
    }

    function toggleGroup(groupId) {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    }

    function toggleFile(path) {
        setSelectedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }

    function selectAllExtraCopies() {
        const paths = new Set();
        groups.forEach((group) => {
            group.files.slice(1).forEach((file) => paths.add(file.path));
        });
        setSelectedPaths(paths);
    }

    function selectGroupExtraCopies(group) {
        setSelectedPaths((prev) => {
            const next = new Set(prev);
            group.files.slice(1).forEach((file) => next.add(file.path));
            return next;
        });
    }

    async function trashSelected() {
        if (selectedPaths.size === 0) return;
        setDeleting(true);
        try {
            const paths = Array.from(selectedPaths);
            const deleteResult = await invoke("delete_files", {
                paths,
                useTrash: true,
            });
            const deleted = new Set(deleteResult.deleted || paths);
            setSelectedPaths(new Set());
            setResult((prev) => pruneDeletedPaths(prev, deleted));
        } catch (error) {
            console.error("Delete failed:", error);
        } finally {
            setDeleting(false);
        }
    }

    async function exportResult(format) {
        if (!result) return;
        setExporting(true);
        try {
            const homeDir = await invoke("get_home_directory");
            const filePath = `${homeDir}/yaanai_metadata_duplicates.${format}`;
            await invoke("export_metadata_duplicate_result", {
                format,
                filePath,
                result,
            });
            alert(`Exported to: ${filePath}`);
        } catch (error) {
            alert("Export failed: " + error);
        } finally {
            setExporting(false);
        }
    }

    async function copyPath(path) {
        try {
            await navigator.clipboard.writeText(path);
        } catch {
            // Clipboard access can be unavailable in preview contexts.
        }
    }

    async function handleReveal(path) {
        try {
            await revealInFinder(path);
        } catch (error) {
            console.error('Reveal failed:', error);
        }
    }

    const progressPercent = currentSnapshot?.fileCount && progress
        ? Math.min(100, Math.round((progress.filesScanned / currentSnapshot.fileCount) * 100))
        : 0;

    if (!hasData) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                Scan a directory to find duplicate candidates.
            </div>
        );
    }

    return (
        <div className="d-flex flex-column h-100">
            <div className="px-3 py-2 border-bottom bg-light">
                <div className="d-flex align-items-center gap-2 mb-2">
                    <CButton onClick={runAnalysis} color="primary" size="sm" disabled={analyzing || !hasData}>
                        {analyzing ? (
                            <><span className="spinner-border spinner-border-sm me-1" /> Analyzing...</>
                        ) : (
                            <><CIcon icon={cilSearch} className="me-1" /> Find Duplicates</>
                        )}
                    </CButton>
                    {analyzing && (
                        <CButton onClick={cancelAnalysis} color="outline-danger" size="sm">
                            <CIcon icon={cilMediaStop} className="me-1" />
                            Cancel
                        </CButton>
                    )}
                    {groups.length > 0 && (
                        <CButton onClick={selectAllExtraCopies} color="outline-warning" size="sm" disabled={analyzing}>
                            Select Extra Copies
                        </CButton>
                    )}
                    {selectedPaths.size > 0 && (
                        <CButton onClick={trashSelected} color="danger" size="sm" disabled={deleting || analyzing}>
                            <CIcon icon={cilTrash} className="me-1" />
                            Trash {selectedPaths.size} / {formatBytes(selectedBytes)}
                        </CButton>
                    )}
                    {result && (
                        <div className="ms-auto d-flex gap-1">
                            <CButton size="sm" color="outline-secondary" onClick={() => exportResult('json')} disabled={exporting}>JSON</CButton>
                            <CButton size="sm" color="outline-secondary" onClick={() => exportResult('csv')} disabled={exporting}>CSV</CButton>
                        </div>
                    )}
                </div>

                <div className="d-flex align-items-center gap-3" style={{ fontSize: '12px' }}>
                    <select
                        className="form-select form-select-sm"
                        style={{ width: '260px' }}
                        value={matchMode}
                        onChange={(event) => setMatchMode(event.target.value)}
                        disabled={analyzing}
                    >
                        {DUPLICATE_MATCH_MODES.map((mode) => (
                            <option key={mode.id} value={mode.id}>{mode.label}</option>
                        ))}
                    </select>
                    <div className="d-flex align-items-center gap-1">
                        <span className="text-muted">Min MB</span>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            className="form-control form-control-sm"
                            style={{ width: '90px' }}
                            value={minSizeMB}
                            onChange={(event) => setMinSizeMB(event.target.value)}
                            disabled={analyzing}
                        />
                    </div>
                    <CFormCheck
                        label="Include 0-byte"
                        checked={includeZeroByte}
                        disabled={analyzing}
                        onChange={(event) => setIncludeZeroByte(event.target.checked)}
                    />
                    <span className="text-muted">
                        Snapshot v{currentSnapshot.version} / {currentSnapshot.fileCount.toLocaleString()} files
                        {staleStatus.stale && <span className="text-warning"> / stale state detected</span>}
                    </span>
                </div>

                {analyzing && (
                    <div className="mt-2">
                        <div className="d-flex justify-content-between mb-1" style={{ fontSize: '12px' }}>
                            <span className="text-muted">
                                {progress?.filesScanned?.toLocaleString() || 0} files checked / {progress?.duplicateCandidates?.toLocaleString() || 0} candidates
                            </span>
                            <span className="text-muted">{progressPercent}%</span>
                        </div>
                        <CProgress thin>
                            <CProgressBar animated color="primary" value={progressPercent} />
                        </CProgress>
                    </div>
                )}
            </div>

            {result && (
                <div className="d-flex gap-4 px-3 py-2 border-bottom" style={{ fontSize: '13px' }}>
                    <div>
                        <strong>{result.total_files_scanned.toLocaleString()}</strong>
                        <div className="text-muted small">Files Checked</div>
                    </div>
                    <div>
                        <strong className="text-warning">{result.total_groups.toLocaleString()}</strong>
                        <div className="text-muted small">Groups</div>
                    </div>
                    <div>
                        <strong className="text-danger">{result.total_duplicates.toLocaleString()}</strong>
                        <div className="text-muted small">Extra Copies</div>
                    </div>
                    <div>
                        <strong className="text-danger">{result.total_wasted_space_h}</strong>
                        <div className="text-muted small">Potential Waste</div>
                    </div>
                    <div>
                        <strong>{(result.duration_ms / 1000).toFixed(2)}s</strong>
                        <div className="text-muted small">Elapsed</div>
                    </div>
                    {result.missing_metadata_files > 0 && (
                        <div>
                            <strong className="text-warning">{result.missing_metadata_files.toLocaleString()}</strong>
                            <div className="text-muted small">Missing Metadata</div>
                        </div>
                    )}
                    {result.cancelled && (
                        <div>
                            <strong className="text-warning">Cancelled</strong>
                            <div className="text-muted small">Partial Result</div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex-grow-1" style={{ overflow: 'auto' }}>
                {displayedGroups.length > 0 ? (
                    <div className="p-2">
                        {displayedGroups.map((group) => {
                            const expanded = expandedGroups.has(group.id);
                            return (
                                <div key={group.id} className="border rounded mb-2">
                                    <div
                                        className="d-flex align-items-center gap-2 p-2 bg-light"
                                        style={{ cursor: 'pointer', fontSize: '13px' }}
                                        onClick={() => toggleGroup(group.id)}
                                    >
                                        <CIcon icon={cilCopy} className="text-warning" />
                                        <strong className="text-truncate" style={{ maxWidth: '360px' }}>{group.files[0]?.name}</strong>
                                        <CBadge color="warning">{group.files.length} copies</CBadge>
                                        <CBadge color="info">{group.size_h}</CBadge>
                                        <CBadge color={confidenceColor[group.confidence] || 'secondary'}>{group.confidence}</CBadge>
                                        <CBadge color="danger">Waste {group.wasted_space_h}</CBadge>
                                        <span className="text-muted ms-auto">{group.match_label}</span>
                                        <CButton
                                            size="sm"
                                            color="outline-danger"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                selectGroupExtraCopies(group);
                                            }}
                                        >
                                            Select Extra
                                        </CButton>
                                        <span>{expanded ? '\u25B2' : '\u25BC'}</span>
                                    </div>

                                    {expanded && (
                                        <table className="table table-sm mb-0" style={{ fontSize: '12px' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '34px' }}></th>
                                                    <th>Name</th>
                                                    <th>Path</th>
                                                    <th style={{ width: '100px', textAlign: 'right' }}>Size</th>
                                                    <th style={{ width: '150px' }}>Modified</th>
                                                    <th style={{ width: '74px' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.files.map((file, index) => (
                                                    <tr key={file.path} className={selectedPaths.has(file.path) ? 'table-danger' : ''}>
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedPaths.has(file.path)}
                                                                onChange={() => toggleFile(file.path)}
                                                            />
                                                        </td>
                                                        <td>
                                                            <CIcon icon={cilFile} size="sm" className="text-primary me-1" />
                                                            {index === 0 && <CBadge color="success" className="me-1">Keep</CBadge>}
                                                            {file.name}
                                                        </td>
                                                        <td className="text-muted text-truncate" style={{ maxWidth: '540px' }} title={file.path}>
                                                            {file.path}
                                                        </td>
                                                        <td className="text-end text-muted">{file.size_h}</td>
                                                        <td className="text-muted">{formatUnixTime(file.modified_unix_secs)}</td>
                                                        <td>
                                                            <div className="d-flex gap-1">
                                                                <CButton size="sm" color="light" className="py-0 px-1" onClick={() => handleReveal(file.path)} title="Reveal in Finder">
                                                                    <CIcon icon={cilExternalLink} size="sm" />
                                                                </CButton>
                                                                <CButton size="sm" color="light" className="py-0 px-1" onClick={() => copyPath(file.path)} title="Copy path">
                                                                    <CIcon icon={cilCopy} size="sm" />
                                                                </CButton>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            );
                        })}

                        {visibleGroups < groups.length && (
                            <div className="text-center py-2">
                                <CButton size="sm" color="outline-secondary" onClick={() => setVisibleGroups((count) => count + PAGE_SIZE)}>
                                    Show More ({groups.length - visibleGroups} remaining)
                                </CButton>
                            </div>
                        )}
                    </div>
                ) : result ? (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        No duplicate candidates found.
                    </div>
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        Run duplicate detection on the current snapshot.
                    </div>
                )}
            </div>
        </div>
    );
}

function formatUnixTime(value) {
    if (value == null) return '-';
    return new Date(value * 1000).toLocaleString();
}

function pruneDeletedPaths(result, deletedPaths) {
    if (!result) return result;

    const groups = (result.groups || [])
        .map((group) => ({
            ...group,
            files: group.files.filter((file) => !deletedPaths.has(file.path)),
        }))
        .filter((group) => group.files.length > 1)
        .map((group) => {
            const wastedSpace = group.files.slice(1).reduce((sum, file) => sum + (file.size || 0), 0);
            return {
                ...group,
                wasted_space: wastedSpace,
                wasted_space_h: formatBytes(wastedSpace),
                total_size: group.files.reduce((sum, file) => sum + (file.size || 0), 0),
                total_size_h: formatBytes(group.files.reduce((sum, file) => sum + (file.size || 0), 0)),
            };
        });

    const totalDuplicates = groups.reduce((sum, group) => sum + Math.max(0, group.files.length - 1), 0);
    const totalWastedSpace = groups.reduce((sum, group) => sum + group.wasted_space, 0);

    return {
        ...result,
        groups,
        total_groups: groups.length,
        total_duplicates: totalDuplicates,
        total_wasted_space: totalWastedSpace,
        total_wasted_space_h: formatBytes(totalWastedSpace),
    };
}
