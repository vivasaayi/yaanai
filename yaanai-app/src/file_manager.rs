use crate::ignore_matcher::IgnoreMatcher;
use crate::recursive_tree_builder::RecursiveFileTreeBuilder;

/// Builds file trees on demand.
///
/// Scans always read the current filesystem state — no tree is cached between
/// calls. A user-initiated (re)scan must reflect files that were added or
/// removed on disk since the last scan, so caching the tree here would hand
/// back stale results (e.g. duplicates that were already deleted in Finder).
pub struct FileManager;

impl FileManager {
    pub fn new() -> Self {
        Self
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
        let tree_builder = RecursiveFileTreeBuilder::with_ignore_matcher(ignore_matcher);
        tree_builder.build_tree_async(folder_name).await
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
        let tree_builder = RecursiveFileTreeBuilder::with_ignore_matcher(ignore_matcher);
        tree_builder
            .build_tree_with_progress_async(folder_name, progress_tx)
            .await
    }

    pub async fn analyze_disk_usage_async(
        &self,
        folder_name: String,
    ) -> Result<Vec<crate::types::DiskEntry>, String> {
        Ok(crate::analyze_disk_usage(folder_name))
    }
}
