use std::fs::{DirEntry, ReadDir};
use serde::{Deserialize, Serialize};
use crate::types::DiskEntry;
use crate::ignore_matcher::IgnoreMatcher;
use std::collections::HashMap;
use tokio::sync::mpsc;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NodeType {
    Empty, // Not Initialized
    Directory,
    File
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum FileType {
    Empty, // Not Initialized or default
    JPEG,
    Text,
    JavaScript
}

// Progress updates during tree building
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeBuildProgress {
    pub current_path: String,
    pub files_processed: u64,
    pub directories_processed: u64,
    pub total_size_bytes: u64,
    pub partial_tree: Option<TreeNode>,
    pub errors: Vec<ScanError>,
}

// Error information for scan errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanError {
    pub path: String,
    pub error_message: String,
    pub error_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TreeNode {
    pub node_type: NodeType,
    pub file_type: FileType,
    pub children: Vec<TreeNode>,
    pub disk_entry: crate::DiskEntry,
}

impl TreeNode {
    fn new() -> Self {
        TreeNode {
            node_type: NodeType::Empty,
            file_type: FileType::Empty,
            disk_entry: DiskEntry::new_from_empty(),
            children: vec![],
        }
    }
}

/// Builds file trees synchronously on a blocking thread.
/// No tokio runtime needed at construction time.
pub struct RecursiveFileTreeBuilder {
    ignore_matcher: IgnoreMatcher,
}

impl RecursiveFileTreeBuilder {
    pub fn new() -> Self {
        Self {
            ignore_matcher: IgnoreMatcher::empty(),
        }
    }

    pub fn with_ignore_matcher(ignore_matcher: IgnoreMatcher) -> Self {
        Self { ignore_matcher }
    }

    pub fn set_ignore_matcher(&mut self, ignore_matcher: IgnoreMatcher) {
        self.ignore_matcher = ignore_matcher;
    }

    /// Build tree asynchronously by running the CPU-bound work on a blocking thread.
    pub async fn build_tree_async(&self, folder_name: String) -> Result<TreeNode, String> {
        let ignore_patterns = self.ignore_matcher.patterns().to_vec();
        tokio::task::spawn_blocking(move || {
            let matcher = IgnoreMatcher::new(ignore_patterns);
            let mut state = TreeBuilderState::new(&matcher);
            state.build_tree(&folder_name);
            state.root_node
        })
        .await
        .map_err(|e| format!("Tree build task failed: {}", e))
    }

    /// Build tree with progress updates.
    pub async fn build_tree_with_progress_async(
        &self,
        folder_name: String,
        progress_tx: mpsc::Sender<TreeBuildProgress>,
    ) -> Result<TreeNode, String> {
        let ignore_patterns = self.ignore_matcher.patterns().to_vec();
        tokio::task::spawn_blocking(move || {
            let matcher = IgnoreMatcher::new(ignore_patterns);
            let mut state = TreeBuilderState::new(&matcher);
            state.build_tree_with_progress(&folder_name, Some(progress_tx));
            state.root_node
        })
        .await
        .map_err(|e| format!("Tree build task failed: {}", e))
    }

    /// Get duplicate files from a previously built tree (by size+name key).
    pub async fn get_duplicates_async(&self) -> Result<Vec<TreeNode>, String> {
        // This basic duplicate detection is superseded by duplicate_detector.rs (SHA256).
        // Kept for backward compatibility with existing frontend.
        Ok(vec![])
    }
}

// Internal state for tree building (runs on blocking thread)
struct TreeBuilderState<'a> {
    pub root_node: TreeNode,
    pub tree_builder_errors: Vec<String>,
    pub files_map: HashMap<String, Vec<TreeNode>>,
    pub files_processed: u64,
    pub directories_processed: u64,
    ignore_matcher: &'a IgnoreMatcher,
}

impl<'a> TreeBuilderState<'a> {
    fn new(ignore_matcher: &'a IgnoreMatcher) -> Self {
        Self {
            root_node: TreeNode::new(),
            tree_builder_errors: vec![],
            files_map: HashMap::new(),
            files_processed: 0,
            directories_processed: 0,
            ignore_matcher,
        }
    }

    fn build_tree(&mut self, name: &str) {
        let mut tree_node = TreeNode::new();
        tree_node.node_type = NodeType::Directory;
        self.recursively_build_file_tree(name, &mut tree_node);
        self.root_node = tree_node;
    }

    fn build_tree_with_progress(&mut self, name: &str, progress_tx: Option<mpsc::Sender<TreeBuildProgress>>) {
        let mut tree_node = TreeNode::new();
        tree_node.node_type = NodeType::Directory;
        self.recursively_build_file_tree_impl(name, &mut tree_node, &progress_tx);
        self.root_node = tree_node;
    }

    fn recursively_build_file_tree(&mut self, name: &str, parent_node: &mut TreeNode) {
        self.recursively_build_file_tree_impl(name, parent_node, &None);
    }

    fn recursively_build_file_tree_impl(
        &mut self,
        name: &str,
        parent_node: &mut TreeNode,
        progress_tx: &Option<mpsc::Sender<TreeBuildProgress>>,
    ) {
        // Use the IgnoreMatcher instead of hardcoded paths
        if self.ignore_matcher.should_ignore(name) {
            return;
        }

        let dirs: std::io::Result<ReadDir> = std::fs::read_dir(name);

        let dirs = match dirs {
            Ok(d) => d,
            Err(error) => {
                self.tree_builder_errors.push(format!("Error reading directory {}: {}", name, error));
                return;
            }
        };

        for entry_result in dirs {
            let dir_entry: DirEntry = match entry_result {
                Ok(e) => e,
                Err(e) => {
                    self.tree_builder_errors.push(format!("Entry error in {}: {}", name, e));
                    continue;
                }
            };

            let dir_path: String = match dir_entry.file_name().into_string() {
                Ok(s) => s,
                Err(_) => continue, // Skip non-UTF8 filenames
            };

            let metadata = match dir_entry.metadata() {
                Ok(m) => m,
                Err(error) => {
                    self.tree_builder_errors.push(format!("Metadata error for {}/{}: {}", name, dir_path, error));
                    continue; // Continue instead of returning
                }
            };

            let mut child_tree_node = TreeNode::new();

            if metadata.is_dir() {
                self.directories_processed += 1;
                child_tree_node.node_type = NodeType::Directory;
                child_tree_node.disk_entry = DiskEntry::new(&dir_entry);

                let child_dir_path = format!("{}/{}", name, dir_path);

                self.recursively_build_file_tree_impl(&child_dir_path, &mut child_tree_node, progress_tx);
                parent_node.disk_entry.size += child_tree_node.disk_entry.size;
            } else if metadata.is_file() {
                self.files_processed += 1;
                child_tree_node.node_type = NodeType::File;
                child_tree_node.disk_entry = DiskEntry::new(&dir_entry);
                parent_node.disk_entry.size += child_tree_node.disk_entry.size;

                // Track for size-based duplicate detection
                let key = format!("{}{}", dir_path, child_tree_node.disk_entry.size);
                self.files_map
                    .entry(key)
                    .or_insert_with(Vec::new)
                    .push(child_tree_node.clone());
            }

            parent_node.disk_entry.calculate_human_size();
            parent_node.children.push(child_tree_node);

            // Send progress update every 50 items
            if progress_tx.is_some() && (self.files_processed + self.directories_processed) % 50 == 0 {
                if let Some(ref tx) = progress_tx {
                    let errors = self.tree_builder_errors.iter().map(|err_msg| {
                        let error_type = if err_msg.contains("Operation not permitted") || err_msg.contains("Permission denied") {
                            "permission_denied".to_string()
                        } else if err_msg.contains("No such file") {
                            "not_found".to_string()
                        } else {
                            "other".to_string()
                        };
                        ScanError {
                            path: name.to_string(),
                            error_message: err_msg.clone(),
                            error_type,
                        }
                    }).collect();

                    let _ = tx.try_send(TreeBuildProgress {
                        current_path: name.to_string(),
                        files_processed: self.files_processed,
                        directories_processed: self.directories_processed,
                        total_size_bytes: parent_node.disk_entry.size,
                        partial_tree: None, // Don't clone entire tree for perf
                        errors,
                    });
                }
            }
        }
    }
}
