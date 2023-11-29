#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    yaanaiapp::public_format_name(name)
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
    let result = yaanaiapp::recursive_tree_builder::build_tree_using_recursion(folder_name);
    result
}

#[tauri::command]
fn welcome(name: &str) -> String {
    yaanaiapp::public_format_name(name)
}

extern crate yaanaiapp;

use yaanaiapp::types::DiskEntry;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, welcome,
            recursively_list_files, analyze_disk_usage,
            get_file_tree])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// TEST ds
