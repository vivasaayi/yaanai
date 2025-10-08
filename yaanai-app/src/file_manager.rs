


use crate::recursive_tree_builder::RecursiveFileTreeBuilder;
use std::sync::Mutex;

pub struct FileManager {
    tree_builder: RecursiveFileTreeBuilder,
    cached_tree: Mutex<Option<crate::recursive_tree_builder::TreeNode>>,
    last_scan_path: Mutex<Option<String>>,
}

impl FileManager {
    pub fn new() -> Self {
        Self {
            tree_builder: RecursiveFileTreeBuilder::new(),
            cached_tree: Mutex::new(None),
            last_scan_path: Mutex::new(None),
        }
    }

    pub fn init(&mut self) {
        println!("Initializing the File Manager with async tree builder");
    }

    pub fn get_stats(&self) {
        println!("Getting Stats");
    }

    pub async fn get_file_tree_async(&self, folder_name: String) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        // Check if we have a cached tree for this path
        {
            let cached_path = self.last_scan_path.lock().unwrap();
            if let Some(ref path) = *cached_path {
                if path == &folder_name {
                    if let Some(ref tree) = *self.cached_tree.lock().unwrap() {
                        return Ok(tree.clone());
                    }
                }
            }
        }

        // No cache or different path, build new tree
        let tree = self.tree_builder.build_tree_async(folder_name.clone()).await?;
        
        // Cache the result
        *self.cached_tree.lock().unwrap() = Some(tree.clone());
        *self.last_scan_path.lock().unwrap() = Some(folder_name);
        
        Ok(tree)
    }

    pub async fn get_file_tree_with_progress_async(&self, folder_name: String, progress_tx: tokio::sync::mpsc::Sender<crate::recursive_tree_builder::TreeBuildProgress>) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        // Check if we have a cached tree for this path
        {
            let cached_path = self.last_scan_path.lock().unwrap();
            if let Some(ref path) = *cached_path {
                if path == &folder_name {
                    if let Some(ref tree) = *self.cached_tree.lock().unwrap() {
                        return Ok(tree.clone());
                    }
                }
            }
        }

        // No cache or different path, build new tree with progress
        let tree = self.tree_builder.build_tree_with_progress_async(folder_name.clone(), progress_tx).await?;
        
        // Cache the result
        *self.cached_tree.lock().unwrap() = Some(tree.clone());
        *self.last_scan_path.lock().unwrap() = Some(folder_name);
        
        Ok(tree)
    }

    pub async fn get_duplicates_async(&self) -> Result<Vec<crate::recursive_tree_builder::TreeNode>, String> {
        // Use cached tree if available, otherwise return error
        if self.cached_tree.lock().unwrap().is_some() {
            // For now, we need to rebuild to get duplicates since the tree builder state is not cached
            // In a full implementation, we'd cache the tree builder state as well
            self.tree_builder.get_duplicates_async().await
        } else {
            Err("No tree data available. Please scan a directory first.".to_string())
        }
    }

    pub async fn analyze_disk_usage_async(&self, folder_name: String) -> Result<Vec<crate::types::DiskEntry>, String> {
        // Check cache first
        {
            let cached_path = self.last_scan_path.lock().unwrap();
            if let Some(ref path) = *cached_path {
                if path == &folder_name {
                    // We could implement cached disk analysis here
                    // For now, we'll still do the analysis but could optimize later
                }
            }
        }

        // Use the yaanaiapp function for disk analysis
        Ok(crate::analyze_disk_usage(folder_name))
    }

    pub fn clear_cache(&self) {
        *self.cached_tree.lock().unwrap() = None;
        *self.last_scan_path.lock().unwrap() = None;
    }
}