import {invoke} from "@tauri-apps/api/tauri";
import {open} from "@tauri-apps/api/dialog";
import React, {useState, useEffect} from "react";
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

import {
    DataGrid,
    Column
} from 'devextreme-react/data-grid';

function FileExplorer() {
    const [stack, setStack] = useState([]);
    const [currentPath, setCurrentPath] = useState("");
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);

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
        if (!currentPath) return;
        
        setLoading(true);
        try {
            console.log("Fetching files for:", currentPath);
            const files = await invoke("recursively_list_files", { folderName: currentPath });
            console.log("Files received:", files);
            setFiles(files);
        } catch (error) {
            console.error("Failed to fetch files:", error);
            setFiles([]);
        } finally {
            setLoading(false);
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

    useEffect(() => {
        getHomeDirectory();
    }, []);

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
                        <CButton onClick={chooseFolder} color="primary" className="me-2">Choose Folder</CButton>
                        <CButton onClick={fetchFiles} className="me-2">Refresh</CButton>
                        {renderBack()}
                        <div className="mt-2">{files.length} items in: {currentPath}</div>
                        <div className="mt-1 text-muted small">Navigation stack: {JSON.stringify(stack)}</div>
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