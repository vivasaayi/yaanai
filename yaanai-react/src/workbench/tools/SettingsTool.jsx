/**
 * SettingsTool — Manage ignore patterns, favorites, and view DB stats.
 */

import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useScanState } from '../state/ScanStateContext';
import { CButton, CNav, CNavItem, CNavLink, CTabContent, CTabPane } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilStar, cilTrash, cilPlus, cilMoon, cilSun } from '@coreui/icons';

export default function SettingsTool() {
    const {
        favorites, ignorePatterns,
        addFavorite, removeFavorite,
        addIgnorePattern, removeIgnorePattern,
        navigateAndScan, themeMode, setThemeMode, currentPath, activeTab
    } = useScanState();

    const [tab, setTab] = useState('patterns');
    const [newPattern, setNewPattern] = useState('');
    const [newFavPath, setNewFavPath] = useState('');
    const [newFavName, setNewFavName] = useState('');
    const [dbStats, setDbStats] = useState(null);

    useEffect(() => {
        invoke("get_db_stats").then(setDbStats).catch(() => {});
    }, []);

    async function handleAddPattern() {
        if (!newPattern.trim()) return;
        try {
            await addIgnorePattern(newPattern.trim());
            setNewPattern('');
        } catch (e) { alert("Failed: " + e); }
    }

    async function handleAddFav() {
        if (!newFavPath.trim()) return;
        const name = newFavName.trim() || newFavPath.split('/').pop() || newFavPath;
        try {
            await addFavorite(newFavPath.trim(), name);
            setNewFavPath('');
            setNewFavName('');
        } catch (e) { alert("Failed: " + e); }
    }

    return (
        <div className="p-3">
            <CNav variant="tabs" className="mb-3">
                <CNavItem>
                    <CNavLink active={tab === 'patterns'} onClick={() => setTab('patterns')} style={{ cursor: 'pointer' }}>
                        Ignore Patterns ({ignorePatterns.length})
                    </CNavLink>
                </CNavItem>
                <CNavItem>
                    <CNavLink active={tab === 'favorites'} onClick={() => setTab('favorites')} style={{ cursor: 'pointer' }}>
                        Favorites ({favorites.length})
                    </CNavLink>
                </CNavItem>
                <CNavItem>
                    <CNavLink active={tab === 'database'} onClick={() => setTab('database')} style={{ cursor: 'pointer' }}>
                        Database
                    </CNavLink>
                </CNavItem>
                <CNavItem>
                    <CNavLink active={tab === 'appearance'} onClick={() => setTab('appearance')} style={{ cursor: 'pointer' }}>
                        Appearance
                    </CNavLink>
                </CNavItem>
            </CNav>

            <CTabContent>
                {/* Ignore Patterns */}
                <CTabPane visible={tab === 'patterns'}>
                    <div className="mb-3">
                        <div className="d-flex gap-2 mb-2">
                            <input type="text" className="form-control form-control-sm"
                                value={newPattern}
                                onChange={(e) => setNewPattern(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddPattern()}
                                placeholder="Pattern (e.g., node_modules, *.tmp, target/debug)" />
                            <CButton onClick={handleAddPattern} color="primary" size="sm" disabled={!newPattern.trim()}>
                                <CIcon icon={cilPlus} className="me-1" />Add
                            </CButton>
                        </div>
                        <div className="small text-muted">
                            Patterns are applied during scanning to skip matching files and directories.
                        </div>
                    </div>
                    <div className="list-group">
                        {ignorePatterns.map((pat) => (
                            <div key={pat.id} className="list-group-item d-flex justify-content-between align-items-center py-2">
                                <code style={{ fontSize: '13px' }}>{pat.pattern}</code>
                                <CButton onClick={() => removeIgnorePattern(pat.pattern)}
                                    color="outline-danger" size="sm" className="py-0">
                                    <CIcon icon={cilTrash} size="sm" />
                                </CButton>
                            </div>
                        ))}
                        {ignorePatterns.length === 0 && (
                            <div className="text-muted text-center py-3 small">No patterns configured.</div>
                        )}
                    </div>
                </CTabPane>

                {/* Favorites */}
                <CTabPane visible={tab === 'favorites'}>
                    <div className="mb-3">
                        <div className="d-flex gap-2 mb-2">
                            <input type="text" className="form-control form-control-sm"
                                value={newFavPath}
                                onChange={(e) => setNewFavPath(e.target.value)}
                                placeholder="Folder path" />
                            <input type="text" className="form-control form-control-sm" style={{ maxWidth: '150px' }}
                                value={newFavName}
                                onChange={(e) => setNewFavName(e.target.value)}
                                placeholder="Name" />
                            <CButton onClick={handleAddFav} color="primary" size="sm" disabled={!newFavPath.trim()}>
                                <CIcon icon={cilPlus} className="me-1" />Add
                            </CButton>
                        </div>
                    </div>
                    <div className="list-group">
                        {favorites.map((fav) => (
                            <div key={fav.id} className="list-group-item d-flex justify-content-between align-items-center py-2">
                                <div style={{ cursor: 'pointer' }} onClick={() => navigateAndScan(fav.path)}>
                                    <CIcon icon={cilStar} className="text-warning me-2" size="sm" />
                                    <strong style={{ fontSize: '13px' }}>{fav.name}</strong>
                                    <div className="text-muted small">{fav.path}</div>
                                </div>
                                <CButton onClick={() => removeFavorite(fav.path)}
                                    color="outline-danger" size="sm" className="py-0">
                                    <CIcon icon={cilTrash} size="sm" />
                                </CButton>
                            </div>
                        ))}
                        {favorites.length === 0 && (
                            <div className="text-muted text-center py-3 small">No favorites yet.</div>
                        )}
                    </div>
                </CTabPane>

                {/* Database */}
                <CTabPane visible={tab === 'database'}>
                    {dbStats ? (
                        <div className="row g-3 mb-3">
                            {[
                                { label: 'Favorites', value: dbStats.favorites_count },
                                { label: 'Ignore Patterns', value: dbStats.ignore_patterns_count },
                                { label: 'Scan Records', value: dbStats.scan_records_count },
                                { label: 'Cached Hashes', value: dbStats.cached_hashes_count },
                            ].map((s) => (
                                <div key={s.label} className="col-md-3">
                                    <div className="border rounded p-3 text-center">
                                        <h4>{s.value}</h4>
                                        <div className="small text-muted">{s.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-muted text-center py-3">Loading...</div>
                    )}
                    <div className="small text-muted">
                        Database: <code>~/.yaanai/yaanai.db</code>
                    </div>
                </CTabPane>

                <CTabPane visible={tab === 'appearance'}>
                    <div className="border rounded p-3 mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <div className="fw-semibold">Theme</div>
                                <div className="small text-muted">Applies immediately and persists across sessions.</div>
                            </div>
                            <div className="btn-group btn-group-sm">
                                <CButton
                                    color={themeMode === 'light' ? 'primary' : 'outline-secondary'}
                                    onClick={() => setThemeMode('light')}
                                >
                                    <CIcon icon={cilSun} className="me-1" />Light
                                </CButton>
                                <CButton
                                    color={themeMode === 'dark' ? 'primary' : 'outline-secondary'}
                                    onClick={() => setThemeMode('dark')}
                                >
                                    <CIcon icon={cilMoon} className="me-1" />Dark
                                </CButton>
                            </div>
                        </div>
                    </div>

                    <div className="border rounded p-3 mb-3">
                        <div className="fw-semibold mb-2">Persistent Workbench State</div>
                        <div className="small text-muted mb-1">Last path: {currentPath || 'Not set'}</div>
                        <div className="small text-muted mb-1">Last active tab: {activeTab}</div>
                        <div className="small text-muted">Favorites are already stored in the local app database.</div>
                    </div>

                    <div className="border rounded p-3">
                        <div className="fw-semibold mb-2">Keyboard Shortcuts</div>
                        <div className="small text-muted mb-1">Cmd/Ctrl+D: open Duplicates</div>
                        <div className="small text-muted mb-1">Cmd/Ctrl+F: open Search</div>
                        <div className="small text-muted mb-1">Cmd/Ctrl+R: rescan current path</div>
                        <div className="small text-muted">Cmd/Ctrl+1-6: switch workbench tabs</div>
                    </div>
                </CTabPane>
            </CTabContent>
        </div>
    );
}
