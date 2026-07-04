/**
 * LeftPanel — Sidebar showing:
 * - Favorites (quick navigation)
 * - Scan History (load previous snapshots)
 * - Mini directory tree (from current snapshot)
 */

import React, { useState } from 'react';
import { useScanState } from '../state/ScanStateContext';
import { CBadge, CButton } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilStar, cilHistory, cilFolder, cilTrash, cilChevronRight, cilChevronBottom, cilExternalLink } from '@coreui/icons';
import { revealInFinder } from '../utils/fileActions';
import { formatBytes, timeAgo } from '../utils/treeAnalysis';

// Mini tree node
function TreeNodeItem({ node, depth = 0 }) {
    const [expanded, setExpanded] = useState(depth < 1);
    const isDir = node.node_type === 'directory';
    const hasChildren = node.children && node.children.length > 0;
    const name = node.disk_entry?.path?.split('/').pop() || 'root';
    const path = node.disk_entry?.path;

    if (!isDir && depth > 0) {
        return null; // Only show directories in left panel tree
    }

    const childDirs = hasChildren
        ? node.children
            .filter(c => c.node_type === 'directory')
            .sort((a, b) => b.disk_entry.size - a.disk_entry.size)
            .slice(0, 15)
        : [];

    return (
        <div>
            <div
                className="left-tree-row tree-node-hover"
                style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                onClick={() => hasChildren && setExpanded(!expanded)}
            >
                <span className="left-tree-indent" style={{ width: `${depth * 18}px` }} />
                {hasChildren ? (
                    <CIcon icon={expanded ? cilChevronBottom : cilChevronRight}
                        size="sm" className="left-tree-toggle text-muted" />
                ) : (
                    <span className="left-tree-toggle" />
                )}
                <CIcon icon={cilFolder} size="sm" className="left-tree-folder text-warning" />
                <span className="left-tree-name text-truncate" title={path || name}>{name}</span>
                <span className="left-tree-size text-muted">
                    {formatBytes(node.disk_entry?.size)}
                </span>
                <CButton
                    size="sm"
                    color="light"
                    className="left-tree-reveal p-0 border-0"
                    title="Reveal in Finder"
                    disabled={!path}
                    onClick={(event) => {
                        event.stopPropagation();
                        revealInFinder(path).catch((error) => console.error('Reveal failed:', error));
                    }}
                >
                    <CIcon icon={cilExternalLink} size="sm" />
                </CButton>
            </div>
            {expanded && childDirs.map((child, i) => (
                <TreeNodeItem key={child.disk_entry?.path || i} node={child} depth={depth + 1} />
            ))}
        </div>
    );
}

export default function LeftPanel() {
    const {
        favorites, removeFavorite, navigateAndScan,
        snapshotHistory, loadSnapshot, currentSnapshot,
        status
    } = useScanState();

    const [section, setSection] = useState('favorites');

    return (
        <div className="left-panel d-flex flex-column h-100 bg-white border-end"
             style={{ width: '250px', minWidth: '200px', fontSize: '13px', overflow: 'hidden' }}>

            {/* Section tabs */}
            <div className="d-flex border-bottom" style={{ fontSize: '11px' }}>
                <button
                    className={`btn btn-sm flex-fill rounded-0 border-0 ${section === 'favorites' ? 'btn-light fw-bold' : 'btn-white text-muted'}`}
                    onClick={() => setSection('favorites')}
                >
                    <CIcon icon={cilStar} size="sm" className="me-1" />
                    Favorites
                </button>
                <button
                    className={`btn btn-sm flex-fill rounded-0 border-0 ${section === 'history' ? 'btn-light fw-bold' : 'btn-white text-muted'}`}
                    onClick={() => setSection('history')}
                >
                    <CIcon icon={cilHistory} size="sm" className="me-1" />
                    History
                </button>
                <button
                    className={`btn btn-sm flex-fill rounded-0 border-0 ${section === 'tree' ? 'btn-light fw-bold' : 'btn-white text-muted'}`}
                    onClick={() => setSection('tree')}
                >
                    <CIcon icon={cilFolder} size="sm" className="me-1" />
                    Tree
                </button>
            </div>

            {/* Section content */}
            <div className="flex-grow-1" style={{ overflowY: 'auto' }}>

                {/* Favorites */}
                {section === 'favorites' && (
                    <div className="p-2">
                        {favorites.length === 0 ? (
                            <div className="text-muted text-center py-4" style={{ fontSize: '12px' }}>
                                No favorites yet.<br />
                                Click the star icon in the header to add folders.
                            </div>
                        ) : (
                            favorites.map((fav) => (
                                <div key={fav.id}
                                    className="d-flex align-items-center py-1 px-2 rounded mb-1 tree-node-hover"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => navigateAndScan(fav.path)}
                                >
                                    <CIcon icon={cilStar} size="sm" className="me-2 text-warning" />
                                    <div className="flex-grow-1 text-truncate">
                                        <div className="fw-semibold" style={{ fontSize: '12px' }}>{fav.name}</div>
                                        <div className="text-muted text-truncate" style={{ fontSize: '10px' }}>{fav.path}</div>
                                    </div>
                                    <CButton
                                        size="sm"
                                        color="light"
                                        className="p-0 border-0"
                                        onClick={(e) => { e.stopPropagation(); removeFavorite(fav.path); }}
                                        title="Remove"
                                    >
                                        <CIcon icon={cilTrash} size="sm" className="text-danger" />
                                    </CButton>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* History */}
                {section === 'history' && (
                    <div className="p-2">
                        {snapshotHistory.length === 0 ? (
                            <div className="text-muted text-center py-4" style={{ fontSize: '12px' }}>
                                No scan history yet.<br />
                                Scan a directory to start.
                            </div>
                        ) : (
                            snapshotHistory.map((snap) => {
                                const isCurrent = currentSnapshot?.version === snap.version;
                                return (
                                    <div key={snap.version}
                                        className={`p-2 rounded mb-1 ${isCurrent ? 'bg-light border' : 'tree-node-hover'}`}
                                        style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                                        onClick={() => !isCurrent && loadSnapshot(snap)}
                                    >
                                        <div className="d-flex align-items-center">
                                            <CIcon icon={cilHistory} size="sm" className="me-2 text-primary" />
                                            <div className="flex-grow-1">
                                                <div style={{ fontSize: '12px' }} className="fw-semibold text-truncate">
                                                    {snap.path.split('/').pop() || snap.path}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '10px' }}>
                                                    {snap.fileCount} files &middot; {snap.totalSizeH} &middot; {timeAgo(snap.scannedAt)}
                                                </div>
                                            </div>
                                            {isCurrent && <CBadge color="success" size="sm">current</CBadge>}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* Mini Tree */}
                {section === 'tree' && (
                    <div className="p-1">
                        {currentSnapshot?.tree ? (
                            <TreeNodeItem node={currentSnapshot.tree} depth={0} />
                        ) : (
                            <div className="text-muted text-center py-4" style={{ fontSize: '12px' }}>
                                Scan a directory to see the tree.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
