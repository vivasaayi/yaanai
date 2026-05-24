/**
 * StatusBar — Bottom bar showing state machine status.
 *
 * Always visible. Shows:
 * - State indicator dot (colored by status)
 * - File count, dir count, total size
 * - Last scan timestamp
 * - Error count
 * - Snapshot version
 * - RE_SCANNING banner
 */

import React from 'react';
import { useScanState, ScanStatus } from '../state/ScanStateContext';

const statusDot = {
    [ScanStatus.IDLE]:        { color: '#6c757d', label: 'Idle' },
    [ScanStatus.SCANNING]:    { color: '#0d6efd', label: 'Scanning' },
    [ScanStatus.READY]:       { color: '#198754', label: 'Ready' },
    [ScanStatus.RE_SCANNING]: { color: '#0d6efd', label: 'Updating' },
    [ScanStatus.ERROR]:       { color: '#dc3545', label: 'Error' },
};

export default function StatusBar() {
    const {
        status, currentSnapshot, scannedTimeAgo, isScanning, scanProgressText, staleStatus, activeTab
    } = useScanState();

    const dot = statusDot[status];
    const snap = currentSnapshot;

    return (
        <div className="status-bar d-flex align-items-center px-3 border-top bg-light"
             style={{ height: '24px', fontSize: '11px', flexShrink: 0 }}>

            {/* State dot */}
            <span className="d-flex align-items-center me-3">
                <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: dot.color, display: 'inline-block',
                    marginRight: '5px',
                    animation: isScanning ? 'pulse 1s infinite' : 'none',
                }} />
                <span className="text-muted">{dot.label}</span>
            </span>

            {/* Stats */}
            {snap && (
                <>
                    <span className="text-muted me-3">
                        {snap.fileCount.toLocaleString()} files &middot;{' '}
                        {snap.dirCount.toLocaleString()} dirs &middot;{' '}
                        {snap.totalSizeH}
                    </span>
                    <span className="text-muted me-3">
                        Scanned {scannedTimeAgo}
                    </span>
                    {snap.errors.length > 0 && (
                        <span className="text-warning me-3">
                            {snap.errors.length} errors
                        </span>
                    )}
                    <span className="text-muted me-3">
                        v{snap.version}
                    </span>
                    {staleStatus.stale && (
                        <span className="text-warning me-3" title={staleStatus.changedPath || 'Files changed since last scan'}>
                            stale state detected
                        </span>
                    )}
                </>
            )}

            <span className="text-muted me-3">Tab: {activeTab}</span>

            {/* Scanning text */}
            {isScanning && (
                <span className="text-info ms-auto text-truncate" style={{ maxWidth: '400px' }}>
                    {scanProgressText}
                </span>
            )}

            {/* Re-scanning notice */}
            {status === ScanStatus.RE_SCANNING && snap && (
                <span className="ms-auto text-info">
                    Showing data from previous scan
                </span>
            )}
        </div>
    );
}
