import React, { useState } from "react";
import { useFileSystem } from './FileSystemContext';
import {
    CButton, CCard, CCardBody, CCardHeader, CCol, CRow,
    CBadge, CCollapse, CFormCheck
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilFile, cilTrash, cilCopy } from "@coreui/icons";
import { DataGrid, Column } from 'devextreme-react/data-grid';
import 'devextreme/dist/css/dx.light.css';

function FileMap() {
    const {
        currentPath, loading, setCurrentPath, findTrueDuplicates,
        deleteFiles, chooseFolder, progressText
    } = useFileSystem();

    const [scanResult, setScanResult] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    async function runScan() {
        try {
            const result = await findTrueDuplicates();
            if (result) {
                setScanResult(result);
                setSelectedFiles(new Set());
            }
        } catch (error) {
            setScanResult(null);
        }
    }

    function toggleGroup(hash) {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(hash)) next.delete(hash);
            else next.add(hash);
            return next;
        });
    }

    function toggleFileSelection(path) {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }

    function selectAllDuplicatesInGroup(group) {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            // Select all except the first file in the group (keep one original)
            group.files.slice(1).forEach(f => next.add(f.path));
            return next;
        });
    }

    async function handleDelete() {
        if (selectedFiles.size === 0) return;
        const paths = Array.from(selectedFiles);
        try {
            const result = await deleteFiles(paths, true);
            if (result) {
                // Re-scan to update the list
                await runScan();
            }
        } catch (error) {
            console.error("Delete failed:", error);
        }
    }

    const groups = scanResult?.groups || [];
    const hasResults = scanResult !== null;

    return (
        <CRow>
            <CCol xs={12}>
                <CCard className="mb-4">
                    <CCardHeader>
                        <div className="d-flex justify-content-between align-items-center">
                            <span>True Duplicate Finder (SHA256)</span>
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
                                    onClick={runScan}
                                    color={hasResults ? "success" : "primary"}
                                    disabled={loading || !currentPath}
                                    size="sm"
                                >
                                    {loading ? "Scanning..." : hasResults ? "Re-scan" : "Find Duplicates"}
                                </CButton>
                                {selectedFiles.size > 0 && (
                                    <CButton
                                        onClick={handleDelete}
                                        color="danger"
                                        size="sm"
                                        disabled={loading}
                                    >
                                        <CIcon icon={cilTrash} className="me-1" />
                                        Delete {selectedFiles.size} file(s)
                                    </CButton>
                                )}
                            </div>
                            {progressText && (
                                <div className="small text-muted">{progressText}</div>
                            )}
                        </div>

                        {/* Summary */}
                        {hasResults && (
                            <div className="mb-3 p-3 border rounded bg-light">
                                <div className="d-flex gap-4">
                                    <div>
                                        <strong>{scanResult.total_files_scanned}</strong>
                                        <div className="small text-muted">Files Scanned</div>
                                    </div>
                                    <div>
                                        <strong className="text-warning">{groups.length}</strong>
                                        <div className="small text-muted">Duplicate Groups</div>
                                    </div>
                                    <div>
                                        <strong className="text-danger">{scanResult.total_duplicates}</strong>
                                        <div className="small text-muted">Duplicate Files</div>
                                    </div>
                                    <div>
                                        <strong className="text-danger">{scanResult.total_wasted_space_h}</strong>
                                        <div className="small text-muted">Wasted Space</div>
                                    </div>
                                </div>
                                {scanResult.errors.length > 0 && (
                                    <div className="mt-2 small text-warning">
                                        {scanResult.errors.length} scan errors encountered
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Duplicate Groups */}
                        {groups.length > 0 ? (
                            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                {groups.map((group, gi) => (
                                    <div key={group.hash} className="border rounded mb-2">
                                        <div
                                            className="d-flex justify-content-between align-items-center p-2 bg-light"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => toggleGroup(group.hash)}
                                        >
                                            <div className="d-flex align-items-center gap-2">
                                                <CIcon icon={cilCopy} className="text-warning" />
                                                <strong>{group.files[0]?.name || 'Unknown'}</strong>
                                                <CBadge color="warning">{group.files.length} copies</CBadge>
                                                <CBadge color="info">{group.size_h} each</CBadge>
                                                <CBadge color="danger">Wasting {group.wasted_space_h}</CBadge>
                                            </div>
                                            <div className="d-flex gap-2">
                                                <CButton
                                                    size="sm"
                                                    color="outline-danger"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        selectAllDuplicatesInGroup(group);
                                                    }}
                                                >
                                                    Select Duplicates
                                                </CButton>
                                                <span>{expandedGroups.has(group.hash) ? '\u25B2' : '\u25BC'}</span>
                                            </div>
                                        </div>
                                        <CCollapse visible={expandedGroups.has(group.hash)}>
                                            <div className="p-2">
                                                {group.files.map((file, fi) => (
                                                    <div
                                                        key={file.path}
                                                        className={`d-flex align-items-center gap-2 p-1 ${fi === 0 ? 'border-start border-3 border-success ps-2' : ''}`}
                                                    >
                                                        <CFormCheck
                                                            checked={selectedFiles.has(file.path)}
                                                            onChange={() => toggleFileSelection(file.path)}
                                                        />
                                                        <CIcon icon={cilFile} className="text-primary" size="sm" />
                                                        <span className="flex-grow-1 small text-truncate" title={file.path}>
                                                            {file.path}
                                                        </span>
                                                        <span className="small text-muted">{file.size_h}</span>
                                                        {fi === 0 && (
                                                            <CBadge color="success" size="sm">Original</CBadge>
                                                        )}
                                                    </div>
                                                ))}
                                                <div className="small text-muted mt-1">
                                                    SHA256: {group.hash.substring(0, 16)}...
                                                </div>
                                            </div>
                                        </CCollapse>
                                    </div>
                                ))}
                            </div>
                        ) : hasResults ? (
                            <div className="text-center p-4 text-muted">
                                No duplicate files found in this directory.
                            </div>
                        ) : (
                            <div className="text-center p-4 text-muted">
                                Select a folder and click "Find Duplicates" to scan for duplicate files using SHA256 content hashing.
                            </div>
                        )}
                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    );
}

export default FileMap;
