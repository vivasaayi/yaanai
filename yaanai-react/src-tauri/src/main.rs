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
fn fetch_files(folder_name: &str) -> Vec<String> {
    let mut vec:Vec<String> = vec![];
    yaanaiapp::fetch_files(folder_name, &mut vec);
    vec.to_vec()
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
fn welcome(name: &str) -> String {
    yaanaiapp::public_format_name(name)
}

extern crate yaanaiapp;

use yaanaiapp::DiskEntry;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, welcome,
            fetch_files, recursively_list_files, analyze_disk_usage])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// TEST ggdssdsd
