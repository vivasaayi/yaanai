import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CBadge, CButton, CProgress, CProgressBar } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilCopy, cilExternalLink, cilFile, cilFolder, cilStorage, cilTrash } from '@coreui/icons';
import { useScanState } from '../state/ScanStateContext';
import { formatBytes } from '../utils/treeAnalysis';
import { revealInFinder } from '../utils/fileActions';
import {
    buildCleanupRecommendations,
    categoryOrder,
    summarizeRecommendations,
} from '../utils/cleanupRecommendations';

const confidenceColor = {
    safe: 'success',
    review: 'warning',
    risky: 'danger',
};

export default function CleanupTool() {
    const { currentSnapshot, hasData, staleStatus } = useScanState();
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [removedPaths, setRemovedPaths] = useState(new Set());
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [confidenceFilter, setConfidenceFilter] = useState('all');
    const [trashing, setTrashing] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    const allRecommendations = useMemo(() => {
        if (!currentSnapshot?.tree) return [];
        return buildCleanupRecommendations(currentSnapshot.tree);
    }, [currentSnapshot?.tree, currentSnapshot?.version]);

    useEffect(() => {
        setSelectedIds(new Set());
        setRemovedPaths(new Set());
        setLastResult(null);
        setCategoryFilter('all');
        setConfidenceFilter('all');
    }, [currentSnapshot?.version]);

    const recommendations = useMemo(
        () => allRecommendations.filter((item) => !removedPaths.has(item.path)),
        [allRecommendations, removedPaths],
    );

    const filteredRecommendations = useMemo(
        () => recommendations.filter((item) => {
            if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
            if (confidenceFilter !== 'all' && item.confidence !== confidenceFilter) return false;
            return true;
        }),
        [recommendations, categoryFilter, confidenceFilter],
    );

    const summary = useMemo(() => summarizeRecommendations(recommendations), [recommendations]);
    const selectedItems = useMemo(
        () => recommendations.filter((item) => selectedIds.has(item.id)),
        [recommendations, selectedIds],
    );
    const selectedBytes = selectedItems.reduce((sum, item) => sum + (item.size || 0), 0);
    const totalBytes = recommendations.reduce((sum, item) => sum + (item.size || 0), 0);
    const selectedPercent = totalBytes > 0 ? Math.round((selectedBytes / totalBytes) * 100) : 0;
    const categories = Object.keys(summary.byCategory).sort((a, b) => categoryOrder(a) - categoryOrder(b));

    function toggleSelected(id) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function selectVisible() {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            filteredRecommendations.forEach((item) => next.add(item.id));
            return next;
        });
    }

    function selectSafe() {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            recommendations
                .filter((item) => item.confidence === 'safe')
                .forEach((item) => next.add(item.id));
            return next;
        });
    }

    async function trashSelected() {
        if (selectedItems.length === 0) return;
        setTrashing(true);
        setLastResult(null);

        try {
            const result = await invoke('delete_files', {
                paths: selectedItems.map((item) => item.path),
                useTrash: true,
            });
            const deleted = new Set(result.deleted || []);
            setRemovedPaths((prev) => new Set([...prev, ...deleted]));
            setSelectedIds((prev) => {
                const next = new Set(prev);
                recommendations.forEach((item) => {
                    if (deleted.has(item.path)) next.delete(item.id);
                });
                return next;
            });
            setLastResult(result);
        } catch (error) {
            setLastResult({
                deleted: [],
                failed: [{ path: 'Cleanup action', error: String(error) }],
                total_size_freed_h: '0 B',
            });
        } finally {
            setTrashing(false);
        }
    }

    async function copyPath(path) {
        try {
            await navigator.clipboard.writeText(path);
        } catch {
            // Clipboard access is optional in desktop/web preview contexts.
        }
    }

    async function handleReveal(path) {
        try {
            await revealInFinder(path);
        } catch (error) {
            console.error('Reveal failed:', error);
        }
    }

    if (!hasData) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                Scan a directory to review cleanup candidates.
            </div>
        );
    }

    return (
        <div className="d-flex flex-column h-100">
            <div className="px-3 py-2 border-bottom bg-light">
                <div className="d-flex align-items-center gap-3 mb-2">
                    <div>
                        <div className="fw-semibold">Cleanup Review</div>
                        <div className="text-muted" style={{ fontSize: '12px' }}>
                            {recommendations.length.toLocaleString()} candidates / {formatBytes(totalBytes)} reviewed from snapshot v{currentSnapshot.version}
                            {staleStatus.stale && <span className="text-warning"> / stale state detected</span>}
                        </div>
                    </div>

                    <div className="ms-auto d-flex align-items-center gap-2">
                        <CButton size="sm" color="outline-secondary" onClick={selectSafe} disabled={trashing}>
                            Select Safe
                        </CButton>
                        <CButton size="sm" color="outline-secondary" onClick={selectVisible} disabled={trashing}>
                            Select Visible
                        </CButton>
                        <CButton size="sm" color="outline-secondary" onClick={() => setSelectedIds(new Set())} disabled={trashing || selectedIds.size === 0}>
                            Clear
                        </CButton>
                        <CButton size="sm" color="danger" onClick={trashSelected} disabled={trashing || selectedItems.length === 0}>
                            <CIcon icon={cilTrash} className="me-1" />
                            {trashing ? 'Moving...' : `Trash ${selectedItems.length}`}
                        </CButton>
                    </div>
                </div>

                <div className="d-flex align-items-center gap-3">
                    <div style={{ minWidth: '220px' }}>
                        <div className="d-flex justify-content-between" style={{ fontSize: '11px' }}>
                            <span className="text-muted">Cleanup cart</span>
                            <span className="text-muted">{formatBytes(selectedBytes)}</span>
                        </div>
                        <CProgress thin>
                            <CProgressBar color="danger" value={selectedPercent} />
                        </CProgress>
                    </div>

                    <select
                        className="form-select form-select-sm"
                        style={{ width: '210px' }}
                        value={categoryFilter}
                        onChange={(event) => setCategoryFilter(event.target.value)}
                    >
                        <option value="all">All categories</option>
                        {categories.map((category) => (
                            <option key={category} value={category}>
                                {category} ({summary.byCategory[category]})
                            </option>
                        ))}
                    </select>

                    <select
                        className="form-select form-select-sm"
                        style={{ width: '150px' }}
                        value={confidenceFilter}
                        onChange={(event) => setConfidenceFilter(event.target.value)}
                    >
                        <option value="all">All confidence</option>
                        <option value="safe">Safe ({summary.byConfidence.safe || 0})</option>
                        <option value="review">Review ({summary.byConfidence.review || 0})</option>
                        <option value="risky">Risky ({summary.byConfidence.risky || 0})</option>
                    </select>

                    {lastResult && (
                        <span className={lastResult.failed?.length ? 'text-warning' : 'text-success'} style={{ fontSize: '12px' }}>
                            {lastResult.deleted?.length || 0} moved / {lastResult.total_size_freed_h || '0 B'}
                            {lastResult.failed?.length > 0 && ` / ${lastResult.failed.length} failed`}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-grow-1" style={{ overflow: 'auto' }}>
                {filteredRecommendations.length > 0 ? (
                    <table className="table table-sm table-hover mb-0" style={{ fontSize: '12px' }}>
                        <thead className="table-light sticky-top">
                            <tr>
                                <th style={{ width: '34px' }}></th>
                                <th style={{ width: '190px' }}>Category</th>
                                <th>Path</th>
                                <th style={{ width: '100px', textAlign: 'right' }}>Size</th>
                                <th style={{ width: '90px' }}>Confidence</th>
                                <th style={{ width: '74px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecommendations.map((item) => {
                                const selected = selectedIds.has(item.id);
                                return (
                                    <tr key={item.id} className={selected ? 'table-danger' : ''}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => toggleSelected(item.id)}
                                                disabled={trashing}
                                            />
                                        </td>
                                        <td>
                                            <div className="d-flex align-items-center gap-1">
                                                <CIcon icon={item.isDir ? cilFolder : cilFile} className={item.isDir ? 'text-warning' : 'text-primary'} size="sm" />
                                                <span>{item.category}</span>
                                            </div>
                                            <div className="text-muted text-truncate" title={item.reason}>
                                                {item.reason}
                                            </div>
                                        </td>
                                        <td className="text-truncate" style={{ maxWidth: '520px' }} title={item.path}>
                                            <span className="fw-semibold">{item.name}</span>
                                            <div className="text-muted text-truncate">{item.path}</div>
                                        </td>
                                        <td className="text-end text-muted">{item.sizeH}</td>
                                        <td>
                                            <CBadge color={confidenceColor[item.confidence] || 'secondary'}>
                                                {item.confidence}
                                            </CBadge>
                                        </td>
                                        <td>
                                            <div className="d-flex gap-1">
                                                <CButton size="sm" color="light" className="py-0 px-1" onClick={() => handleReveal(item.path)} title="Reveal in Finder">
                                                    <CIcon icon={cilExternalLink} size="sm" />
                                                </CButton>
                                                <CButton size="sm" color="light" className="py-0 px-1" onClick={() => copyPath(item.path)} title="Copy path">
                                                    <CIcon icon={cilCopy} size="sm" />
                                                </CButton>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        <div className="text-center">
                            <CIcon icon={cilStorage} size="3xl" className="mb-3 text-muted" />
                            <div>No cleanup candidates match the current filters.</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
