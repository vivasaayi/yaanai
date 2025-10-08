import {invoke} from "@tauri-apps/api/tauri";
import {open} from "@tauri-apps/api/dialog";
import {listen} from "@tauri-apps/api/event";
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

function TreeBuilder() {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState("");
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState(null);
    const [progressText, setProgressText] = useState("");

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

    async function chooseFolder() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: currentPath || undefined,
            });
            if (selected) {
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
        // Listen for tree build progress events
        const unlisten = listen('tree-build-progress', (event) => {
            const progressData = event.payload;
            setProgress(progressData);
            setProgressText(`Scanning: ${progressData.current_path} (${progressData.files_processed} files, ${progressData.directories_processed} dirs)`);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    useEffect(() => {
        if (currentPath) {
            fetchFiles();
        }
    }, [currentPath]);

    async function fetchFiles() {
        if (!currentPath) return;
        
        setLoading(true);
        setProgress(null);
        setProgressText("Starting tree scan...");
        
        try {
            console.log("Fetching tree with progress for:", currentPath);
            const files = await invoke("get_file_tree_with_progress", { folderName: currentPath });
            console.log("Tree received:", files);
            setFiles(files);
            setProgressText("Scan complete!");
        } catch (error) {
            console.error("Failed to fetch tree:", error);
            setFiles([]);
            setProgressText("Scan failed");
        } finally {
            setLoading(false);
            // Clear progress after a short delay
            setTimeout(() => {
                setProgress(null);
                setProgressText("");
            }, 2000);
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
                        Tree Builder
                    </CCardHeader>
                    <CCardBody>
                        <CButton onClick={chooseFolder} color="primary" className="me-2">Choose Folder</CButton>
                        <CButton onClick={fetchFiles} className="me-2" disabled={loading}>
                            {loading ? 'Building Tree...' : 'Refresh'}
                        </CButton>
                        <div className="mt-2">
                            {loading ? (
                                <div>
                                    <span>Building tree for {currentPath}... <CIcon icon="cil-sync" className="spin" /></span>
                                    {progressText && (
                                        <div className="mt-1 text-muted small">
                                            {progressText}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span>{files.children ? files.children.length : 0} items in: {currentPath}</span>
                            )}
                        </div>
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

                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    </>);
}

export default  TreeBuilder;