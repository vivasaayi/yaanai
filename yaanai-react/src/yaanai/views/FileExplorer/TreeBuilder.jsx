import {invoke} from "@tauri-apps/api/tauri";
import {open} from "@tauri-apps/api/dialog";
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
        setCurrentPath,
        scanDirectory,
        chooseFolder
    } = useFileSystem();

    const [files, setFiles] = useState([]); // Local state for current view
    const [analysisType, setAnalysisType] = useState('tree'); // 'tree', 'duplicates', 'disk'
    const [visualizationType, setVisualizationType] = useState('treelist'); // 'treelist', 'treemap', 'sunburst', 'bars'

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
        if (!files.children || files.children.length === 0) {
            return (
                <div className="text-center p-4">
                    <CIcon icon="cil-chart-pie" size="3xl" className="text-muted mb-3" />
                    <h5>Treemap Visualization</h5>
                    <p className="text-muted">No data available for treemap visualization</p>
                </div>
            );
        }

        // Simple treemap implementation using CSS Grid with fixed dimensions
        const totalSize = files.disk_entry?.size || 1;
        const items = files.children.slice(0, 20); // Limit for performance

        return (
            <div className="treemap-container" style={{height: '400px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '2px'}}>
                {items.map((item, index) => {
                    const percentage = (item.disk_entry.size / totalSize) * 100;
                    const area = Math.max(percentage * 4, 20); // Minimum area
                    
                    return (
                        <div 
                            key={index}
                            className="treemap-item border d-flex align-items-center justify-content-center"
                            style={{
                                backgroundColor: `hsl(${210 + (index * 30) % 120}, 70%, ${80 - (percentage / 5)}%)`,
                                minHeight: '60px', // Fixed minimum height
                                maxHeight: '120px', // Fixed maximum height
                                fontSize: '11px',
                                textAlign: 'center',
                                padding: '4px',
                                cursor: 'pointer',
                                overflow: 'hidden'
                            }}
                            title={`${item.disk_entry.path.split('/').pop()}: ${(item.disk_entry.size / 1024 / 1024).toFixed(1)} MB`}
                        >
                            <div className="text-truncate w-100" style={{fontSize: '10px', lineHeight: '1.2'}}>
                                {item.disk_entry.path.split('/').pop()}
                            </div>
                            <div className="mt-1" style={{fontSize: '9px', opacity: 0.8}}>
                                {(item.disk_entry.size / 1024 / 1024).toFixed(1)}MB
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    function renderSunburst() {
        if (!files.children || files.children.length === 0) {
            return (
                <div className="text-center p-4">
                    <CIcon icon="cil-circle" size="3xl" className="text-muted mb-3" />
                    <h5>Sunburst Chart</h5>
                    <p className="text-muted">No data available for sunburst visualization</p>
                </div>
            );
        }

        // Simple radial visualization
        const items = files.children.slice(0, 10);
        const totalSize = files.disk_entry?.size || 1;

        return (
            <div className="d-flex justify-content-center align-items-center" style={{height: '400px'}}>
                <div className="sunburst-container" style={{position: 'relative', width: '300px', height: '300px'}}>
                    <svg width="300" height="300" viewBox="0 0 300 300">
                        {items.map((item, index) => {
                            const percentage = (item.disk_entry.size / totalSize);
                            const angle = (percentage * 360);
                            const startAngle = items.slice(0, index).reduce((sum, i) => sum + (i.disk_entry.size / totalSize) * 360, 0);
                            
                            const x1 = 150 + 50 * Math.cos((startAngle * Math.PI) / 180);
                            const y1 = 150 + 50 * Math.sin((startAngle * Math.PI) / 180);
                            const x2 = 150 + 50 * Math.cos(((startAngle + angle) * Math.PI) / 180);
                            const y2 = 150 + 50 * Math.sin(((startAngle + angle) * Math.PI) / 180);
                            
                            const largeArcFlag = angle > 180 ? 1 : 0;
                            
                            return (
                                <path
                                    key={index}
                                    d={`M 150 150 L ${x1} ${y1} A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                                    fill={`hsl(${210 + (index * 30) % 120}, 70%, 60%)`}
                                    stroke="white"
                                    strokeWidth="1"
                                />
                            );
                        })}
                        <circle cx="150" cy="150" r="30" fill="white" />
                        <text x="150" y="155" textAnchor="middle" fontSize="12" fill="#333">
                            {files.children.length} dirs
                        </text>
                    </svg>
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
            .slice(0, 15);
        const maxSize = Math.max(...items.map(item => item.disk_entry.size));

        return (
            <div className="bar-chart-container p-3" style={{height: '400px', overflowY: 'auto'}}>
                {items.map((item, index) => {
                    const percentage = (item.disk_entry.size / maxSize) * 100;
                    const sizeMB = (item.disk_entry.size / 1024 / 1024).toFixed(1);
                    const fileName = item.disk_entry.path.split('/').pop() || 'Unknown';
                    
                    return (
                        <div key={index} className="mb-3" style={{minHeight: '50px'}}>
                            <div className="d-flex justify-content-between align-items-center mb-1">
                                <div className="flex-grow-1 me-2" style={{minWidth: 0}}>
                                    <small className="text-truncate d-block" style={{maxWidth: '180px'}} title={fileName}>
                                        {fileName}
                                    </small>
                                </div>
                                <small className="text-muted text-nowrap">{sizeMB} MB</small>
                            </div>
                            <div className="progress" style={{height: '24px'}}>
                                <div 
                                    className="progress-bar bg-primary" 
                                    role="progressbar" 
                                    style={{width: `${percentage}%`}}
                                    aria-valuenow={percentage} 
                                    aria-valuemin="0" 
                                    aria-valuemax="100"
                                >
                                    <small className="text-white fw-bold">{percentage.toFixed(1)}%</small>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
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

                        {/* Status Footer */}
                        {!loading && treeData && (
                            <div className="mt-3 text-muted small">
                                <CIcon icon="cil-info" className="me-1" />
                                {analysisType === 'tree' && `${files.children ? files.children.length : 0} items scanned`}
                                {analysisType === 'duplicates' && `${files.length || 0} duplicate groups found`}
                                {analysisType === 'disk' && `${files.length || 0} directories analyzed`}
                            </div>
                        )}

                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    </>);
}

export default  TreeBuilder;