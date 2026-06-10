/**
 * ToolTabs — Tabbed area for all analysis tools.
 *
 * All tools read from the central scan state snapshot.
 * No tool can trigger scans — only ScanController does that.
 */

import React from 'react';
import { useScanState, ScanStatus } from '../state/ScanStateContext';
import { CNav, CNavItem, CNavLink, CBadge } from '@coreui/react';

// Tools
import OverviewTool from '../tools/OverviewTool';
import FileBrowserTool from '../tools/FileBrowserTool';
import SearchTool from '../tools/SearchTool';
import DiskUsageTool from '../tools/DiskUsageTool';
import DuplicateTool from '../tools/DuplicateTool';
import CleanupTool from '../tools/CleanupTool';
import SettingsTool from '../tools/SettingsTool';

const TABS = [
    { id: 'overview',    label: 'Overview',    needsData: false },
    { id: 'browser',     label: 'Files',       needsData: false },
    { id: 'disk',        label: 'Disk Usage',  needsData: true },
    { id: 'search',      label: 'Search',      needsData: false },
    { id: 'duplicates',  label: 'Duplicates',  needsData: true },
    { id: 'cleanup',     label: 'Cleanup',     needsData: true },
    { id: 'settings',    label: 'Settings',    needsData: false },
];

export default function ToolTabs() {
    const { status, hasData, currentSnapshot, activeTab, setActiveTab } = useScanState();

    return (
        <div className="d-flex flex-column h-100">
            {/* Re-scanning banner */}
            {status === ScanStatus.RE_SCANNING && (
                <div className="px-3 py-1 bg-info text-white d-flex align-items-center" style={{ fontSize: '12px' }}>
                    <span className="spinner-border spinner-border-sm me-2" />
                    New scan in progress. Showing results from previous scan ({currentSnapshot?.scannedAt?.toLocaleTimeString()}).
                </div>
            )}

            {/* Tab bar */}
            <CNav variant="tabs" className="px-2 pt-1 bg-white border-bottom" style={{ flexShrink: 0 }}>
                {TABS.map((tab) => {
                    const disabled = tab.needsData && !hasData;
                    return (
                        <CNavItem key={tab.id}>
                            <CNavLink
                                active={activeTab === tab.id}
                                onClick={() => !disabled && setActiveTab(tab.id)}
                                style={{
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    opacity: disabled ? 0.5 : 1,
                                    fontSize: '13px',
                                    padding: '6px 12px',
                                }}
                            >
                                {tab.label}
                            </CNavLink>
                        </CNavItem>
                    );
                })}
            </CNav>

            {/* Tool content */}
            <div className="flex-grow-1" style={{ overflow: 'auto' }}>
                {activeTab === 'overview' && <OverviewTool />}
                {activeTab === 'browser' && <FileBrowserTool />}
                {activeTab === 'disk' && <DiskUsageTool />}
                {activeTab === 'search' && <SearchTool />}
                {activeTab === 'duplicates' && <DuplicateTool />}
                {activeTab === 'cleanup' && <CleanupTool />}
                {activeTab === 'settings' && <SettingsTool />}
            </div>
        </div>
    );
}
