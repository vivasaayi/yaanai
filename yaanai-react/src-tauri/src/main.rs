#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]



// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn welcome(name: &str, state: tauri::State<FileManagerState>) -> String {
    &state.file_manager.get_stats();

    let mut message = String::new();
    message.push_str("Hello");
    message.push_str(name);
    message.push_str("! Welcome to the File Manager!");
    message
}

#[tauri::command]
fn recursively_list_files(folder_name: &str) -> Vec<DiskEntry> {
    let mut vec:Vec<DiskEntry> = vec![];
    yaanaiapp::recursively_list_files_de(folder_name, &mut vec, false, true);
    vec.to_vec()
}

#[tauri::command]
fn analyze_disk_usage(folder_name: &str) -> Vec<DiskEntry> {
    let result = yaanaiapp::analyze_disk_usage(folder_name.to_string());
    result
}

#[tauri::command]
fn get_file_tree(folder_name: &str) -> yaanaiapp::recursive_tree_builder::TreeNode {
    let mut file_tree_builder = yaanaiapp::recursive_tree_builder::RecursiveFileTreeBuilder::new();
    file_tree_builder.start_bg_thread();
    // file_tree_builder.build_tree_using_recursion(folder_name);
    file_tree_builder.root_node
}

#[tauri::command]
fn get_files_map(folder_name: &str) -> Vec<yaanaiapp::recursive_tree_builder::TreeNode> {
    let mut file_tree_builder = yaanaiapp::recursive_tree_builder::RecursiveFileTreeBuilder::new();
    file_tree_builder.build_tree_using_recursion(folder_name);
    file_tree_builder.get_duplicate_files()
}

extern crate yaanaiapp;

use std::sync::Mutex;
use yaanaiapp::file_manager::FileManager;
use yaanaiapp::types::DiskEntry;

struct FileManagerState {
    file_manager:FileManager
}

impl FileManagerState {
    pub fn new() -> Self {
        Self{
            file_manager:FileManager::new()
        }
    }
    pub fn init(&mut self) {
        self.file_manager.init()
    }

    pub fn get_stats(&mut self) {
        self.file_manager.get_stats()
    }
}

fn main() {
    let mut file_manager_state = FileManagerState::new();
    file_manager_state.init();

    tauri::Builder::default()
        .manage(file_manager_state)
        .invoke_handler(tauri::generate_handler![welcome,
            recursively_list_files, analyze_disk_usage,
            get_file_tree, get_files_map])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//ds
