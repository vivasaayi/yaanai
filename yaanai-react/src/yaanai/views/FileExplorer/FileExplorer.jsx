import {invoke} from "@tauri-apps/api/tauri";
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
    const [currentPath, setCurrentPath] =useState("/Users/rajanp");
    const [files, setFiles] = useState([]);

    async function fetchFiles() {
        console.log(currentPath)
        const files = await invoke("recursively_list_files", { folderName: currentPath });
        console.log(files);
        setFiles(files);
    }

    useEffect(() => {
        fetchFiles()
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
                        <CButton onClick={fetchFiles}>Fetch Files</CButton>
                        {renderBack()}
                        <div>{files.length}:{currentPath}</div>
                        <div>{JSON.stringify(stack)}</div>
                        <DataGrid id="dataGrid"
                                  dataSource={files}>
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