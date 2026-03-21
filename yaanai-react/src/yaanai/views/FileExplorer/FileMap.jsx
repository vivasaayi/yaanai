import {invoke} from "@tauri-apps/api/core";

import React, {useState, useEffect} from "react";
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
    CCol, CListGroup, CListGroupItem, CNav, CNavItem, CNavLink, CRow
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
`;

// Inject styles
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
}

function FileMap() {
    const {
        currentPath,
        loading,
        setCurrentPath,
        findDuplicates,
        chooseFolder
    } = useFileSystem();

    const [files, setFiles] = useState([]);

    // Update local files when analysis is run
    useEffect(() => {
        if (files.length > 0) {
            // Files are already set from the analysis
        }
    }, [files]);

    async function fetchFiles() {
        try {
            const duplicates = await findDuplicates();
            if (duplicates) {
                setFiles(duplicates);
            }
        } catch (error) {
            setFiles([]);
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

    function renderFiles() {
        const result = [];
        (files || []).forEach(file => {
            result.push(<p>{file}</p>)
        })
        return result;
    }

    return (<>
        <CRow>
            <CCol xs={12}>
                <CCard className="mb-4">
                    <CCardHeader>
                        Duplicate Files
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
                                    color={files.length > 0 ? "success" : "primary"}
                                    disabled={loading || !currentPath}
                                    size="sm"
                                >
                                    {loading ? (
                                        <>
                                            <CIcon icon="cil-sync" className="spin me-1" />
                                            Scanning...
                                        </>
                                    ) : files.length > 0 ? (
                                        <>
                                            <CIcon icon="cil-refresh" className="me-1" />
                                            Re-scan
                                        </>
                                    ) : (
                                        <>
                                            <CIcon icon="cil-copy" className="me-1" />
                                            Find Duplicates
                                        </>
                                    )}
                                </CButton>
                            </div>
                            
                            {/* Status indicator */}
                            {currentPath && !loading && (
                                <div className="small text-muted">
                                    <CIcon icon={files.length > 0 ? "cil-check-circle" : "cil-clock"} className={`me-1 ${files.length > 0 ? 'text-success' : 'text-warning'}`} />
                                    {files.length > 0 ? `${files.length} duplicate groups found` : 'Ready to scan - click "Find Duplicates" to begin'}
                                </div>
                            )}
                        </div>
                        <DataGrid id="dataGrid"
                                  allowColumnResizing={true}
                                  dataSource={files}
                                  className="mt-3">
                            <Column dataField="disk_entry.name" cellRender={renderFileName}/>
                            <Column dataField="disk_entry.path" />
                            <Column dataField="disk_entry.size" />
                            <Column dataField="disk_entry.size_h" />
                            <Column dataField="disk_entry.is_dir" />
                            <Column dataField="disk_entry.is_file" />
                        </DataGrid>

                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    </>);
}

export default  FileMap;