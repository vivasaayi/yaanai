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

function FileExplorer() {
    const [files, setFiles] = useState([]);
    async function fetchFiles() {
        const files = await invoke("fetch_files", { folderName: "Rajan" });
        setFiles(files);
        alert(files);
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
                        File Explorer
                    </CCardHeader>
                    <CCardBody>
                        <CButton onClick={fetchFiles}>Fetch Files</CButton>
                        {renderFiles()}
                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    </>);
}

export default  FileExplorer;