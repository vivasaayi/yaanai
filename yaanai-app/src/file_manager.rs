use crate::ignore_matcher::IgnoreMatcher;
use crate::recursive_tree_builder::RecursiveFileTreeBuilder;
use std::sync::Mutex;

pub struct FileManager {
    cached_tree: Mutex<Option<crate::recursive_tree_builder::TreeNode>>,
    last_scan_path: Mutex<Option<String>>,
    last_ignore_patterns: Mutex<Vec<String>>,
}

impl FileManager {
    pub fn new() -> Self {
        Self {
            cached_tree: Mutex::new(None),
            last_scan_path: Mutex::new(None),
            last_ignore_patterns: Mutex::new(Vec::new()),
        }
    }

    pub fn init(&mut self) {
        println!("Initializing the File Manager with async tree builder");
    }

    pub fn get_stats(&self) {
        println!("Getting Stats");
    }

    pub async fn get_file_tree_async(
        &self,
        folder_name: String,
    ) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        self.get_file_tree_with_ignore_async(folder_name, IgnoreMatcher::empty())
            .await
    }

    pub async fn get_file_tree_with_ignore_async(
        &self,
        folder_name: String,
        ignore_matcher: IgnoreMatcher,
    ) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        let ignore_patterns = ignore_matcher.patterns().to_vec();

        // Check if we have a cached tree for this path
        {
            let cached_path = self.last_scan_path.lock().unwrap();
            let cached_patterns = self.last_ignore_patterns.lock().unwrap();
            if let Some(ref path) = *cached_path {
                if path == &folder_name && *cached_patterns == ignore_patterns {
                    if let Some(ref tree) = *self.cached_tree.lock().unwrap() {
                        return Ok(tree.clone());
                    }
                }
            }
        }

        // No cache or different path, build new tree
        let tree_builder = RecursiveFileTreeBuilder::with_ignore_matcher(ignore_matcher);
        let tree = tree_builder.build_tree_async(folder_name.clone()).await?;

        // Cache the result
        *self.cached_tree.lock().unwrap() = Some(tree.clone());
        *self.last_scan_path.lock().unwrap() = Some(folder_name);
        *self.last_ignore_patterns.lock().unwrap() = ignore_patterns;

        Ok(tree)
    }

    pub async fn get_file_tree_with_progress_async(
        &self,
        folder_name: String,
        progress_tx: tokio::sync::mpsc::Sender<crate::recursive_tree_builder::TreeBuildProgress>,
    ) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        self.get_file_tree_with_progress_and_ignore_async(
            folder_name,
            progress_tx,
            IgnoreMatcher::empty(),
        )
        .await
    }

    pub async fn get_file_tree_with_progress_and_ignore_async(
        &self,
        folder_name: String,
        progress_tx: tokio::sync::mpsc::Sender<crate::recursive_tree_builder::TreeBuildProgress>,
        ignore_matcher: IgnoreMatcher,
    ) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        let ignore_patterns = ignore_matcher.patterns().to_vec();

        // Check if we have a cached tree for this path
        {
            let cached_path = self.last_scan_path.lock().unwrap();
            let cached_patterns = self.last_ignore_patterns.lock().unwrap();
            if let Some(ref path) = *cached_path {
                if path == &folder_name && *cached_patterns == ignore_patterns {
                    if let Some(ref tree) = *self.cached_tree.lock().unwrap() {
                        return Ok(tree.clone());
                    }
                }
            }
        }

        // No cache or different path, build new tree with progress
        let tree_builder = RecursiveFileTreeBuilder::with_ignore_matcher(ignore_matcher);
        let tree = tree_builder
            .build_tree_with_progress_async(folder_name.clone(), progress_tx)
            .await?;

        // Cache the result
        *self.cached_tree.lock().unwrap() = Some(tree.clone());
        *self.last_scan_path.lock().unwrap() = Some(folder_name);
        *self.last_ignore_patterns.lock().unwrap() = ignore_patterns;

        Ok(tree)
    }

    pub async fn get_duplicates_async(
        &self,
    ) -> Result<Vec<crate::recursive_tree_builder::TreeNode>, String> {
        // Use cached tree if available, otherwise return error
        if self.cached_tree.lock().unwrap().is_some() {
            // For now, we need to rebuild to get duplicates since the tree builder state is not cached
            // In a full implementation, we'd cache the tree builder state as well
            RecursiveFileTreeBuilder::new().get_duplicates_async().await
        } else {
            Err("No tree data available. Please scan a directory first.".to_string())
        }
    }

    pub async fn analyze_disk_usage_async(
        &self,
        folder_name: String,
    ) -> Result<Vec<crate::types::DiskEntry>, String> {
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
        *self.last_ignore_patterns.lock().unwrap() = Vec::new();
    }
}
