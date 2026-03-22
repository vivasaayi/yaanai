import {invoke} from "@tauri-apps/api/core";

import {listen} from "@tauri-apps/api/event";
import React, {useState, useEffect} from "react";
import { useFileSystem } from './FileSystemContext';
import {
    CButton, CCard, CCardBody, CCardHeader,
    CCol, CRow, CProgress, CProgressBar, CBadge
} from "@coreui/react";

import CIcon from "@coreui/icons-react";
import {cilFile, cilFolder} from "@coreui/icons";

import {
    DataGrid,
    Column
} from 'devextreme-react/data-grid';

import TreeList, {
    Column as TreeListColumn, ColumnChooser, HeaderFilter, SearchPanel, Selection,
} from 'devextreme-react/tree-list';

import 'devextreme/dist/css/dx.light.css';

// Add custom styles for animations
const styles = `
    .spin {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .treemap-item:hover {
        opacity: 0.8;
        transform: scale(1.02);
        transition: all 0.2s ease;
    }
`;

// Inject styles
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
}

function TreeBuilder() {
    const {
        currentPath, treeData, loading, progress, progressText,
        scanErrors, setCurrentPath, scanDirectory, chooseFolder,
        setScanErrors, findTrueDuplicates, exportReport
    } = useFileSystem();

    const [files, setFiles] = useState([]);
    const [analysisType, setAnalysisType] = useState('tree');
    const [visualizationType, setVisualizationType] = useState('treelist');
    const [showErrors, setShowErrors] = useState(false);
    const [duplicateResult, setDuplicateResult] = useState(null);
    const [diskUsageData, setDiskUsageData] = useState([]);
    const [searchPattern, setSearchPattern] = useState('');
    const [searchResults, setSearchResults] = useState(null);

    // Update local files when treeData changes
    useEffect(() => {
        if (treeData && analysisType === 'tree') {
            setFiles(treeData);
        }
    }, [treeData, analysisType]);

    async function fetchFiles() {
        await scanDirectory(currentPath);
    }

    async function runAnalysis(type) {
        setAnalysisType(type);

        if (type === 'tree') {
            if (treeData) {
                setFiles(treeData);
            } else {
                await scanDirectory(currentPath);
            }
        } else if (type === 'duplicates') {
            try {
                const result = await findTrueDuplicates();
                setDuplicateResult(result);
            } catch (error) {
                console.error("Duplicate analysis failed:", error);
            }
        } else if (type === 'disk') {
            try {
                const diskUsage = await invoke("analyze_disk_usage", { folderName: currentPath });
                setDiskUsageData(diskUsage);
            } catch (error) {
                console.error("Disk analysis failed:", error);
            }
        } else if (type === 'search') {
            // Search is triggered separately
        }
    }

    async function handleSearch() {
        if (!searchPattern.trim()) return;
        setAnalysisType('search');
        try {
            const result = await invoke("search_files", {
                folderName: currentPath,
                pattern: searchPattern,
                recursive: true,
                extensions: null,
                minSize: null,
                maxSize: null,
            });
            setSearchResults(result);
        } catch (error) {
            console.error("Search failed:", error);
        }
    }

    async function handleExport(format) {
        const homeDir = await invoke("get_home_directory");
        const reportType = analysisType === 'duplicates' ? 'duplicates' : analysisType === 'disk' ? 'disk_usage' : 'tree';
        const filePath = `${homeDir}/yaanai_export_${reportType}.${format}`;
        try {
            const resultPath = await exportReport(format, reportType, filePath, currentPath);
            alert(`Exported to: ${resultPath}`);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Export failed: " + error);
        }
    }

    function renderFileName(data) {
        if(data.data.is_dir) {
            return (
                <span>
                    <CIcon className="text-success" icon={cilFolder}/>
                    <b> {data.value}</b>
                </span>
            );
        }
        return (
            <span>
                <CIcon icon={cilFile}/> {data.value}
            </span>
        );
    }

    function renderTreeList() {
        return (
            <TreeList
                dataSource={files.children || []}
                showBorders={true}
                columnAutoWidth={true}
                wordWrapEnabled={true}
                keyExpr="disk_entry.path"
                parentIdExpr="disk_entry.path"
                id="tasks"
                dataStructure="tree"
                itemsExpr="children"
            >
                <SearchPanel visible={true} width={250} />
                <HeaderFilter visible={true} />
                <Selection mode="multiple" />
                <ColumnChooser enabled={true} />
                <TreeListColumn dataField="node_type" width={300} />
                <TreeListColumn dataField="disk_entry.path" caption="Path" minWidth={100} />
                <TreeListColumn dataField="disk_entry.size" caption="Size (bytes)" minWidth={100} />
                <TreeListColumn dataField="disk_entry.size_h" caption="Size" minWidth={100} />
            </TreeList>
        );
    }

    function renderDuplicates() {
        if (!duplicateResult) {
            return (
                <div className="text-center p-4 text-muted">
                    Click "Duplicates" to scan for duplicate files using SHA256 content hashing.
                </div>
            );
        }

        const { groups } = duplicateResult;
        if (groups.length === 0) {
            return (
                <div className="text-center p-4 text-muted">
                    No duplicate files found.
                </div>
            );
        }

        return (
            <div>
                <div className="mb-3 p-3 bg-light border rounded">
                    <div className="d-flex gap-4">
                        <div><strong>{duplicateResult.total_files_scanned}</strong> <span className="small text-muted">Files Scanned</span></div>
                        <div><strong className="text-warning">{groups.length}</strong> <span className="small text-muted">Groups</span></div>
                        <div><strong className="text-danger">{duplicateResult.total_duplicates}</strong> <span className="small text-muted">Duplicates</span></div>
                        <div><strong className="text-danger">{duplicateResult.total_wasted_space_h}</strong> <span className="small text-muted">Wasted</span></div>
                    </div>
                </div>
                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                    {groups.map((group) => (
                        <div key={group.hash} className="mb-2 border rounded p-2">
                            <div className="d-flex align-items-center gap-2 mb-1">
                                <strong>{group.files[0]?.name}</strong>
                                <CBadge color="warning">{group.files.length} copies</CBadge>
                                <CBadge color="info">{group.size_h}</CBadge>
                                <CBadge color="danger">Wasting {group.wasted_space_h}</CBadge>
                            </div>
                            {group.files.map((file, i) => (
                                <div key={file.path} className="small text-muted ps-3">
                                    {i === 0 ? '\u2705' : '\u274C'} {file.path}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    function renderDiskUsage() {
        if (diskUsageData.length === 0) {
            return (
                <div className="text-center p-4 text-muted">
                    Click "Disk Usage" to analyze directory sizes.
                </div>
            );
        }

        const sorted = [...diskUsageData].sort((a, b) => b.size - a.size);
        const maxSize = sorted[0]?.size || 1;

        return (
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="table table-sm table-hover">
                    <thead className="table-light sticky-top">
                        <tr>
                            <th style={{ width: '40%' }}>Name</th>
                            <th style={{ width: '15%' }}>Size</th>
                            <th style={{ width: '45%' }}>Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.slice(0, 100).map((item, index) => {
                            const percentage = (item.size / maxSize) * 100;
                            return (
                                <tr key={index} className={item.is_dir ? 'table-secondary' : ''}>
                                    <td>
                                        <CIcon icon={item.is_dir ? cilFolder : cilFile}
                                            className={`me-2 ${item.is_dir ? 'text-warning' : 'text-primary'}`}
                                            size="sm" />
                                        <span className="text-truncate">{item.name}</span>
                                    </td>
                                    <td className="text-end">
                                        <small className="text-muted fw-bold">{item.size_h}</small>
                                    </td>
                                    <td>
                                        <div className="d-flex align-items-center">
                                            <div className="progress flex-grow-1 me-2" style={{ height: '16px' }}>
                                                <div
                                                    className={`progress-bar ${item.is_dir ? 'bg-warning' : 'bg-primary'}`}
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                            <small className="text-muted">{percentage.toFixed(1)}%</small>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    function renderSearchResults() {
        if (!searchResults) {
            return (
                <div className="text-center p-4 text-muted">
                    Enter a search pattern above and press Enter or click Search.
                </div>
            );
        }

        const { results } = searchResults;
        if (results.length === 0) {
            return (
                <div className="text-center p-4 text-muted">
                    No files matching "{searchPattern}" found.
                </div>
            );
        }

        return (
            <div>
                <div className="mb-2 small text-muted">
                    {searchResults.total_matches} matches in {searchResults.files_searched} files searched
                    {searchResults.errors.length > 0 && ` (${searchResults.errors.length} errors)`}
                </div>
                <DataGrid
                    dataSource={results}
                    showBorders={true}
                    columnAutoWidth={true}
                >
                    <Column dataField="name" caption="Name" />
                    <Column dataField="path" caption="Path" />
                    <Column dataField="size_h" caption="Size" width={100} />
                    <Column dataField="is_dir" caption="Dir" width={60} />
                    <Column dataField="matched_on" caption="Match" width={80} />
                </DataGrid>
            </div>
        );
    }

    function packTreemap(items, width, height, totalSize) {
        const packed = [];
        let x = 0, y = 0, rowHeight = 0;
        const sortedItems = [...items].sort((a, b) => b.disk_entry.size - a.disk_entry.size);
        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            const aspectRatio = width / height;
            const itemArea = (item.disk_entry.size / totalSize) * (width * height);
            const itemWidth = Math.sqrt(itemArea * aspectRatio);
            const itemHeight = itemArea / itemWidth;
            if (x + itemWidth > width) {
                x = 0;
                y += rowHeight;
                rowHeight = 0;
            }
            const scale = Math.min((width - x) / itemWidth, (height - y) / itemHeight);
            const finalWidth = itemWidth * scale;
            const finalHeight = itemHeight * scale;
            packed.push({ ...item, x, y, width: finalWidth, height: finalHeight });
            x += finalWidth;
            rowHeight = Math.max(rowHeight, finalHeight);
            if (y + rowHeight >= height) break;
        }
        return packed;
    }

    function renderTreemap() {
        if (!files.children || files.children.length === 0) {
            return <div className="text-center p-4 text-muted">No data for treemap. Scan a directory first.</div>;
        }
        const allItems = files.children.sort((a, b) => b.disk_entry.size - a.disk_entry.size);
        const totalSize = files.disk_entry?.size || allItems.reduce((sum, item) => sum + item.disk_entry.size, 0);
        const packedItems = packTreemap(allItems, 800, 500, totalSize);

        return (
            <div className="position-relative" style={{ height: '600px', overflow: 'hidden' }}>
                <svg width="100%" height="100%" viewBox="0 0 800 500" style={{ border: '1px solid #dee2e6', borderRadius: '4px' }}>
                    {packedItems.map((item, index) => {
                        const percentage = (item.disk_entry.size / totalSize) * 100;
                        const isDir = item.disk_entry.is_dir;
                        const fileName = item.disk_entry.path.split('/').pop() || 'Unknown';
                        const showLabel = item.width > 40 && item.height > 20;
                        return (
                            <g key={index}>
                                <rect x={item.x} y={item.y} width={item.width} height={item.height}
                                    fill={`hsl(${isDir ? 45 : 210}, ${50 + percentage * 0.5}%, ${75 - percentage * 0.3}%)`}
                                    stroke="white" strokeWidth="1" className="treemap-item" style={{ cursor: 'pointer' }} />
                                {showLabel && (
                                    <text x={item.x + item.width / 2} y={item.y + item.height / 2}
                                        textAnchor="middle" dominantBaseline="middle"
                                        fontSize={Math.min(item.width / 8, item.height / 4, 12)}
                                        fill="white" fontWeight="bold"
                                        style={{ pointerEvents: 'none', textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                                        {fileName.length > 10 ? fileName.substring(0, 8) + '...' : fileName}
                                    </text>
                                )}
                                <title>{fileName} {isDir ? '(Folder)' : '(File)'} Size: {(item.disk_entry.size / 1024 / 1024).toFixed(2)} MB ({percentage.toFixed(2)}%)</title>
                            </g>
                        );
                    })}
                </svg>
                <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,255,255,0.9)', padding: '8px 12px', borderRadius: '4px', fontSize: '12px' }}>
                    <div><strong>{allItems.length} items</strong></div>
                    <div>Total: {(totalSize / 1024 / 1024).toFixed(1)} MB</div>
                    <div className="mt-1">
                        <span style={{ color: 'hsl(210, 70%, 50%)' }}>&#9632;</span> Files
                        <span style={{ color: 'hsl(45, 70%, 50%)', marginLeft: '8px' }}>&#9632;</span> Folders
                    </div>
                </div>
            </div>
        );
    }

    function renderSunburst() {
        if (!files.children || files.children.length === 0) {
            return <div className="text-center p-4 text-muted">No data for sunburst. Scan a directory first.</div>;
        }
        const items = files.children.sort((a, b) => b.disk_entry.size - a.disk_entry.size).slice(0, 12);
        const totalSize = files.disk_entry?.size || items.reduce((sum, item) => sum + item.disk_entry.size, 0);

        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '500px' }}>
                <svg width="500" height="500" viewBox="0 0 500 500">
                    <circle cx="250" cy="250" r="120" fill="none" stroke="#e9ecef" strokeWidth="1" />
                    {items.map((item, index) => {
                        const percentage = item.disk_entry.size / totalSize;
                        const angle = percentage * 360;
                        const startAngle = items.slice(0, index).reduce((sum, i) => sum + (i.disk_entry.size / totalSize) * 360, 0);
                        const x1 = 250 + 40 * Math.cos((startAngle * Math.PI) / 180);
                        const y1 = 250 + 40 * Math.sin((startAngle * Math.PI) / 180);
                        const x2 = 250 + 40 * Math.cos(((startAngle + angle) * Math.PI) / 180);
                        const y2 = 250 + 40 * Math.sin(((startAngle + angle) * Math.PI) / 180);
                        const largeArcFlag = angle > 180 ? 1 : 0;
                        const isDir = item.disk_entry.is_dir;
                        const fileName = item.disk_entry.path.split('/').pop() || 'Unknown';
                        return (
                            <g key={index}>
                                <path d={`M 250 250 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                                    fill={`hsl(${isDir ? 45 : 210}, 70%, 60%)`} stroke="white" strokeWidth="1" opacity="0.8" />
                                {percentage > 0.03 && (
                                    <text x={250 + 60 * Math.cos((startAngle + angle / 2) * Math.PI / 180)}
                                        y={250 + 60 * Math.sin((startAngle + angle / 2) * Math.PI / 180)}
                                        textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#333" fontWeight="bold">
                                        {fileName.substring(0, 6)}
                                    </text>
                                )}
                                <text x={250 + 90 * Math.cos((startAngle + angle / 2) * Math.PI / 180)}
                                    y={250 + 90 * Math.sin((startAngle + angle / 2) * Math.PI / 180)}
                                    textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#666">
                                    {(item.disk_entry.size / 1024 / 1024).toFixed(1)}M
                                </text>
                            </g>
                        );
                    })}
                    <circle cx="250" cy="250" r="35" fill="white" stroke="#dee2e6" strokeWidth="2" />
                    <text x="250" y="240" textAnchor="middle" fontSize="12" fill="#333" fontWeight="bold">{files.children.length} items</text>
                    <text x="250" y="255" textAnchor="middle" fontSize="10" fill="#666">{(totalSize / 1024 / 1024).toFixed(1)} MB</text>
                </svg>
            </div>
        );
    }

    function renderBarChart() {
        if (!files.children || files.children.length === 0) {
            return <div className="text-center p-4 text-muted">No data for bar chart. Scan a directory first.</div>;
        }
        const items = files.children.sort((a, b) => b.disk_entry.size - a.disk_entry.size).slice(0, 100);
        const maxSize = Math.max(...items.map(item => item.disk_entry.size));

        return (
            <div style={{ height: '600px', overflowY: 'auto' }}>
                <table className="table table-sm table-hover">
                    <thead className="table-light sticky-top">
                        <tr>
                            <th style={{ width: '40%' }}>Name</th>
                            <th style={{ width: '15%' }}>Size</th>
                            <th style={{ width: '45%' }}>Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const percentage = (item.disk_entry.size / maxSize) * 100;
                            const sizeMB = (item.disk_entry.size / 1024 / 1024).toFixed(1);
                            const fileName = item.disk_entry.path.split('/').pop() || 'Unknown';
                            const isDir = item.disk_entry.is_dir;
                            return (
                                <tr key={index} className={isDir ? 'table-secondary' : ''}>
                                    <td>
                                        <CIcon icon={isDir ? cilFolder : cilFile}
                                            className={`me-2 ${isDir ? 'text-warning' : 'text-primary'}`} size="sm" />
                                        <span className="text-truncate" title={fileName}>{fileName}</span>
                                    </td>
                                    <td className="text-end"><small className="text-muted fw-bold">{sizeMB} MB</small></td>
                                    <td>
                                        <div className="d-flex align-items-center">
                                            <div className="progress flex-grow-1 me-2" style={{ height: '20px' }}>
                                                <div className={`progress-bar ${isDir ? 'bg-warning' : 'bg-primary'}`}
                                                    style={{ width: `${percentage}%` }} />
                                            </div>
                                            <small className="text-muted">{percentage.toFixed(1)}%</small>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    function renderVisualization() {
        if (analysisType === 'duplicates') return renderDuplicates();
        if (analysisType === 'disk') return renderDiskUsage();
        if (analysisType === 'search') return renderSearchResults();

        switch (visualizationType) {
            case 'treelist': return renderTreeList();
            case 'treemap': return renderTreemap();
            case 'sunburst': return renderSunburst();
            case 'bars': return renderBarChart();
            default: return renderTreeList();
        }
    }

    return (
        <CRow>
            <CCol xs={12}>
                <CCard className="mb-4">
                    <CCardHeader>
                        <div className="d-flex justify-content-between align-items-center">
                            <span>File System Analyzer</span>
                            <small className="text-muted">{currentPath}</small>
                        </div>
                    </CCardHeader>
                    <CCardBody>
                        {/* Control Panel */}
                        <div className="mb-3">
                            <div className="d-flex gap-2 align-items-center mb-2">
                                <CButton onClick={chooseFolder} color="secondary" size="sm">Choose Folder</CButton>
                                <div className="flex-grow-1">
                                    <input type="text" className="form-control form-control-sm"
                                        value={currentPath} onChange={(e) => setCurrentPath(e.target.value)}
                                        placeholder="Enter folder path..." disabled={loading} />
                                </div>
                                <CButton onClick={fetchFiles}
                                    color={treeData ? "success" : "primary"}
                                    disabled={loading || !currentPath} size="sm">
                                    {loading ? "Scanning..." : treeData ? "Rescan" : "Scan Directory"}
                                </CButton>
                            </div>
                            {currentPath && !loading && (
                                <div className="small text-muted">
                                    {treeData ? 'Directory scanned and cached' : 'Ready to scan'}
                                </div>
                            )}
                        </div>

                        {/* Progress */}
                        {loading && (
                            <div className="mb-3">
                                <div className="d-flex align-items-center mb-2">
                                    <strong className="me-2">Scanning</strong>
                                    <small className="text-muted">{progressText}</small>
                                </div>
                                <CProgress className="mb-2">
                                    <CProgressBar animated color="primary"
                                        value={progress ? Math.min((progress.files_processed / Math.max(progress.files_processed + progress.directories_processed, 1)) * 100, 100) : 0} />
                                </CProgress>
                                {progress && (
                                    <div className="d-flex justify-content-between text-muted small">
                                        <span>{progress.files_processed} files</span>
                                        <span>{progress.directories_processed} directories</span>
                                        <span>{progress.total_size_bytes ? `${(progress.total_size_bytes / 1024 / 1024).toFixed(1)} MB` : '0 MB'}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Analysis Type Selection */}
                        {!loading && (
                            <div className="mb-3">
                                <h6>Analysis Type:</h6>
                                <div className="btn-group btn-group-sm me-3" role="group">
                                    <CButton color={analysisType === 'tree' ? 'primary' : 'outline-primary'}
                                        onClick={() => runAnalysis('tree')} size="sm">
                                        Directory Tree
                                    </CButton>
                                    <CButton color={analysisType === 'duplicates' ? 'primary' : 'outline-primary'}
                                        onClick={() => runAnalysis('duplicates')} size="sm">
                                        Duplicates (SHA256)
                                    </CButton>
                                    <CButton color={analysisType === 'disk' ? 'primary' : 'outline-primary'}
                                        onClick={() => runAnalysis('disk')} size="sm">
                                        Disk Usage
                                    </CButton>
                                    <CButton color={analysisType === 'search' ? 'primary' : 'outline-primary'}
                                        onClick={() => setAnalysisType('search')} size="sm">
                                        Search
                                    </CButton>
                                </div>

                                {/* Search bar - visible when search is active */}
                                {analysisType === 'search' && (
                                    <div className="d-flex gap-2 mt-2">
                                        <input type="text" className="form-control form-control-sm"
                                            value={searchPattern}
                                            onChange={(e) => setSearchPattern(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                            placeholder="Search pattern (regex, glob, or substring)..." />
                                        <CButton onClick={handleSearch} color="primary" size="sm" disabled={loading}>
                                            Search
                                        </CButton>
                                    </div>
                                )}

                                {/* Visualization selector for tree mode */}
                                {analysisType === 'tree' && treeData && (
                                    <>
                                        <h6 className="mt-3">Visualization:</h6>
                                        <div className="btn-group btn-group-sm" role="group">
                                            <CButton color={visualizationType === 'treelist' ? 'success' : 'outline-success'}
                                                onClick={() => setVisualizationType('treelist')} size="sm">Tree List</CButton>
                                            <CButton color={visualizationType === 'treemap' ? 'success' : 'outline-success'}
                                                onClick={() => setVisualizationType('treemap')} size="sm">Treemap</CButton>
                                            <CButton color={visualizationType === 'sunburst' ? 'success' : 'outline-success'}
                                                onClick={() => setVisualizationType('sunburst')} size="sm">Sunburst</CButton>
                                            <CButton color={visualizationType === 'bars' ? 'success' : 'outline-success'}
                                                onClick={() => setVisualizationType('bars')} size="sm">Bar Chart</CButton>
                                        </div>
                                    </>
                                )}

                                {/* Export buttons */}
                                {(treeData || duplicateResult || diskUsageData.length > 0) && (
                                    <div className="mt-3">
                                        <span className="small text-muted me-2">Export:</span>
                                        <CButton onClick={() => handleExport('json')} color="outline-secondary" size="sm" className="me-1">
                                            JSON
                                        </CButton>
                                        <CButton onClick={() => handleExport('csv')} color="outline-secondary" size="sm">
                                            CSV
                                        </CButton>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Visualization Area */}
                        <div className="border rounded p-3" style={{ minHeight: '400px' }}>
                            {renderVisualization()}
                        </div>

                        {/* Scan Errors */}
                        {scanErrors && scanErrors.length > 0 && (
                            <div className="mt-3">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <h6 className="mb-0 text-warning">
                                        Scan Errors ({scanErrors.length})
                                    </h6>
                                    <div>
                                        <CButton color="warning" size="sm" variant="outline"
                                            onClick={() => setShowErrors(!showErrors)}>
                                            {showErrors ? 'Hide' : 'Show'} Errors
                                        </CButton>
                                        <CButton color="secondary" size="sm" variant="outline" className="ms-2"
                                            onClick={() => setScanErrors([])}>Clear</CButton>
                                    </div>
                                </div>
                                {showErrors && (
                                    <div className="border rounded p-3" style={{ maxHeight: '300px', overflowY: 'auto', backgroundColor: '#fff3cd' }}>
                                        {scanErrors.map((error, index) => (
                                            <div key={index} className="mb-2 pb-2 border-bottom">
                                                <div className="fw-bold text-danger small">
                                                    {error.error_type === 'permission_denied' ? 'Permission Denied' :
                                                        error.error_type === 'not_found' ? 'Not Found' : 'Error'}
                                                </div>
                                                <div className="small text-dark"><code>{error.path}</code></div>
                                                <div className="small text-muted">{error.error_message}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Status Footer */}
                        {!loading && treeData && (
                            <div className="mt-3 text-muted small">
                                {analysisType === 'tree' && `${files.children ? files.children.length : 0} items scanned`}
                                {analysisType === 'duplicates' && duplicateResult && `${duplicateResult.groups.length} duplicate groups, ${duplicateResult.total_wasted_space_h} wasted`}
                                {analysisType === 'disk' && `${diskUsageData.length} directories analyzed`}
                                {analysisType === 'search' && searchResults && `${searchResults.total_matches} matches found`}
                                {scanErrors.length > 0 && ` | ${scanErrors.length} errors`}
                            </div>
                        )}
                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    );
}

export default TreeBuilder;
