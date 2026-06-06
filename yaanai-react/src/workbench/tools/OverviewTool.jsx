/**
 * OverviewTool — Dashboard / landing page showing:
 * - Welcome state when no scan done
 * - Summary cards when scan is ready
 * - Quick actions
 */

import React from 'react';
import { useScanState, ScanStatus } from '../state/ScanStateContext';
import { CCard, CCardBody, CRow, CCol, CButton } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilFile, cilFolder, cilStorage, cilCopy, cilSearch, cilChartPie } from '@coreui/icons';
import { formatBytes, isDirectoryNode, isFileNode } from '../utils/treeAnalysis';

export default function OverviewTool() {
    const { status, currentSnapshot, hasData, startScan, currentPath, scannedTimeAgo, favorites } = useScanState();

    // IDLE — welcome screen
    if (!hasData && status !== ScanStatus.SCANNING) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100">
                <div className="text-center" style={{ maxWidth: '500px' }}>
                    <h2 className="mb-3">Yaanai</h2>
                    <p className="text-muted mb-4">
                        File System Analyzer &amp; Cleanup Tool
                    </p>
                    <div className="mb-4">
                        <CButton onClick={() => startScan(currentPath)} color="primary" size="lg" disabled={!currentPath}>
                            Scan {currentPath ? currentPath.split('/').pop() : 'Directory'}
                        </CButton>
                    </div>
                    <p className="text-muted small">
                        Pick a folder in the header, then click Scan to analyze your files.
                    </p>

                    {/* Quick favorites */}
                    {favorites.length > 0 && (
                        <div className="mt-4">
                            <p className="text-muted small mb-2">Quick access:</p>
                            <div className="d-flex flex-wrap gap-2 justify-content-center">
                                {favorites.slice(0, 5).map((fav) => (
                                    <CButton key={fav.id} color="outline-secondary" size="sm"
                                        onClick={() => startScan(fav.path)}>
                                        {fav.name}
                                    </CButton>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // SCANNING — progress display
    if (status === ScanStatus.SCANNING && !hasData) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100">
                <div className="text-center">
                    <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }} />
                    <h5>Scanning directory...</h5>
                    <p className="text-muted">Building file state. This may take a moment for large directories.</p>
                </div>
            </div>
        );
    }

    // READY — summary dashboard
    const snap = currentSnapshot;
    if (!snap) return null;

    // Compute top-level stats from children
    const children = snap.tree?.children || [];
    const topDirs = children
        .filter(isDirectoryNode)
        .sort((a, b) => b.disk_entry.size - a.disk_entry.size)
        .slice(0, 5);
    const topFiles = children
        .filter(isFileNode)
        .sort((a, b) => b.disk_entry.size - a.disk_entry.size)
        .slice(0, 5);

    return (
        <div className="p-3">
            {/* Summary Cards */}
            <CRow className="mb-4">
                <CCol sm={3}>
                    <CCard className="text-center">
                        <CCardBody>
                            <CIcon icon={cilFile} size="xl" className="text-primary mb-2" />
                            <h3>{snap.fileCount.toLocaleString()}</h3>
                            <div className="text-muted small">Files</div>
                        </CCardBody>
                    </CCard>
                </CCol>
                <CCol sm={3}>
                    <CCard className="text-center">
                        <CCardBody>
                            <CIcon icon={cilFolder} size="xl" className="text-warning mb-2" />
                            <h3>{snap.dirCount.toLocaleString()}</h3>
                            <div className="text-muted small">Directories</div>
                        </CCardBody>
                    </CCard>
                </CCol>
                <CCol sm={3}>
                    <CCard className="text-center">
                        <CCardBody>
                            <CIcon icon={cilStorage} size="xl" className="text-success mb-2" />
                            <h3>{snap.totalSizeH}</h3>
                            <div className="text-muted small">Total Size</div>
                        </CCardBody>
                    </CCard>
                </CCol>
                <CCol sm={3}>
                    <CCard className="text-center">
                        <CCardBody>
                            <CIcon icon={cilChartPie} size="xl" className="text-info mb-2" />
                            <h3>{children.length}</h3>
                            <div className="text-muted small">Top-Level Items</div>
                        </CCardBody>
                    </CCard>
                </CCol>
            </CRow>

            {/* Top directories */}
            <CRow className="mb-4">
                <CCol md={6}>
                    <CCard>
                        <CCardBody>
                            <h6 className="mb-3">Largest Directories</h6>
                            {topDirs.length > 0 ? topDirs.map((dir, i) => {
                                const pct = (dir.disk_entry.size / snap.totalSize) * 100;
                                const name = dir.disk_entry.path.split('/').pop();
                                return (
                                    <div key={i} className="mb-2">
                                        <div className="d-flex justify-content-between" style={{ fontSize: '12px' }}>
                                            <span><CIcon icon={cilFolder} size="sm" className="text-warning me-1" />{name}</span>
                                            <span className="text-muted">{formatBytes(dir.disk_entry.size)}</span>
                                        </div>
                                        <div className="progress" style={{ height: '6px' }}>
                                            <div className="progress-bar bg-warning" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            }) : <div className="text-muted small">No subdirectories</div>}
                        </CCardBody>
                    </CCard>
                </CCol>
                <CCol md={6}>
                    <CCard>
                        <CCardBody>
                            <h6 className="mb-3">Largest Files</h6>
                            {topFiles.length > 0 ? topFiles.map((file, i) => {
                                const pct = (file.disk_entry.size / snap.totalSize) * 100;
                                const name = file.disk_entry.path.split('/').pop();
                                return (
                                    <div key={i} className="mb-2">
                                        <div className="d-flex justify-content-between" style={{ fontSize: '12px' }}>
                                            <span><CIcon icon={cilFile} size="sm" className="text-primary me-1" />{name}</span>
                                            <span className="text-muted">{formatBytes(file.disk_entry.size)}</span>
                                        </div>
                                        <div className="progress" style={{ height: '6px' }}>
                                            <div className="progress-bar bg-primary" style={{ width: `${Math.max(pct, 1)}%` }} />
                                        </div>
                                    </div>
                                );
                            }) : <div className="text-muted small">No files at top level</div>}
                        </CCardBody>
                    </CCard>
                </CCol>
            </CRow>

            {/* Meta */}
            <div className="text-muted small text-center">
                Scanned <strong>{snap.path}</strong> {scannedTimeAgo} &middot; Snapshot v{snap.version}
                {snap.errors.length > 0 && <> &middot; <span className="text-warning">{snap.errors.length} permission errors</span></>}
            </div>
        </div>
    );
}
