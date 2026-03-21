import {invoke} from "@tauri-apps/api/core";

import {listen} from "@tauri-apps/api/event";
import React, {useState, useEffect, createContext, useContext} from "react";
import { useFileSystem } from './FileSystemContext';
import {
    CButton,
    CCard,
    CCardBody, CCardFooter, CCardGroup,
    CCardHeader,
    CCardImage, CCardLink,
    CCardSubtitle,
    CCardText,
    CCardTitle,
    CCol, CListGroup, CListGroupItem, CNav, CNavItem, CNavLink, CRow,
    CProgress, CProgressBar
} from "@coreui/react";

import {DocsExample} from "../../../coreui/components/index.js";
import ReactImg from "../../../assets/images/react.jpg";

import CIcon from "@coreui/icons-react";
import {cilFile, cilFolder} from "@coreui/icons";

import {
    DataGrid,
    Column
} from 'devextreme-react/data-grid';

import { Template } from 'devextreme-react/core/template';

import TreeList, {
    Column as TreeListColumn, ColumnChooser, HeaderFilter, SearchPanel, Selection, Lookup,
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
    // Use shared file system context
    const {
        currentPath,
        treeData,
        loading,
        progress,
        progressText,
        scanErrors,
        setCurrentPath,
        scanDirectory,
        chooseFolder,
        setScanErrors
    } = useFileSystem();

    const [files, setFiles] = useState([]); // Local state for current view
    const [analysisType, setAnalysisType] = useState('tree'); // 'tree', 'duplicates', 'disk'
    const [visualizationType, setVisualizationType] = useState('treelist'); // 'treelist', 'treemap', 'sunburst', 'bars'
    const [showErrors, setShowErrors] = useState(false); // Toggle error list visibility

    // Update local files when treeData changes
    useEffect(() => {
        if (treeData) {
            setFiles(treeData);
        }
    }, [treeData]);

    // Update analysis when analysisType changes
    useEffect(() => {
        if (analysisType === 'tree' && treeData) {
            setFiles(treeData);
        }
    }, [analysisType, treeData]);

    async function fetchFiles() {
        await scanDirectory(currentPath);
    }

    async function runAnalysis(analysisType) {
        if (!treeData) {
            await scanDirectory(currentPath);
            return;
        }

        try {
            switch (analysisType) {
                case 'duplicates':
                    // This will use the shared findDuplicates function
                    setLoading(true);
                    const duplicates = await invoke("get_files_map", { folderName: currentPath });
                    setFiles(duplicates);
                    setLoading(false);
                    break;
                case 'disk':
                    // This will use the shared analyzeDiskUsage function
                    setLoading(true);
                    const diskUsage = await invoke("analyze_disk_usage", { folderName: currentPath });
                    setFiles(diskUsage);
                    setLoading(false);
                    break;
                default:
                    setFiles(treeData);
            }
            setAnalysisType(analysisType);
        } catch (error) {
            console.error("Analysis failed:", error);
            setLoading(false);
        }
    }

    function handlePathChange(e) {
        const path = e.target.getAttribute("data-path")
        // stack.push(currentPath)
        // setCurrentPath(path);
    }

    function renderFileName(data) {
        if(data.data.is_dir) {
            return (<>
                    <span data-path={data.data.path} onClick={handlePathChange}>
                        <CIcon className="text-success" data-path={data.data.path} icon={cilFolder}/>
                            <b data-path={data.data.path} > {data.value}</b></span>
                </>
            );
        }
        return <>
            <span data-path={data.data.path}>
                <CIcon data-path={data.data.path} icon={cilFile}/> {data.value}</span>
        </>;
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
                <TreeListColumn
                    dataField="disk_entry.path"
                    caption="Path"
                    minWidth={100}
                />
                <TreeListColumn
                    dataField="disk_entry.size"
                    caption="Size (bytes)"
                    minWidth={100}
                />
                <TreeListColumn
                    dataField="disk_entry.size_h"
                    caption="Size"
                    minWidth={100}
                />
            </TreeList>
        );
    }

    function renderTreemap() {
        console.log("Treemap data:", files);

        if (!files.children || files.children.length === 0) {
            return (
                <div className="text-center p-4">
                    <CIcon icon="cil-chart-pie" size="3xl" className="text-muted mb-3" />
                    <h5>Treemap Visualization</h5>
                    <p className="text-muted">No data available for treemap visualization</p>
                    <small className="text-info">Debug: {files.children ? `Found ${files.children.length} children` : 'No children array'}</small>
                </div>
            );
        }

        // Get all items sorted by size for better packing
        const allItems = files.children
            .sort((a, b) => b.disk_entry.size - a.disk_entry.size);

        console.log("Treemap allItems:", allItems);

        const totalSize = files.disk_entry?.size || allItems.reduce((sum, item) => sum + item.disk_entry.size, 0);

        // Use a more sophisticated treemap algorithm
        const packedItems = packTreemap(allItems, 800, 500, totalSize);

        console.log("Treemap packedItems:", packedItems);

        return (
            <div className="treemap-container position-relative" style={{height: '600px', overflow: 'hidden'}}>
                <svg width="100%" height="100%" viewBox="0 0 800 500" style={{border: '1px solid #dee2e6', borderRadius: '4px'}}>
                    {packedItems.map((item, index) => {
                        const percentage = (item.disk_entry.size / totalSize) * 100;
                        const isDir = item.disk_entry.is_dir;
                        const fileName = item.disk_entry.path.split('/').pop() || 'Unknown';
                        
                        // Only show labels for items that are large enough
                        const showLabel = item.width > 40 && item.height > 20;
                        
                        return (
                            <g key={index}>
                                <rect
                                    x={item.x}
                                    y={item.y}
                                    width={item.width}
                                    height={item.height}
                                    fill={`hsl(${isDir ? 45 : 210}, ${50 + percentage * 0.5}%, ${75 - percentage * 0.3}%)`}
                                    stroke="white"
                                    strokeWidth="1"
                                    className="treemap-item"
                                    style={{cursor: 'pointer'}}
                                />
                                
                                {showLabel && (
                                    <text
                                        x={item.x + item.width / 2}
                                        y={item.y + item.height / 2}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={Math.min(item.width / 8, item.height / 4, 12)}
                                        fill="white"
                                        fontWeight="bold"
                                        style={{pointerEvents: 'none', textShadow: '1px 1px 2px rgba(0,0,0,0.7)'}}
                                    >
                                        {fileName.length > 10 ? fileName.substring(0, 8) + '...' : fileName}
                                    </text>
                                )}
                                
                                {/* Size indicator in corner for small items */}
                                {!showLabel && item.width > 20 && item.height > 15 && (
                                    <text
                                        x={item.x + item.width - 3}
                                        y={item.y + item.height - 3}
                                        textAnchor="end"
                                        dominantBaseline="bottom"
                                        fontSize="8"
                                        fill="white"
                                        fontWeight="bold"
                                        style={{pointerEvents: 'none', textShadow: '1px 1px 1px rgba(0,0,0,0.7)'}}
                                    >
                                        {(item.disk_entry.size / 1024 / 1024).toFixed(1)}M
                                    </text>
                                )}
                                
                                <title>
                                    {fileName}
                                    {isDir ? ' (Folder)' : ' (File)'}
                                    Size: {(item.disk_entry.size / 1024 / 1024).toFixed(2)} MB ({percentage.toFixed(2)}%)
                                </title>
                            </g>
                        );
                    })}
                </svg>
                
                {/* Summary overlay */}
                <div style={{
                    position: 'absolute', 
                    top: '10px', 
                    left: '10px', 
                    background: 'rgba(255,255,255,0.9)', 
                    padding: '8px 12px', 
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    fontSize: '12px'
                }}>
                    <div><strong>{allItems.length} items</strong></div>
                    <div>Total: {(totalSize / 1024 / 1024).toFixed(1)} MB</div>
                    <div className="mt-1">
                        <span style={{color: 'hsl(210, 70%, 50%)'}}>■</span> Files 
                        <span style={{color: 'hsl(45, 70%, 50%)', marginLeft: '8px'}}>■</span> Folders
                    </div>
                </div>
                
                {/* Zoom controls */}
                <div style={{
                    position: 'absolute', 
                    bottom: '10px', 
                    right: '10px',
                    display: 'flex',
                    gap: '5px'
                }}>
                    <CButton size="sm" variant="outline" color="secondary">
                        <CIcon icon="cil-zoom-in" />
                    </CButton>
                    <CButton size="sm" variant="outline" color="secondary">
                        <CIcon icon="cil-zoom-out" />
                    </CButton>
                    <CButton size="sm" variant="outline" color="secondary">
                        <CIcon icon="cil-fullscreen" />
                    </CButton>
                </div>
            </div>
        );
    }

    // Treemap packing algorithm
    function packTreemap(items, width, height, totalSize) {
        const packed = [];
        let x = 0;
        let y = 0;
        let rowHeight = 0;
        let rowWidth = width;
        
        // Sort items by size for better packing
        const sortedItems = [...items].sort((a, b) => b.disk_entry.size - a.disk_entry.size);
        
        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            const aspectRatio = width / height;
            const itemArea = (item.disk_entry.size / totalSize) * (width * height);
            const itemWidth = Math.sqrt(itemArea * aspectRatio);
            const itemHeight = itemArea / itemWidth;
            
            // Check if item fits in current row
            if (x + itemWidth > rowWidth) {
                // Start new row
                x = 0;
                y += rowHeight;
                rowHeight = 0;
                rowWidth = width;
            }
            
            // Scale item to fit available space
            const scale = Math.min((rowWidth - x) / itemWidth, (height - y) / itemHeight);
            const finalWidth = itemWidth * scale;
            const finalHeight = itemHeight * scale;
            
            packed.push({
                ...item,
                x,
                y,
                width: finalWidth,
                height: finalHeight
            });
            
            x += finalWidth;
            rowHeight = Math.max(rowHeight, finalHeight);
            
            // If we've filled the available height, stop
            if (y + rowHeight >= height) {
                break;
            }
        }
        
        return packed;
    }

    function renderSunburst() {
        console.log("Sunburst data:", files);

        if (!files.children || files.children.length === 0) {
            return (
                <div className="text-center p-4">
                    <CIcon icon="cil-circle" size="3xl" className="text-muted mb-3" />
                    <h5>Sunburst Chart</h5>
                    <p className="text-muted">No data available for sunburst visualization</p>
                    <small className="text-info">Debug: {files.children ? `Found ${files.children.length} children` : 'No children array'}</small>
                </div>
            );
        }

        // Get top items by size for meaningful visualization
        const items = files.children
            .sort((a, b) => b.disk_entry.size - a.disk_entry.size)
            .slice(0, 12); // Limit for readability

        console.log("Sunburst items:", items);

        const totalSize = files.disk_entry?.size || items.reduce((sum, item) => sum + item.disk_entry.size, 0);

        return (
            <div className="d-flex justify-content-center align-items-center" style={{height: '500px'}}>
                <div className="sunburst-container" style={{position: 'relative'}}>
                    <svg width="500" height="500" viewBox="0 0 500 500">
                        {/* Background circles for reference */}
                        <circle cx="250" cy="250" r="120" fill="none" stroke="#e9ecef" strokeWidth="1" />
                        <circle cx="250" cy="250" r="90" fill="none" stroke="#e9ecef" strokeWidth="1" opacity="0.5" />
                        <circle cx="250" cy="250" r="60" fill="none" stroke="#e9ecef" strokeWidth="1" opacity="0.3" />
                        <circle cx="250" cy="250" r="40" fill="none" stroke="#e9ecef" strokeWidth="1" opacity="0.2" />

                        {items.map((item, index) => {
                            const percentage = (item.disk_entry.size / totalSize);
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
                                    {/* Main sector */}
                                    <path
                                        d={`M 250 250 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                                        fill={`hsl(${isDir ? 45 : 210}, 70%, 60%)`}
                                        stroke="white"
                                        strokeWidth="1"
                                        opacity="0.8"
                                    />

                                    {/* Label for significant items */}
                                    {percentage > 0.03 && (
                                        <text
                                            x={250 + 60 * Math.cos((startAngle + angle/2) * Math.PI / 180)}
                                            y={250 + 60 * Math.sin((startAngle + angle/2) * Math.PI / 180)}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fontSize="9"
                                            fill="#333"
                                            fontWeight="bold"
                                        >
                                            {fileName.substring(0, 6)}
                                        </text>
                                    )}

                                    {/* Size text */}
                                    <text
                                        x={250 + 90 * Math.cos((startAngle + angle/2) * Math.PI / 180)}
                                        y={250 + 90 * Math.sin((startAngle + angle/2) * Math.PI / 180)}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize="8"
                                        fill="#666"
                                    >
                                        {(item.disk_entry.size / 1024 / 1024).toFixed(1)}M
                                    </text>
                                </g>
                            );
                        })}

                        {/* Center summary */}
                        <circle cx="250" cy="250" r="35" fill="white" stroke="#dee2e6" strokeWidth="2" />
                        <text x="250" y="240" textAnchor="middle" fontSize="12" fill="#333" fontWeight="bold">
                            {files.children.length} items
                        </text>
                        <text x="250" y="255" textAnchor="middle" fontSize="10" fill="#666">
                            {(totalSize / 1024 / 1024).toFixed(1)} MB
                        </text>
                    </svg>

                    {/* Legend */}
                    <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'white',
                        padding: '10px',
                        borderRadius: '5px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        <div className="small mb-2"><strong>Top {items.length} Items:</strong></div>
                        {items.slice(0, 5).map((item, index) => (
                            <div key={index} className="d-flex align-items-center mb-1">
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    backgroundColor: `hsl(${item.disk_entry.is_dir ? 45 : 210}, 70%, 60%)`,
                                    borderRadius: '1px',
                                    marginRight: '5px'
                                }}></div>
                                <small style={{maxWidth: '80px'}} className="text-truncate" title={item.disk_entry.path.split('/').pop()}>
                                    {item.disk_entry.path.split('/').pop()?.substring(0, 10)}
                                </small>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    function renderBarChart() {
        if (!files.children || files.children.length === 0) {
            return (
                <div className="text-center p-4">
                    <CIcon icon="cil-chart-line" size="3xl" className="text-muted mb-3" />
                    <h5>Bar Chart</h5>
                    <p className="text-muted">No data available for bar chart visualization</p>
                </div>
            );
        }

        const items = files.children
            .sort((a, b) => b.disk_entry.size - a.disk_entry.size)
            .slice(0, 100); // Show more items for better overview
        const maxSize = Math.max(...items.map(item => item.disk_entry.size));

        return (
            <div className="bar-chart-container" style={{height: '600px', overflowY: 'auto'}}>
                <div className="table-responsive">
                    <table className="table table-sm table-hover">
                        <thead className="table-light sticky-top">
                            <tr>
                                <th style={{width: '40%', minWidth: '200px'}}>File/Folder Name</th>
                                <th style={{width: '15%', minWidth: '100px'}}>Size</th>
                                <th style={{width: '45%', minWidth: '300px'}}>Usage</th>
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
                                            <div className="d-flex align-items-center">
                                                <CIcon 
                                                    icon={isDir ? cilFolder : cilFile} 
                                                    className={`me-2 ${isDir ? 'text-warning' : 'text-primary'}`}
                                                    size="sm"
                                                />
                                                <span className="text-truncate" title={fileName} style={{maxWidth: '180px'}}>
                                                    {fileName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-end">
                                            <small className="text-muted fw-bold">{sizeMB} MB</small>
                                        </td>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                <div className="progress flex-grow-1 me-2" style={{height: '20px'}}>
                                                    <div 
                                                        className={`progress-bar ${isDir ? 'bg-warning' : 'bg-primary'}`} 
                                                        role="progressbar" 
                                                        style={{width: `${percentage}%`}}
                                                        aria-valuenow={percentage} 
                                                        aria-valuemin="0" 
                                                        aria-valuemax="100"
                                                    />
                                                </div>
                                                <small className="text-muted" style={{minWidth: '40px'}}>
                                                    {percentage.toFixed(1)}%
                                                </small>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {files.children.length > 100 && (
                    <div className="text-center mt-2">
                        <small className="text-muted">
                            Showing top 100 items out of {files.children.length} total
                        </small>
                    </div>
                )}
            </div>
        );
    }

    function renderVisualization() {
        switch (visualizationType) {
            case 'treelist':
                return renderTreeList();
            case 'treemap':
                return renderTreemap();
            case 'sunburst':
                return renderSunburst();
            case 'bars':
                return renderBarChart();
            default:
                return renderTreeList();
        }
    }

    return (<>
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
                                <CButton onClick={chooseFolder} color="secondary" size="sm">
                                    <CIcon icon="cil-folder" className="me-1" />Choose Folder
                                </CButton>
                                
                                <div className="flex-grow-1">
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={currentPath}
                                        onChange={(e) => setCurrentPath(e.target.value)}
                                        placeholder="Enter folder path..."
                                        disabled={loading}
                                    />
                                </div>
                                
                                <CButton 
                                    onClick={fetchFiles} 
                                    color={treeData ? "success" : "primary"}
                                    disabled={loading || !currentPath}
                                    size="sm"
                                >
                                    {loading ? (
                                        <>
                                            <CIcon icon="cil-sync" className="spin me-1" />
                                            Scanning...
                                        </>
                                    ) : treeData ? (
                                        <>
                                            <CIcon icon="cil-refresh" className="me-1" />
                                            Rescan
                                        </>
                                    ) : (
                                        <>
                                            <CIcon icon="cil-search" className="me-1" />
                                            Scan Directory
                                        </>
                                    )}
                                </CButton>
                            </div>
                            
                            {/* Status indicator */}
                            {currentPath && !loading && (
                                <div className="small text-muted">
                                    <CIcon icon={treeData ? "cil-check-circle" : "cil-clock"} className={`me-1 ${treeData ? 'text-success' : 'text-warning'}`} />
                                    {treeData ? 'Directory scanned and cached' : 'Ready to scan - click "Scan Directory" to begin'}
                                </div>
                            )}
                        </div>

                        {/* Progress Indicator */}
                        {loading && (
                            <div className="mb-3">
                                <div className="d-flex align-items-center mb-2">
                                    <CIcon icon="cil-data-transfer-down" className="text-primary me-2" />
                                    <strong className="me-2">Scanning Directory</strong>
                                    <small className="text-muted">{progressText}</small>
                                </div>
                                <CProgress className="mb-2">
                                    <CProgressBar 
                                        animated 
                                        color="primary" 
                                        value={progress ? Math.min((progress.files_processed / Math.max(progress.files_processed + progress.directories_processed, 1)) * 100, 100) : 0}
                                    />
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
                        {treeData && !loading && (
                            <div className="mb-3">
                                <h6>Analysis Type:</h6>
                                <div className="btn-group btn-group-sm me-3" role="group">
                                    <CButton 
                                        color={analysisType === 'tree' ? 'primary' : 'outline-primary'}
                                        onClick={() => { setAnalysisType('tree'); runAnalysis('tree'); }}
                                        size="sm"
                                    >
                                        <CIcon icon="cil-list" className="me-1" />
                                        Directory Tree
                                    </CButton>
                                    <CButton 
                                        color={analysisType === 'duplicates' ? 'primary' : 'outline-primary'}
                                        onClick={() => { setAnalysisType('duplicates'); runAnalysis('duplicates'); }}
                                        size="sm"
                                    >
                                        <CIcon icon="cil-copy" className="me-1" />
                                        Duplicates
                                    </CButton>
                                    <CButton 
                                        color={analysisType === 'disk' ? 'primary' : 'outline-primary'}
                                        onClick={() => { setAnalysisType('disk'); runAnalysis('disk'); }}
                                        size="sm"
                                    >
                                        <CIcon icon="cil-chart-pie" className="me-1" />
                                        Disk Usage
                                    </CButton>
                                </div>

                                <h6 className="mt-3">Visualization:</h6>
                                <div className="btn-group btn-group-sm" role="group">
                                    <CButton 
                                        color={visualizationType === 'treelist' ? 'success' : 'outline-success'}
                                        onClick={() => setVisualizationType('treelist')}
                                        size="sm"
                                    >
                                        <CIcon icon="cil-list-tree" className="me-1" />
                                        Tree List
                                    </CButton>
                                    <CButton 
                                        color={visualizationType === 'treemap' ? 'success' : 'outline-success'}
                                        onClick={() => setVisualizationType('treemap')}
                                        size="sm"
                                    >
                                        <CIcon icon="cil-chart-pie" className="me-1" />
                                        Treemap
                                    </CButton>
                                    <CButton 
                                        color={visualizationType === 'sunburst' ? 'success' : 'outline-success'}
                                        onClick={() => setVisualizationType('sunburst')}
                                        size="sm"
                                    >
                                        <CIcon icon="cil-circle" className="me-1" />
                                        Sunburst
                                    </CButton>
                                    <CButton 
                                        color={visualizationType === 'bars' ? 'success' : 'outline-success'}
                                        onClick={() => setVisualizationType('bars')}
                                        size="sm"
                                    >
                                        <CIcon icon="cil-chart-line" className="me-1" />
                                        Bar Chart
                                    </CButton>
                                </div>
                            </div>
                        )}

                        {/* Visualization Area */}
                        <div className="border rounded p-3" style={{minHeight: '400px'}}>
                            {renderVisualization()}
                        </div>

                        {/* Scan Errors Display */}
                        {scanErrors && scanErrors.length > 0 && (
                            <div className="mt-3">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <h6 className="mb-0 text-warning">
                                        <CIcon icon="cil-warning" className="me-1" />
                                        Scan Errors ({scanErrors.length})
                                    </h6>
                                    <div>
                                        <CButton 
                                            color="warning" 
                                            size="sm" 
                                            variant="outline"
                                            onClick={() => setShowErrors(!showErrors)}
                                        >
                                            {showErrors ? 'Hide' : 'Show'} Errors
                                        </CButton>
                                        <CButton 
                                            color="secondary" 
                                            size="sm" 
                                            variant="outline"
                                            className="ms-2"
                                            onClick={() => setScanErrors([])}
                                        >
                                            Clear
                                        </CButton>
                                    </div>
                                </div>
                                
                                {showErrors && (
                                    <div className="border rounded p-3" style={{maxHeight: '300px', overflowY: 'auto', backgroundColor: '#fff3cd'}}>
                                        {scanErrors.map((error, index) => (
                                            <div key={index} className="mb-2 pb-2 border-bottom">
                                                <div className="d-flex align-items-start">
                                                    <CIcon 
                                                        icon={error.error_type === 'permission_denied' ? 'cil-lock-locked' : 'cil-warning'} 
                                                        className="mt-1 me-2 text-danger"
                                                    />
                                                    <div className="flex-grow-1">
                                                        <div className="fw-bold text-danger small">
                                                            {error.error_type === 'permission_denied' ? 'Permission Denied' : 
                                                             error.error_type === 'not_found' ? 'Not Found' : 'Error'}
                                                        </div>
                                                        <div className="small text-dark mb-1">
                                                            <code>{error.path}</code>
                                                        </div>
                                                        <div className="small text-muted">
                                                            {error.error_message}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="small text-muted mt-2">
                                            <strong>Note:</strong> These directories were skipped due to access restrictions. 
                                            You may need administrator privileges to scan these locations.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Status Footer */}
                        {!loading && treeData && (
                            <div className="mt-3 text-muted small">
                                <CIcon icon="cil-info" className="me-1" />
                                {analysisType === 'tree' && `${files.children ? files.children.length : 0} items scanned`}
                                {analysisType === 'duplicates' && `${files.length || 0} duplicate groups found`}
                                {analysisType === 'disk' && `${files.length || 0} directories analyzed`}
                                {scanErrors.length > 0 && ` • ${scanErrors.length} errors encountered`}
                            </div>
                        )}

                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    </>);
}

export default  TreeBuilder;