/**
 * DiskUsageTool — Visualize disk usage from the current snapshot.
 *
 * Reads directly from currentSnapshot.tree — no backend calls needed.
 * Supports: bar chart, treemap, sunburst views.
 */

import React, { useState, useMemo } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useScanState } from '../state/ScanStateContext';
import { CButton, CCard, CCardBody } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilFile, cilFolder } from '@coreui/icons';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

export default function DiskUsageTool() {
    const { currentSnapshot, hasData, currentPath } = useScanState();
    const [vizType, setVizType] = useState('bars');
    const [exporting, setExporting] = useState(false);

    const children = useMemo(() => {
        if (!currentSnapshot?.tree?.children) return [];
        return [...currentSnapshot.tree.children].sort((a, b) => b.disk_entry.size - a.disk_entry.size);
    }, [currentSnapshot]);

    const totalSize = currentSnapshot?.totalSize || 1;

    async function handleExport(format) {
        setExporting(true);
        try {
            const homeDir = await invoke("get_home_directory");
            const filePath = `${homeDir}/yaanai_disk_usage.${format}`;
            await invoke("export_report", {
                format, reportType: 'disk_usage', filePath, folderName: currentPath
            });
            alert(`Exported to: ${filePath}`);
        } catch (e) {
            alert("Export failed: " + e);
        }
        setExporting(false);
    }

    if (!hasData) {
        return <div className="d-flex align-items-center justify-content-center h-100 text-muted">Scan a directory first.</div>;
    }

    return (
        <div className="p-3">
            {/* Controls */}
            <div className="d-flex align-items-center gap-2 mb-3">
                <div className="btn-group btn-group-sm">
                    <CButton color={vizType === 'bars' ? 'primary' : 'outline-primary'} onClick={() => setVizType('bars')}>Bars</CButton>
                    <CButton color={vizType === 'treemap' ? 'primary' : 'outline-primary'} onClick={() => setVizType('treemap')}>Treemap</CButton>
                    <CButton color={vizType === 'sunburst' ? 'primary' : 'outline-primary'} onClick={() => setVizType('sunburst')}>Sunburst</CButton>
                </div>
                <div className="ms-auto d-flex gap-1">
                    <CButton size="sm" color="outline-secondary" onClick={() => handleExport('json')} disabled={exporting}>JSON</CButton>
                    <CButton size="sm" color="outline-secondary" onClick={() => handleExport('csv')} disabled={exporting}>CSV</CButton>
                </div>
            </div>

            {vizType === 'bars' && <BarChart items={children} totalSize={totalSize} />}
            {vizType === 'treemap' && <Treemap items={children} totalSize={totalSize} />}
            {vizType === 'sunburst' && <Sunburst items={children} totalSize={totalSize} />}
        </div>
    );
}

function BarChart({ items, totalSize }) {
    const maxSize = items[0]?.disk_entry?.size || 1;
    return (
        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="table table-sm table-hover" style={{ fontSize: '12px' }}>
                <thead className="table-light sticky-top">
                    <tr>
                        <th style={{ width: '35%' }}>Name</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>Size</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>% of Total</th>
                        <th style={{ width: '45%' }}>Usage</th>
                    </tr>
                </thead>
                <tbody>
                    {items.slice(0, 100).map((item, i) => {
                        const pct = (item.disk_entry.size / maxSize) * 100;
                        const totalPct = (item.disk_entry.size / totalSize) * 100;
                        const name = item.disk_entry.path.split('/').pop();
                        const isDir = item.node_type === 'directory';
                        return (
                            <tr key={i}>
                                <td>
                                    <CIcon icon={isDir ? cilFolder : cilFile}
                                        className={`me-1 ${isDir ? 'text-warning' : 'text-primary'}`} size="sm" />
                                    {name}
                                </td>
                                <td className="text-end text-muted">{formatBytes(item.disk_entry.size)}</td>
                                <td className="text-end text-muted">{totalPct.toFixed(1)}%</td>
                                <td>
                                    <div className="progress" style={{ height: '14px' }}>
                                        <div className={`progress-bar ${isDir ? 'bg-warning' : 'bg-primary'}`}
                                            style={{ width: `${pct}%` }} />
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {items.length > 100 && (
                <div className="text-center text-muted small">Showing top 100 of {items.length} items</div>
            )}
        </div>
    );
}

function Treemap({ items, totalSize }) {
    if (items.length === 0) return <div className="text-center text-muted py-4">No data</div>;

    const W = 800, H = 500;
    const packed = [];
    let x = 0, y = 0, rowH = 0;
    for (const item of items) {
        const area = (item.disk_entry.size / totalSize) * (W * H);
        const w = Math.sqrt(area * (W / H));
        const h = area / w;
        if (x + w > W) { x = 0; y += rowH; rowH = 0; }
        const scale = Math.min((W - x) / w, (H - y) / h);
        const fw = w * scale, fh = h * scale;
        packed.push({ ...item, x, y, width: fw, height: fh });
        x += fw;
        rowH = Math.max(rowH, fh);
        if (y + rowH >= H) break;
    }

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ border: '1px solid #dee2e6', borderRadius: '4px' }}>
            {packed.map((item, i) => {
                const pct = (item.disk_entry.size / totalSize) * 100;
                const isDir = item.node_type === 'directory';
                const name = item.disk_entry.path.split('/').pop();
                const showLabel = item.width > 40 && item.height > 20;
                return (
                    <g key={i}>
                        <rect x={item.x} y={item.y} width={item.width} height={item.height}
                            fill={`hsl(${isDir ? 45 : 210}, ${50 + pct * 0.5}%, ${75 - pct * 0.3}%)`}
                            stroke="white" strokeWidth="1" style={{ cursor: 'pointer' }} />
                        {showLabel && (
                            <text x={item.x + item.width / 2} y={item.y + item.height / 2}
                                textAnchor="middle" dominantBaseline="middle"
                                fontSize={Math.min(item.width / 8, item.height / 4, 12)}
                                fill="white" fontWeight="bold"
                                style={{ pointerEvents: 'none', textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                                {name?.length > 10 ? name.substring(0, 8) + '..' : name}
                            </text>
                        )}
                        <title>{name} ({formatBytes(item.disk_entry.size)}, {pct.toFixed(1)}%)</title>
                    </g>
                );
            })}
        </svg>
    );
}

function Sunburst({ items, totalSize }) {
    const top = items.slice(0, 12);
    return (
        <div className="d-flex justify-content-center" style={{ height: '500px' }}>
            <svg width="500" height="500" viewBox="0 0 500 500">
                {top.map((item, i) => {
                    const pct = item.disk_entry.size / totalSize;
                    const angle = pct * 360;
                    const start = top.slice(0, i).reduce((s, t) => s + (t.disk_entry.size / totalSize) * 360, 0);
                    const x1 = 250 + 120 * Math.cos((start * Math.PI) / 180);
                    const y1 = 250 + 120 * Math.sin((start * Math.PI) / 180);
                    const x2 = 250 + 120 * Math.cos(((start + angle) * Math.PI) / 180);
                    const y2 = 250 + 120 * Math.sin(((start + angle) * Math.PI) / 180);
                    const large = angle > 180 ? 1 : 0;
                    const isDir = item.node_type === 'directory';
                    const name = item.disk_entry.path.split('/').pop();
                    return (
                        <g key={i}>
                            <path d={`M 250 250 L ${x1} ${y1} A 120 120 0 ${large} 1 ${x2} ${y2} Z`}
                                fill={`hsl(${isDir ? 45 : 210}, 70%, ${55 + i * 3}%)`}
                                stroke="white" strokeWidth="1.5" opacity="0.85" />
                            {pct > 0.04 && (
                                <text x={250 + 80 * Math.cos((start + angle / 2) * Math.PI / 180)}
                                    y={250 + 80 * Math.sin((start + angle / 2) * Math.PI / 180)}
                                    textAnchor="middle" dominantBaseline="middle"
                                    fontSize="10" fill="#333" fontWeight="bold">
                                    {name?.substring(0, 8)}
                                </text>
                            )}
                            <title>{name} ({formatBytes(item.disk_entry.size)}, {(pct * 100).toFixed(1)}%)</title>
                        </g>
                    );
                })}
                <circle cx="250" cy="250" r="40" fill="white" stroke="#dee2e6" strokeWidth="2" />
                <text x="250" y="244" textAnchor="middle" fontSize="12" fill="#333" fontWeight="bold">
                    {items.length} items
                </text>
                <text x="250" y="260" textAnchor="middle" fontSize="10" fill="#666">
                    {formatBytes(totalSize)}
                </text>
            </svg>
        </div>
    );
}
