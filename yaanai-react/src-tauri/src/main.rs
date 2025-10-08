#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]



// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn welcome(name: &str, state: tauri::State<FileManagerState>) -> String {
    let _ = &state.file_manager.get_stats();

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
async fn get_file_tree(folder_name: &str, state: tauri::State<'_, FileManagerState>) -> Result<yaanaiapp::recursive_tree_builder::TreeNode, String> {
    state.file_manager.get_file_tree_async(folder_name.to_string()).await
}

#[tauri::command]
async fn get_file_tree_with_progress(folder_name: &str, window: tauri::Window, state: tauri::State<'_, FileManagerState>) -> Result<yaanaiapp::recursive_tree_builder::TreeNode, String> {
    // Create a progress channel
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::channel(100);
    
    // Spawn a task to handle progress updates
    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            // Emit progress event to frontend
            let _ = window_clone.emit("tree-build-progress", progress);
        }
    });
    
    // Build tree with progress
    state.file_manager.get_file_tree_with_progress_async(folder_name.to_string(), progress_tx).await
}

#[tauri::command]
async fn get_files_map(folder_name: &str, state: tauri::State<'_, FileManagerState>) -> Result<Vec<yaanaiapp::recursive_tree_builder::TreeNode>, String> {
    // First build the tree
    state.file_manager.get_file_tree_async(folder_name.to_string()).await?;
    // Then get duplicates
    state.file_manager.get_duplicates_async().await
}

#[tauri::command]
fn get_home_directory() -> String {
    std::env::var("HOME").unwrap_or_else(|_| std::env::var("USERPROFILE").unwrap_or_else(|_| "/".to_string()))
}

extern crate yaanaiapp;

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

#[tokio::main]
async fn main() {
    let mut file_manager_state = FileManagerState::new();
    file_manager_state.init();

    tauri::Builder::default()
        .manage(file_manager_state)
        .invoke_handler(tauri::generate_handler![welcome,
            recursively_list_files, analyze_disk_usage,
            get_file_tree, get_file_tree_with_progress, get_files_map, get_home_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//
