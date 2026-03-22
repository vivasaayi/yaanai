import React, { useState } from "react";
import { useFileSystem } from './FileSystemContext';
import {
    CButton, CCard, CCardBody, CCardHeader,
    CCol, CRow
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilFile, cilFolder } from "@coreui/icons";
import { DataGrid, Column } from 'devextreme-react/data-grid';
import 'devextreme/dist/css/dx.light.css';

function DiskAnalyzer() {
    const {
        currentPath, loading, setCurrentPath,
        analyzeDiskUsage, chooseFolder, exportReport, progressText
    } = useFileSystem();

    const [files, setFiles] = useState([]);

    async function fetchFiles() {
        try {
            const diskUsage = await analyzeDiskUsage();
            if (diskUsage) {
                setFiles(diskUsage);
            }
        } catch (error) {
            setFiles([]);
        }
    }

    async function handleExport(format) {
        const homePath = await import("@tauri-apps/api/core").then(m => m.invoke("get_home_directory"));
        const filePath = `${homePath}/yaanai_disk_usage.${format}`;
        try {
            const resultPath = await exportReport(format, 'disk_usage', filePath, currentPath);
            alert(`Exported to: ${resultPath}`);
        } catch (e) {
            alert("Export failed: " + e);
        }
    }

    function renderFileName(data) {
        if (data.data.is_dir) {
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

    // Bar chart view for top items
    const sorted = [...files].sort((a, b) => b.size - a.size);
    const maxSize = sorted[0]?.size || 1;

    return (
        <CRow>
            <CCol xs={12}>
                <CCard className="mb-4">
                    <CCardHeader>
                        <div className="d-flex justify-content-between align-items-center">
                            <span>Disk Analyzer</span>
                            <small className="text-muted">{currentPath}</small>
                        </div>
                    </CCardHeader>
                    <CCardBody>
                        {/* Controls */}
                        <div className="mb-3">
                            <div className="d-flex gap-2 align-items-center mb-2">
                                <CButton onClick={chooseFolder} color="secondary" size="sm">
                                    Choose Folder
                                </CButton>
                                <div className="flex-grow-1">
                                    <input type="text" className="form-control form-control-sm"
                                        value={currentPath}
                                        onChange={(e) => setCurrentPath(e.target.value)}
                                        placeholder="Enter folder path..." disabled={loading} />
                                </div>
                                <CButton onClick={fetchFiles}
                                    color={files.length > 0 ? "success" : "primary"}
                                    disabled={loading || !currentPath} size="sm">
                                    {loading ? "Analyzing..." : files.length > 0 ? "Re-analyze" : "Analyze Disk"}
                                </CButton>
                                {files.length > 0 && (
                                    <>
                                        <CButton onClick={() => handleExport('json')} color="outline-secondary" size="sm">
                                            Export JSON
                                        </CButton>
                                        <CButton onClick={() => handleExport('csv')} color="outline-secondary" size="sm">
                                            Export CSV
                                        </CButton>
                                    </>
                                )}
                            </div>
                            {progressText && <div className="small text-muted">{progressText}</div>}
                            {currentPath && !loading && (
                                <div className="small text-muted">
                                    {files.length > 0 ? `${files.length} items analyzed` : 'Ready to analyze'}
                                </div>
                            )}
                        </div>

                        {/* Size bar visualization */}
                        {files.length > 0 && (
                            <div className="mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                {sorted.slice(0, 20).map((item, index) => {
                                    const percentage = (item.size / maxSize) * 100;
                                    return (
                                        <div key={index} className="d-flex align-items-center mb-1">
                                            <CIcon icon={item.is_dir ? cilFolder : cilFile}
                                                className={`me-2 ${item.is_dir ? 'text-warning' : 'text-primary'}`}
                                                size="sm" />
                                            <span className="text-truncate me-2" style={{ width: '200px' }} title={item.name}>
                                                {item.name}
                                            </span>
                                            <div className="progress flex-grow-1 me-2" style={{ height: '16px' }}>
                                                <div className={`progress-bar ${item.is_dir ? 'bg-warning' : 'bg-primary'}`}
                                                    style={{ width: `${percentage}%` }} />
                                            </div>
                                            <small className="text-muted" style={{ minWidth: '70px' }}>{item.size_h}</small>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Data Grid */}
                        <DataGrid id="dataGrid" dataSource={files} className="mt-3"
                            showBorders={true} columnAutoWidth={true}>
                            <Column dataField="name" cellRender={renderFileName} />
                            <Column dataField="path" />
                            <Column dataField="size_h" caption="Size" width={100} />
                            <Column dataField="is_dir" caption="Dir" width={60} />
                        </DataGrid>
                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    );
}

export default DiskAnalyzer;
