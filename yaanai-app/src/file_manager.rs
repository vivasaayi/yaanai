


pub  struct FileManager  {
    recursive_file_tree_builder: crate::recursive_tree_builder::RecursiveFileTreeBuilder
}

impl FileManager {
    pub fn new() -> Self {
        Self{
            recursive_file_tree_builder: crate::recursive_tree_builder::RecursiveFileTreeBuilder::new()
        }
    }

    pub fn init(&mut self) {
        println!("Initializing the File Manager");
        self.recursive_file_tree_builder.start_bg_thread();
    }

    pub fn get_stats(&self) {
        println!("Getting Stats");
    }
}