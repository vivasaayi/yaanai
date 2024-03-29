use std::backtrace::BacktraceStatus::Disabled;
use std::io::Error;
use std::fs::{DirEntry, Metadata, ReadDir};
use std::os::macos::fs::MetadataExt;
use serde::{Deserialize, Serialize};
use crate::types::DiskEntry;

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
    pub root_node:TreeNode,
    pub tree_builder_errors:Vec<String>
}

impl RecursiveFileTreeBuilder {
    pub fn new() -> Self {
        return RecursiveFileTreeBuilder {
            root_node: TreeNode::new(),
            tree_builder_errors: vec![]
        }
    }

    pub fn build_tree_using_recursion(&mut self, name: &str){
        let mut tree_node = TreeNode::new();
        tree_node.node_type = NodeType::Directory;

        self.recursively_build_file_tree(name, &mut tree_node);

        self.root_node = tree_node;
    }

    pub fn recursively_build_file_tree<'a>(&mut self, name: &'a str, parent_node: &'a mut TreeNode) {
        println!("Getting files in folder:{}", name);

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
            }

            parent_node.disk_entry.calculate_human_size();
            parent_node.children.push(child_tree_node);
        }
    }
}