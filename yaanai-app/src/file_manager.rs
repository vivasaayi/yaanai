


use crate::recursive_tree_builder::RecursiveFileTreeBuilder;

pub struct FileManager {
    tree_builder: RecursiveFileTreeBuilder,
}

impl FileManager {
    pub fn new() -> Self {
        Self {
            tree_builder: RecursiveFileTreeBuilder::new()
        }
    }

    pub fn init(&mut self) {
        println!("Initializing the File Manager with async tree builder");
    }

    pub fn get_stats(&self) {
        println!("Getting Stats");
    }

    pub async fn get_file_tree_async(&self, folder_name: String) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        self.tree_builder.build_tree_async(folder_name).await
    }

    pub async fn get_file_tree_with_progress_async(&self, folder_name: String, progress_tx: tokio::sync::mpsc::Sender<crate::recursive_tree_builder::TreeBuildProgress>) -> Result<crate::recursive_tree_builder::TreeNode, String> {
        self.tree_builder.build_tree_with_progress_async(folder_name, progress_tx).await
    }

    pub async fn get_duplicates_async(&self) -> Result<Vec<crate::recursive_tree_builder::TreeNode>, String> {
        self.tree_builder.get_duplicates_async().await
    }
}