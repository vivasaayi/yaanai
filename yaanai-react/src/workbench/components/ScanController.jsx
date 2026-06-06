/**
 * ScanController — The ONLY place scans can be triggered.
 *
 * Always visible in the header. Shows:
 * - Path picker (text input + folder chooser)
 * - Scan button
 * - State indicator badge (IDLE / SCANNING / READY / RE_SCANNING / ERROR)
 * - Progress bar during scanning
 * - Summary stats when ready
 */

import React, { useState } from 'react';
import { useScanState, ScanStatus } from '../state/ScanStateContext';
import {
    CButton, CProgress, CProgressBar, CBadge, CTooltip
} from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilFolder, cilSync, cilSearch, cilStar } from '@coreui/icons';
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const statusConfig = {
    [ScanStatus.IDLE]:         { color: 'secondary', label: 'IDLE', text: 'Pick a folder to start' },
    [ScanStatus.SCANNING]:     { color: 'info',      label: 'SCANNING', text: 'Building file state...' },
    [ScanStatus.READY]:        { color: 'success',   label: 'READY', text: 'All tools active' },
    [ScanStatus.RE_SCANNING]:  { color: 'info',      label: 'UPDATING', text: 'Re-scanning (old data available)' },
    [ScanStatus.ERROR]:        { color: 'danger',    label: 'ERROR', text: 'Scan failed' },
};

export default function ScanController() {
    const {
        status, isScanning, hasData, currentPath, navigateTo,
        startScan, scanProgress, scanProgressText, currentSnapshot,
        scannedTimeAgo, isFavorite, addFavorite, removeFavorite, staleStatus,
    } = useScanState();

    const [pathInput, setPathInput] = useState('');

    // Sync input when external navigation happens
    React.useEffect(() => {
        setPathInput(currentPath);
    }, [currentPath]);

    async function handleChooseFolder() {
        try {
            const selected = await openDialog({
                directory: true,
                multiple: false,
                defaultPath: currentPath || undefined,
            });
            if (selected) {
                navigateTo(selected);
                setPathInput(selected);
            }
        } catch (e) {
            console.error("Folder picker error:", e);
        }
    }

    function handlePathSubmit(e) {
        e.preventDefault();
        if (pathInput.trim()) {
            navigateTo(pathInput.trim());
            startScan(pathInput.trim());
        }
    }

    function handleScan() {
        startScan(currentPath);
    }

    async function handleToggleFavorite() {
        if (isFavorite) {
            await removeFavorite(currentPath);
        } else {
            const name = currentPath.split('/').pop() || currentPath;
            await addFavorite(currentPath, name);
        }
    }

    const cfg = statusConfig[status];
    const progressPercent = scanProgress
        ? Math.min(
            (scanProgress.files_processed /
                Math.max(scanProgress.files_processed + scanProgress.directories_processed, 1)) * 100,
            100
        )
        : 0;

    return (
        <div className="scan-controller bg-white border-bottom px-3 py-2"
             style={{ position: 'sticky', top: 0, zIndex: 1030 }}>
            {/* Row 1: Path + Controls */}
            <div className="d-flex align-items-center gap-2">
                {/* Folder picker */}
                <CButton onClick={handleChooseFolder} color="secondary" size="sm" variant="outline"
                    title="Choose folder">
                    <CIcon icon={cilFolder} />
                </CButton>

                {/* Path input */}
                <form onSubmit={handlePathSubmit} className="flex-grow-1">
                    <input
                        type="text"
                        className="form-control form-control-sm"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        placeholder="Enter folder path and press Enter..."
                        disabled={status === ScanStatus.SCANNING}
                        style={{ fontFamily: 'monospace', fontSize: '13px' }}
                    />
                </form>

                {/* Favorite toggle */}
                <CButton
                    onClick={handleToggleFavorite}
                    color={isFavorite ? "warning" : "secondary"}
                    size="sm"
                    variant={isFavorite ? undefined : "outline"}
                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    disabled={!currentPath}
                >
                    <CIcon icon={cilStar} />
                </CButton>

                {/* Scan button */}
                <CButton
                    onClick={handleScan}
                    color={hasData ? "success" : "primary"}
                    size="sm"
                    disabled={isScanning || !currentPath}
                >
                    {isScanning ? (
                        <><CIcon icon={cilSync} className="spin me-1" /> Scanning...</>
                    ) : hasData ? (
                        <><CIcon icon={cilSync} className="me-1" /> Rescan</>
                    ) : (
                        <><CIcon icon={cilSearch} className="me-1" /> Scan</>
                    )}
                </CButton>

                {/* State badge */}
                <CTooltip content={cfg.text}>
                    <CBadge color={cfg.color} className="py-1 px-2" style={{ fontSize: '11px' }}>
                        {cfg.label}
                    </CBadge>
                </CTooltip>
            </div>

            {/* Row 2: Progress bar (only during scanning) */}
            {isScanning && (
                <div className="mt-2">
                    <CProgress thin className="mb-1">
                        <CProgressBar animated color="info" value={progressPercent} />
                    </CProgress>
                    <div className="d-flex justify-content-between" style={{ fontSize: '11px' }}>
                        <span className="text-muted">{scanProgressText}</span>
                        {scanProgress && (
                            <span className="text-muted">
                                {scanProgress.files_processed} files &middot; {scanProgress.directories_processed} dirs
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Row 2 (alt): Summary when READY and not scanning */}
            {status === ScanStatus.READY && !isScanning && currentSnapshot && (
                <div className="mt-1 d-flex align-items-center gap-3" style={{ fontSize: '11px' }}>
                    <span className="text-muted">
                        {currentSnapshot.fileCount.toLocaleString()} files &middot;{' '}
                        {currentSnapshot.dirCount.toLocaleString()} dirs &middot;{' '}
                        {currentSnapshot.totalSizeH}
                    </span>
                    <span className="text-muted">Scanned {scannedTimeAgo}</span>
                    {currentSnapshot.errors.length > 0 && (
                        <CBadge color="warning" size="sm">
                            {currentSnapshot.errors.length} errors
                        </CBadge>
                    )}
                    {staleStatus.stale && (
                        <CBadge color="danger" size="sm" title={staleStatus.changedPath || 'Files changed since last scan'}>
                            Stale
                        </CBadge>
                    )}
                    {status === ScanStatus.RE_SCANNING && (
                        <CBadge color="info" size="sm">
                            Using previous scan data
                        </CBadge>
                    )}
                </div>
            )}
        </div>
    );
}
