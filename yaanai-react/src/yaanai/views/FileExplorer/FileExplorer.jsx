import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/api/dialog";
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

import CIcon from '@coreui/icons-react';
import { cilFolder, cilFile } from '@coreui/icons';

import {DocsExample} from "../../../coreui/components/index.js";
import ReactImg from "../../../assets/images/react.jpg";

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

import {
    DataGrid,
    Column
} from 'devextreme-react/data-grid';

function FileExplorer() {
    const {
        currentPath,
        loading,
        setCurrentPath,
        listFiles
    } = useFileSystem();

    const [stack, setStack] = useState([]);
    const [files, setFiles] = useState([]);

    async function getHomeDirectory() {
        try {
            const homeDir = await invoke("get_home_directory");
            setCurrentPath(homeDir);
        } catch (error) {
            console.error("Failed to get home directory:", error);
            // Fallback to root directory
            setCurrentPath("/");
        }
    }

    async function fetchFiles() {
        try {
            const fileList = await listFiles();
            if (fileList) {
                setFiles(fileList);
            }
        } catch (error) {
            setFiles([]);
        }
    }

    async function chooseFolder() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: currentPath
            });
            
            if (selected && typeof selected === 'string') {
                setStack([]); // Clear navigation stack when choosing new folder
                setCurrentPath(selected);
            }
        } catch (error) {
            console.error("Failed to open folder picker:", error);
        }
    }

    // Initialize home directory if not set
    useEffect(() => {
        if (!currentPath) {
            getHomeDirectory();
        }
    }, [currentPath]);

    // Update files when path changes
    useEffect(() => {
        if (currentPath) {
            fetchFiles();
        }
    }, [currentPath]);

    function handlePathChange(e) {
        const path = e.target.getAttribute("data-path")
        stack.push(currentPath)
        setCurrentPath(path);
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

    function navBack() {
        console.log("Back Clicked")
        if(stack.length <= 0) {
            console.log("Stack length: 0")
            return <a>Hello</a>
        }
        const prevPath = stack.pop();
        console.log("Setting path:", prevPath)
        setCurrentPath(prevPath);
        console.log("Back Handled")
    }
    function renderBack() {
        return <CButton onClick={navBack}>Back</CButton>
    }

    return (<>
        <CRow>
            <CCol xs={12}>
                <CCard className="mb-4">
                    <CCardHeader>
                        File Explorer
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
                                            Refresh
                                        </>
                                    ) : (
                                        <>
                                            <CIcon icon="cil-list" className="me-1" />
                                            List Files
                                        </>
                                    )}
                                </CButton>
                                
                                {renderBack()}
                            </div>
                            
                            {/* Status indicator */}
                            {currentPath && !loading && (
                                <div className="small text-muted">
                                    <CIcon icon={files.length > 0 ? "cil-check-circle" : "cil-clock"} className={`me-1 ${files.length > 0 ? 'text-success' : 'text-warning'}`} />
                                    {files.length > 0 ? `${files.length} items listed` : 'Ready to scan - click "List Files" to begin'}
                                </div>
                            )}
                            
                            <div className="mt-1 text-muted small">Navigation stack: {JSON.stringify(stack)}</div>
                        </div>
                        <DataGrid id="dataGrid"
                                  dataSource={files}
                                  className="mt-3">
                            <Column dataField="name" cellRender={renderFileName}/>
                            <Column dataField="path" />
                            <Column dataField="size" />
                            <Column dataField="size_h" />
                            <Column dataField="is_dir" />
                            <Column dataField="is_file" />
                        </DataGrid>
                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    </>);
}

export default  FileExplorer;