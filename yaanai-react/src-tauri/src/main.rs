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
    yaanaiapp::recursively_list_files(folder_name, &mut vec)
}

#[tauri::command]
fn welcome(name: &str) -> String {
    yaanaiapp::public_format_name(name)
}

extern crate yaanaiapp;
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, welcome, fetch_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// TEST 1234dsdsdasdsdssdsddssadsdsds
