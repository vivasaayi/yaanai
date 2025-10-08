use std::fs::{DirEntry, ReadDir};
use serde::{Deserialize, Serialize};
use crate::types::DiskEntry;
use std::collections::HashMap;
use tokio::sync::{mpsc, oneshot};

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

// Request types for background processing
#[derive(Debug)]
pub enum TreeBuilderRequest {
    BuildTree {
        folder_name: String,
        response_tx: oneshot::Sender<TreeBuilderResponse>,
        progress_tx: Option<mpsc::Sender<TreeBuildProgress>>,
    },
    GetDuplicates {
        response_tx: oneshot::Sender<TreeBuilderResponse>,
    },
    GetDiskUsage {
        response_tx: oneshot::Sender<TreeBuilderResponse>,
    },
    Shutdown,
}

// Response types from background processing
#[derive(Debug)]
pub enum TreeBuilderResponse {
    TreeBuilt(TreeNode),
    DuplicatesFound(Vec<TreeNode>),
    DiskUsageAnalyzed(Vec<DiskEntry>),
    Error(String),
}

// Progress updates during tree building
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeBuildProgress {
    pub current_path: String,
    pub files_processed: u64,
    pub directories_processed: u64,
    pub total_size_bytes: u64,
    pub partial_tree: Option<TreeNode>, // Send partial tree data
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TreeNode {
    pub node_type:NodeType,
    pub file_type:FileType,
    pub children: Vec<TreeNode>,
    pub disk_entry: crate::DiskEntry,
}

impl TreeNode {
    fn new() ->Self {
        TreeNode{
            node_type: NodeType::Empty,
            file_type: FileType::Empty,
            disk_entry: DiskEntry::new_from_empty(),
            children: vec![],
        }
    }
}

pub struct RecursiveFileTreeBuilder {
    request_tx: mpsc::Sender<TreeBuilderRequest>,
}

impl RecursiveFileTreeBuilder {
    pub fn new() -> Self {
        let (request_tx, request_rx) = mpsc::channel(32);
        
        // Spawn the background task
        tokio::spawn(async move {
            Self::background_task(request_rx).await;
        });
        
        Self { request_tx }
    }

    async fn background_task(mut request_rx: mpsc::Receiver<TreeBuilderRequest>) {
        while let Some(request) = request_rx.recv().await {
            match request {
                TreeBuilderRequest::BuildTree { folder_name, response_tx, progress_tx } => {
                    // Run CPU-intensive tree building on blocking thread pool
                    let folder_name_clone = folder_name.clone();
                    let progress_tx_clone = progress_tx.clone();
                    let tree_result = tokio::task::spawn_blocking(move || {
                        let mut tree_builder = TreeBuilderState::new();
                        tree_builder.build_tree_with_progress(&folder_name_clone, progress_tx_clone);
                        tree_builder.root_node
                    }).await;
                    
                    match tree_result {
                        Ok(tree) => {
                            let _ = response_tx.send(TreeBuilderResponse::TreeBuilt(tree));
                        }
                        Err(e) => {
                            let _ = response_tx.send(TreeBuilderResponse::Error(format!("Task failed: {}", e)));
                        }
                    }
                }
                TreeBuilderRequest::GetDuplicates { response_tx } => {
                    // For now, return empty duplicates - this would need proper state management
                    let _ = response_tx.send(TreeBuilderResponse::DuplicatesFound(vec![]));
                }
                TreeBuilderRequest::GetDiskUsage { response_tx } => {
                    // For now, return empty disk usage - this would need proper state management
                    let _ = response_tx.send(TreeBuilderResponse::DiskUsageAnalyzed(vec![]));
                }
                TreeBuilderRequest::Shutdown => {
                    break;
                }
            }
        }
    }

    pub async fn build_tree_async(&self, folder_name: String) -> Result<TreeNode, String> {
        let (response_tx, response_rx) = oneshot::channel();
        
        self.request_tx.send(TreeBuilderRequest::BuildTree {
            folder_name,
            response_tx,
            progress_tx: None, // No progress callback for now
        }).await.map_err(|e| format!("Failed to send request: {}", e))?;
        
        match response_rx.await.map_err(|e| format!("Failed to receive response: {}", e))? {
            TreeBuilderResponse::TreeBuilt(tree) => Ok(tree),
            TreeBuilderResponse::Error(err) => Err(err),
            _ => Err("Unexpected response type".to_string()),
        }
    }

    pub async fn build_tree_with_progress_async(&self, folder_name: String, progress_tx: mpsc::Sender<TreeBuildProgress>) -> Result<TreeNode, String> {
        let (response_tx, response_rx) = oneshot::channel();
        
        self.request_tx.send(TreeBuilderRequest::BuildTree {
            folder_name,
            response_tx,
            progress_tx: Some(progress_tx),
        }).await.map_err(|e| format!("Failed to send request: {}", e))?;
        
        match response_rx.await.map_err(|e| format!("Failed to receive response: {}", e))? {
            TreeBuilderResponse::TreeBuilt(tree) => Ok(tree),
            TreeBuilderResponse::Error(err) => Err(err),
            _ => Err("Unexpected response type".to_string()),
        }
    }

    pub async fn get_duplicates_async(&self) -> Result<Vec<TreeNode>, String> {
        let (response_tx, response_rx) = oneshot::channel();
        
        self.request_tx.send(TreeBuilderRequest::GetDuplicates {
            response_tx,
        }).await.map_err(|e| format!("Failed to send request: {}", e))?;
        
        match response_rx.await.map_err(|e| format!("Failed to receive response: {}", e))? {
            TreeBuilderResponse::DuplicatesFound(duplicates) => Ok(duplicates),
            TreeBuilderResponse::Error(err) => Err(err),
            _ => Err("Unexpected response type".to_string()),
        }
    }
}

// Internal state for the background task
struct TreeBuilderState {
    pub root_node: TreeNode,
    pub tree_builder_errors: Vec<String>,
    pub files_map: HashMap<String, Vec<TreeNode>>,
}

impl TreeBuilderState {
    fn new() -> Self {
        Self {
            root_node: TreeNode::new(),
            tree_builder_errors: vec![],
            files_map: HashMap::new(),
        }
    }

    fn build_tree_using_recursion(&mut self, name: &str) {
        let mut tree_node = TreeNode::new();
        tree_node.node_type = NodeType::Directory;

        self.recursively_build_file_tree(name, &mut tree_node);

        self.root_node = tree_node;
    }

    fn build_tree_with_progress(&mut self, name: &str, progress_tx: Option<mpsc::Sender<TreeBuildProgress>>) {
        let mut tree_node = TreeNode::new();
        tree_node.node_type = NodeType::Directory;

        self.recursively_build_file_tree_with_progress(name, &mut tree_node, progress_tx);

        self.root_node = tree_node;
    }

    fn get_duplicate_files(&self) -> Vec<TreeNode> {
        let mut dupes: Vec<TreeNode> = vec![];

        for nodes in self.files_map.values() {
            if nodes.len() > 1 {
                for node in nodes.iter() {
                    dupes.push(node.clone());
                }
            }
        }

        dupes
    }

    pub fn recursively_build_file_tree<'a>(&mut self, name: &'a str, parent_node: &'a mut TreeNode) {
        // println!("Getting files in folder:{}", name);

        if name.contains("/Users/rajanp/Library") {
            return
        }


        if name.ends_with(".npm") ||name.ends_with(".m2") || name.ends_with(".git") || name.ends_with("node_modules") || name.ends_with(".cargo")
            || name.ends_with(".nuget") || name.ends_with(".rustup") || name.ends_with(".vscode")
        || name.ends_with(".gradle") || name.ends_with("target/release") || name.ends_with("target/debug")
        || name.ends_with("Movies/CacheClip") ||  name.ends_with("bin/Release") || name.ends_with("bin/Debug")
        || name.ends_with("tests/wpt") || name.ends_with("obj/Release") || name.ends_with("bin/Release")||
            name.ends_with("rajanp/Applications") || name.ends_with("rajanp/work") || name.ends_with("Render Files/Peaks Data")
            || name.ends_with("Documents/projects") || name.ends_with("AndroidStudioProjects"){

            return
        }

        let dirs: std::io::Result<ReadDir> = std::fs::read_dir(name);

        match dirs {
            Err(error) => {
                self.tree_builder_errors.push("Error occurred when reading the directory {name}".to_string());
                println!("Error occurred when reading the directory {name}");
                println!("{error}");
                return;
            }

            _ => {}
        }

        for dir in dirs.unwrap() {
            let dir_entry: DirEntry = dir.unwrap();

            let dir_path: String = dir_entry.file_name().into_string().unwrap();

            let metadata = dir_entry.metadata();

            match metadata {
                Err(error) => {
                    self.tree_builder_errors.push("Unable to get metadata for {name}".to_string());
                    println!("Error occurred when reading the directory {name}");
                    println!("{error}");
                    return;
                }

                _ => {}
            }

            let metadata = metadata.unwrap();

            let mut child_tree_node = TreeNode::new();
            if metadata.is_dir() {
                child_tree_node.node_type = NodeType::Directory;
                child_tree_node.disk_entry = DiskEntry::new(&dir_entry);

                let mut child_dir_path = name.to_string();
                child_dir_path.push_str("/");
                child_dir_path.push_str(dir_path.as_str());

                self.recursively_build_file_tree(&child_dir_path, &mut child_tree_node);
                parent_node.disk_entry.size += child_tree_node.disk_entry.size;
            } else if metadata.is_file() {
                child_tree_node.node_type = NodeType::File;
                child_tree_node.disk_entry = DiskEntry::new(&dir_entry);
                parent_node.disk_entry.size += child_tree_node.disk_entry.size;

                let key = dir_path + child_tree_node.disk_entry.size.to_string().as_str();
                let key = key.as_str();

                let result = self.files_map.get_mut(key);

                match result {
                    None => {
                        let mut new_vec:Vec<TreeNode> = vec![];

                        new_vec.push(child_tree_node.clone());

                        self.files_map.insert(key.to_string(), new_vec);
                    }

                    Some(hm) => {
                        hm.push(child_tree_node.clone())
                    }
                }
            }

            parent_node.disk_entry.calculate_human_size();
            parent_node.children.push(child_tree_node);
        }
    }

    pub fn recursively_build_file_tree_with_progress<'a>(&mut self, name: &'a str, parent_node: &'a mut TreeNode, progress_tx: Option<mpsc::Sender<TreeBuildProgress>>) {
        // Send progress update if sender is available
        if let Some(ref tx) = progress_tx {
            let _ = tx.try_send(TreeBuildProgress {
                current_path: name.to_string(),
                files_processed: 0, // We'll track this properly later
                directories_processed: 0,
                total_size_bytes: parent_node.disk_entry.size,
                partial_tree: Some(parent_node.clone()),
            });
        }

        if name.contains("/Users/rajanp/Library") {
            return
        }

        if name.ends_with(".npm") ||name.ends_with(".m2") || name.ends_with(".git") || name.ends_with("node_modules") || name.ends_with(".cargo")
            || name.ends_with(".nuget") || name.ends_with(".rustup") || name.ends_with(".vscode")
        || name.ends_with(".gradle") || name.ends_with("target/release") || name.ends_with("target/debug")
        || name.ends_with("Movies/CacheClip") ||  name.ends_with("bin/Release") || name.ends_with("bin/Debug")
        || name.ends_with("tests/wpt") || name.ends_with("obj/Release") || name.ends_with("bin/Release")||
            name.ends_with("rajanp/Applications") || name.ends_with("rajanp/work") || name.ends_with("Render Files/Peaks Data")
            || name.ends_with("Documents/projects") || name.ends_with("AndroidStudioProjects"){

            return
        }

        let dirs: std::io::Result<ReadDir> = std::fs::read_dir(name);

        match dirs {
            Err(error) => {
                self.tree_builder_errors.push("Error occurred when reading the directory {name}".to_string());
                println!("Error occurred when reading the directory {name}");
                println!("{error}");
                return;
            }

            _ => {}
        }

        for dir in dirs.unwrap() {
            let dir_entry: DirEntry = dir.unwrap();

            let dir_path: String = dir_entry.file_name().into_string().unwrap();

            let metadata = dir_entry.metadata();

            match metadata {
                Err(error) => {
                    self.tree_builder_errors.push("Unable to get metadata for {name}".to_string());
                    println!("Error occurred when reading the directory {name}");
                    println!("{error}");
                    return;
                }

                _ => {}
            }

            let metadata = metadata.unwrap();

            let mut child_tree_node = TreeNode::new();
            if metadata.is_dir() {
                child_tree_node.node_type = NodeType::Directory;
                child_tree_node.disk_entry = DiskEntry::new(&dir_entry);

                let mut child_dir_path = name.to_string();
                child_dir_path.push_str("/");
                child_dir_path.push_str(dir_path.as_str());

                self.recursively_build_file_tree_with_progress(&child_dir_path, &mut child_tree_node, progress_tx.clone());
                parent_node.disk_entry.size += child_tree_node.disk_entry.size;
            } else if metadata.is_file() {
                child_tree_node.node_type = NodeType::File;
                child_tree_node.disk_entry = DiskEntry::new(&dir_entry);
                parent_node.disk_entry.size += child_tree_node.disk_entry.size;

                let key = dir_path + child_tree_node.disk_entry.size.to_string().as_str();
                let key = key.as_str();

                let result = self.files_map.get_mut(key);

                match result {
                    None => {
                        let mut new_vec:Vec<TreeNode> = vec![];

                        new_vec.push(child_tree_node.clone());

                        self.files_map.insert(key.to_string(), new_vec);
                    }

                    Some(hm) => {
                        hm.push(child_tree_node.clone())
                    }
                }
            }

            parent_node.disk_entry.calculate_human_size();
            parent_node.children.push(child_tree_node);
        }
    }
}