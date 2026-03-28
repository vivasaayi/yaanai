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

import React, { useState } from 'react';
import { ScanStateProvider } from './state/ScanStateContext';
import ScanController from './components/ScanController';
import LeftPanel from './components/LeftPanel';
import ToolTabs from './components/ToolTabs';
import StatusBar from './components/StatusBar';

import './workbench.css';

export default function WorkbenchLayout() {
    const [leftPanelVisible, setLeftPanelVisible] = useState(true);

    return (
        <ScanStateProvider>
            <div className="workbench-root d-flex flex-column" style={{ height: '100vh', overflow: 'hidden' }}>
                {/* Header: Scan Controller */}
                <ScanController />

                {/* Main content area */}
                <div className="d-flex flex-grow-1" style={{ overflow: 'hidden' }}>
                    {/* Left Panel (collapsible) */}
                    {leftPanelVisible && <LeftPanel />}

                    {/* Left panel toggle */}
                    <button
                        className="btn btn-sm border-0 d-flex align-items-center px-0"
                        onClick={() => setLeftPanelVisible(!leftPanelVisible)}
                        style={{
                            width: '12px',
                            background: '#f8f9fa',
                            borderRight: '1px solid #dee2e6',
                            cursor: 'col-resize',
                            fontSize: '10px',
                            color: '#adb5bd',
                        }}
                        title={leftPanelVisible ? 'Hide panel' : 'Show panel'}
                    >
                        {leftPanelVisible ? '\u25C0' : '\u25B6'}
                    </button>

                    {/* Tool area */}
                    <div className="flex-grow-1 d-flex flex-column" style={{ overflow: 'hidden' }}>
                        <ToolTabs />
                    </div>
                </div>

                {/* Status Bar */}
                <StatusBar />
            </div>
        </ScanStateProvider>
    );
}
