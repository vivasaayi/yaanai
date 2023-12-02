import {invoke} from "@tauri-apps/api/tauri";
import React, {useState} from "react";
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

function FileMap() {
    const [files, setFiles] = useState([]);
    async function fetchFiles() {
        const files = await invoke("get_files_map", { folderName: "/Users/rajanp" });
        console.log(files)
        setFiles(files);
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
                        <CButton onClick={fetchFiles}>Fetch Files</CButton>

                        <DataGrid id="dataGrid"
                                  dataSource={files}>
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