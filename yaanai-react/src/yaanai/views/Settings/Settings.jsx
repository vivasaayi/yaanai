import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFileSystem } from '../FileExplorer/FileSystemContext';
import {
    CButton, CCard, CCardBody, CCardHeader,
    CCol, CRow, CBadge, CNav, CNavItem, CNavLink, CTabContent, CTabPane
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilStar, cilTrash, cilPlus } from "@coreui/icons";

function Settings() {
    const {
        favorites, ignorePatterns, setCurrentPath,
        addFavorite, removeFavorite, addIgnorePattern, removeIgnorePattern
    } = useFileSystem();

    const [activeTab, setActiveTab] = useState('favorites');
    const [newPatternInput, setNewPatternInput] = useState('');
    const [newFavPath, setNewFavPath] = useState('');
    const [newFavName, setNewFavName] = useState('');
    const [dbStats, setDbStats] = useState(null);

    useEffect(() => {
        invoke("get_db_stats").then(setDbStats).catch(console.error);
    }, []);

    async function handleAddPattern() {
        const pattern = newPatternInput.trim();
        if (!pattern) return;
        try {
            await addIgnorePattern(pattern);
            setNewPatternInput('');
        } catch (error) {
            alert("Failed to add pattern: " + error);
        }
    }

    async function handleRemovePattern(pattern) {
        try {
            await removeIgnorePattern(pattern);
        } catch (error) {
            alert("Failed to remove pattern: " + error);
        }
    }

    async function handleAddFavorite() {
        if (!newFavPath.trim()) return;
        const name = newFavName.trim() || newFavPath.split('/').pop() || newFavPath;
        try {
            await addFavorite(newFavPath.trim(), name);
            setNewFavPath('');
            setNewFavName('');
        } catch (error) {
            alert("Failed to add favorite: " + error);
        }
    }

    async function handleRemoveFavorite(path) {
        try {
            await removeFavorite(path);
        } catch (error) {
            alert("Failed to remove favorite: " + error);
        }
    }

    function navigateToFavorite(path) {
        setCurrentPath(path);
    }

    return (
        <CRow>
            <CCol xs={12}>
                <CCard className="mb-4">
                    <CCardHeader>Settings</CCardHeader>
                    <CCardBody>
                        <CNav variant="tabs" className="mb-3">
                            <CNavItem>
                                <CNavLink active={activeTab === 'favorites'}
                                    onClick={() => setActiveTab('favorites')} style={{ cursor: 'pointer' }}>
                                    Favorites ({favorites.length})
                                </CNavLink>
                            </CNavItem>
                            <CNavItem>
                                <CNavLink active={activeTab === 'ignore'}
                                    onClick={() => setActiveTab('ignore')} style={{ cursor: 'pointer' }}>
                                    Ignore Patterns ({ignorePatterns.length})
                                </CNavLink>
                            </CNavItem>
                            <CNavItem>
                                <CNavLink active={activeTab === 'stats'}
                                    onClick={() => setActiveTab('stats')} style={{ cursor: 'pointer' }}>
                                    Database
                                </CNavLink>
                            </CNavItem>
                        </CNav>

                        <CTabContent>
                            {/* Favorites Tab */}
                            <CTabPane visible={activeTab === 'favorites'}>
                                <div className="mb-3">
                                    <h6>Add Favorite</h6>
                                    <div className="d-flex gap-2 mb-3">
                                        <input type="text" className="form-control form-control-sm"
                                            value={newFavPath}
                                            onChange={(e) => setNewFavPath(e.target.value)}
                                            placeholder="Folder path (e.g., /Users/you/Documents)" />
                                        <input type="text" className="form-control form-control-sm" style={{ maxWidth: '200px' }}
                                            value={newFavName}
                                            onChange={(e) => setNewFavName(e.target.value)}
                                            placeholder="Display name" />
                                        <CButton onClick={handleAddFavorite} color="primary" size="sm" disabled={!newFavPath.trim()}>
                                            <CIcon icon={cilPlus} className="me-1" />Add
                                        </CButton>
                                    </div>
                                </div>

                                {favorites.length === 0 ? (
                                    <div className="text-center text-muted p-4">
                                        No favorites yet. Add folders you frequently access.
                                    </div>
                                ) : (
                                    <div className="list-group">
                                        {favorites.map((fav) => (
                                            <div key={fav.id} className="list-group-item d-flex justify-content-between align-items-center">
                                                <div style={{ cursor: 'pointer' }} onClick={() => navigateToFavorite(fav.path)}>
                                                    <CIcon icon={cilStar} className="text-warning me-2" />
                                                    <strong>{fav.name}</strong>
                                                    <div className="small text-muted">{fav.path}</div>
                                                </div>
                                                <CButton onClick={() => handleRemoveFavorite(fav.path)}
                                                    color="outline-danger" size="sm">
                                                    <CIcon icon={cilTrash} />
                                                </CButton>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CTabPane>

                            {/* Ignore Patterns Tab */}
                            <CTabPane visible={activeTab === 'ignore'}>
                                <div className="mb-3">
                                    <h6>Add Ignore Pattern</h6>
                                    <div className="d-flex gap-2 mb-2">
                                        <input type="text" className="form-control form-control-sm"
                                            value={newPatternInput}
                                            onChange={(e) => setNewPatternInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddPattern()}
                                            placeholder="Pattern (e.g., node_modules, *.tmp, target/debug)" />
                                        <CButton onClick={handleAddPattern} color="primary" size="sm" disabled={!newPatternInput.trim()}>
                                            <CIcon icon={cilPlus} className="me-1" />Add
                                        </CButton>
                                    </div>
                                    <div className="small text-muted">
                                        Patterns support: directory names (node_modules), path suffixes (target/debug), and globs (*.tmp, *.log)
                                    </div>
                                </div>

                                {ignorePatterns.length === 0 ? (
                                    <div className="text-center text-muted p-4">
                                        No ignore patterns configured. Default patterns are loaded automatically.
                                    </div>
                                ) : (
                                    <div className="list-group">
                                        {ignorePatterns.map((pat) => (
                                            <div key={pat.id} className="list-group-item d-flex justify-content-between align-items-center">
                                                <div>
                                                    <code>{pat.pattern}</code>
                                                    <div className="small text-muted">Added: {pat.created_at}</div>
                                                </div>
                                                <CButton onClick={() => handleRemovePattern(pat.pattern)}
                                                    color="outline-danger" size="sm">
                                                    <CIcon icon={cilTrash} />
                                                </CButton>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CTabPane>

                            {/* Database Stats Tab */}
                            <CTabPane visible={activeTab === 'stats'}>
                                {dbStats ? (
                                    <div className="row g-3">
                                        <div className="col-md-3">
                                            <div className="border rounded p-3 text-center">
                                                <h3>{dbStats.favorites_count}</h3>
                                                <div className="small text-muted">Favorites</div>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="border rounded p-3 text-center">
                                                <h3>{dbStats.ignore_patterns_count}</h3>
                                                <div className="small text-muted">Ignore Patterns</div>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="border rounded p-3 text-center">
                                                <h3>{dbStats.scan_records_count}</h3>
                                                <div className="small text-muted">Scan Records</div>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="border rounded p-3 text-center">
                                                <h3>{dbStats.cached_hashes_count}</h3>
                                                <div className="small text-muted">Cached Hashes</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-muted p-4">Loading database stats...</div>
                                )}
                                <div className="mt-3 small text-muted">
                                    Database location: ~/.yaanai/yaanai.db
                                </div>
                            </CTabPane>
                        </CTabContent>
                    </CCardBody>
                </CCard>
            </CCol>
        </CRow>
    );
}

export default Settings;
