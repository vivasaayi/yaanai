/**
 * WorkbenchLayout — The main application layout.
 *
 * Structure:
 * ┌─────────────────────────────────────────────────────┐
 * │ ScanController (header - path, scan button, status) │
 * ├──────────┬──────────────────────────────────────────┤
 * │ LeftPanel│ ToolTabs (tabbed workspace)              │
 * │ (250px)  │                                          │
 * │          │                                          │
 * ├──────────┴──────────────────────────────────────────┤
 * │ StatusBar (bottom - state indicator, stats)         │
 * └─────────────────────────────────────────────────────┘
 */

import React, { useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { ScanStateProvider, useScanState } from './state/ScanStateContext';
import ScanController from './components/ScanController';
import LeftPanel from './components/LeftPanel';
import ToolTabs from './components/ToolTabs';
import StatusBar from './components/StatusBar';

import './workbench.css';

function WorkbenchShell() {
    const [leftPanelVisible, setLeftPanelVisible] = useState(true);
    const [dropState, setDropState] = useState({ active: false, paths: [] });
    const { currentPath, navigateAndScan, setActiveTab, startScan } = useScanState();

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!(event.metaKey || event.ctrlKey) || event.altKey) {
                return;
            }

            const key = event.key.toLowerCase();
            const shortcuts = {
                '1': 'overview',
                '2': 'browser',
                '3': 'disk',
                '4': 'duplicates',
                '5': 'search',
                '6': 'settings',
                d: 'duplicates',
                f: 'search',
            };

            if (shortcuts[key]) {
                event.preventDefault();
                setActiveTab(shortcuts[key]);
                return;
            }

            if (key === 'r') {
                event.preventDefault();
                startScan(currentPath);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentPath, setActiveTab, startScan]);

    useEffect(() => {
        let unlisten;

        getCurrentWebview()
            .onDragDropEvent((event) => {
                switch (event.payload.type) {
                    case 'enter':
                        setDropState({ active: true, paths: event.payload.paths || [] });
                        break;
                    case 'over':
                        setDropState((prev) => (prev.active ? prev : { active: true, paths: [] }));
                        break;
                    case 'leave':
                        setDropState({ active: false, paths: [] });
                        break;
                    case 'drop': {
                        const paths = event.payload.paths || [];
                        setDropState({ active: false, paths: [] });
                        if (paths.length > 0) {
                            navigateAndScan(paths[0]);
                        }
                        break;
                    }
                    default:
                        break;
                }
            })
            .then((cleanup) => {
                unlisten = cleanup;
            })
            .catch(() => {
                setDropState({ active: false, paths: [] });
            });

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, [navigateAndScan]);

    return (
        <div className="workbench-root d-flex flex-column" style={{ height: '100vh', overflow: 'hidden' }}>
            {dropState.active && (
                <div className="workbench-drop-overlay">
                    <div className="workbench-drop-card">
                        <div className="workbench-drop-title">Drop a folder to scan</div>
                        <div className="workbench-drop-subtitle">
                            {dropState.paths.length > 0 ? dropState.paths[0] : 'Release to start a scan'}
                        </div>
                    </div>
                </div>
            )}

            <ScanController />

            <div className="d-flex flex-grow-1" style={{ overflow: 'hidden' }}>
                {leftPanelVisible && <LeftPanel />}

                <button
                    className="btn btn-sm border-0 d-flex align-items-center px-0"
                    onClick={() => setLeftPanelVisible(!leftPanelVisible)}
                    style={{
                        width: '12px',
                        background: 'var(--workbench-surface-alt)',
                        borderRight: '1px solid var(--workbench-border)',
                        cursor: 'col-resize',
                        fontSize: '10px',
                        color: 'var(--workbench-muted)',
                    }}
                    title={leftPanelVisible ? 'Hide panel' : 'Show panel'}
                >
                    {leftPanelVisible ? '\u25C0' : '\u25B6'}
                </button>

                <div className="flex-grow-1 d-flex flex-column" style={{ overflow: 'hidden' }}>
                    <ToolTabs />
                </div>
            </div>

            <StatusBar />
        </div>
    );
}

export default function WorkbenchLayout() {
    return (
        <ScanStateProvider>
            <WorkbenchShell />
        </ScanStateProvider>
    );
}
