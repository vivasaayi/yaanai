#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

extern crate yaanaiapp;

use std::sync::Arc;
use yaanaiapp::db::Database;
use yaanaiapp::file_manager::FileManager;
use yaanaiapp::types::DiskEntry;
use yaanaiapp::ignore_matcher::IgnoreMatcher;
use yaanaiapp::duplicate_detector;
use yaanaiapp::searcher;
use yaanaiapp::file_operations;
use yaanaiapp::exporter;

// --- App State ---

struct AppState {
    file_manager: FileManager,
    db: Arc<Database>,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let db = Database::new()?;
        Ok(Self {
            file_manager: FileManager::new(),
            db: Arc::new(db),
        })
    }

    fn get_ignore_matcher(&self) -> IgnoreMatcher {
        match self.db.get_ignore_pattern_strings() {
            Ok(patterns) => IgnoreMatcher::new(patterns),
            Err(_) => IgnoreMatcher::empty(),
        }
    }
}

// --- Original Commands ---

#[tauri::command]
fn welcome(name: &str) -> String {
    format!("Hello {}! Welcome to Yaanai File Manager!", name)
}

#[tauri::command]
fn recursively_list_files(folder_name: &str) -> Vec<DiskEntry> {
    let mut vec: Vec<DiskEntry> = vec![];
    yaanaiapp::recursively_list_files_de(folder_name, &mut vec, false, true);
    vec
}

#[tauri::command]
async fn analyze_disk_usage(
    folder_name: &str,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiskEntry>, String> {
    state.file_manager.analyze_disk_usage_async(folder_name.to_string()).await
}

#[tauri::command]
async fn get_file_tree(
    folder_name: &str,
    state: tauri::State<'_, AppState>,
) -> Result<yaanaiapp::recursive_tree_builder::TreeNode, String> {
    state.file_manager.get_file_tree_async(folder_name.to_string()).await
}

#[tauri::command]
async fn get_file_tree_with_progress(
    folder_name: &str,
    _window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<yaanaiapp::recursive_tree_builder::TreeNode, String> {
    // Build tree (progress events will be re-enabled with Tauri 2.x event refactor)
    state.file_manager.get_file_tree_async(folder_name.to_string()).await
}

#[tauri::command]
async fn get_files_map(
    folder_name: &str,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<yaanaiapp::recursive_tree_builder::TreeNode>, String> {
    state.file_manager.get_file_tree_async(folder_name.to_string()).await?;
    state.file_manager.get_duplicates_async().await
}

#[tauri::command]
fn get_home_directory() -> String {
    std::env::var("HOME")
        .unwrap_or_else(|_| std::env::var("USERPROFILE").unwrap_or_else(|_| "/".to_string()))
}

// --- Duplicate Detection ---

#[tauri::command]
async fn find_true_duplicates(
    folder_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<duplicate_detector::DuplicateScanResult, String> {
    let ignore_matcher = state.get_ignore_matcher();
    let folder = folder_name.clone();

    tokio::task::spawn_blocking(move || {
        duplicate_detector::find_duplicates(&folder, &ignore_matcher)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// --- File Search ---

#[tauri::command]
async fn search_files(
    folder_name: String,
    pattern: String,
    recursive: bool,
    extensions: Option<Vec<String>>,
    min_size: Option<u64>,
    max_size: Option<u64>,
    state: tauri::State<'_, AppState>,
) -> Result<searcher::SearchSummary, String> {
    let ignore_matcher = state.get_ignore_matcher();
    let query = searcher::SearchQuery {
        pattern,
        recursive,
        extensions,
        min_size,
        max_size,
        include_dirs: false,
    };

    tokio::task::spawn_blocking(move || {
        searcher::search_files(&folder_name, &query, &ignore_matcher)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// --- File Operations ---

#[tauri::command]
async fn delete_files(
    paths: Vec<String>,
    use_trash: bool,
) -> Result<file_operations::DeleteResult, String> {
    tokio::task::spawn_blocking(move || {
        if use_trash {
            file_operations::delete_to_trash(paths)
        } else {
            file_operations::delete_permanent(paths)
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
fn get_files_info(paths: Vec<String>) -> Vec<file_operations::FileInfo> {
    file_operations::get_files_info(&paths)
}

// --- Export ---

#[tauri::command]
async fn export_report(
    format: String,
    report_type: String,
    file_path: String,
    folder_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let content = match report_type.as_str() {
        "tree" => {
            let tree = state.file_manager.get_file_tree_async(folder_name).await?;
            match format.as_str() {
                "json" => exporter::export_tree_json(&tree)?,
                "csv" => exporter::export_tree_csv(&tree)?,
                _ => return Err("Unsupported format. Use 'json' or 'csv'.".to_string()),
            }
        }
        "duplicates" => {
            let ignore_matcher = state.get_ignore_matcher();
            let folder = folder_name.clone();
            let result = tokio::task::spawn_blocking(move || {
                duplicate_detector::find_duplicates(&folder, &ignore_matcher)
            })
            .await
            .map_err(|e| format!("Task failed: {}", e))??;

            match format.as_str() {
                "json" => exporter::export_duplicates_json(&result)?,
                "csv" => exporter::export_duplicates_csv(&result)?,
                _ => return Err("Unsupported format. Use 'json' or 'csv'.".to_string()),
            }
        }
        "disk_usage" => {
            let entries = state.file_manager.analyze_disk_usage_async(folder_name).await?;
            match format.as_str() {
                "json" => exporter::export_disk_usage_json(&entries)?,
                "csv" => exporter::export_disk_usage_csv(&entries)?,
                _ => return Err("Unsupported format. Use 'json' or 'csv'.".to_string()),
            }
        }
        _ => return Err("Unsupported report type. Use 'tree', 'duplicates', or 'disk_usage'.".to_string()),
    };

    exporter::write_export_to_file(&file_path, &content)?;
    Ok(file_path)
}

// --- Favorites ---

#[tauri::command]
fn add_favorite(
    path: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<yaanaiapp::db::Favorite, String> {
    state.db.add_favorite(&path, &name)
}

#[tauri::command]
fn get_favorites(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<yaanaiapp::db::Favorite>, String> {
    state.db.get_favorites()
}

#[tauri::command]
fn remove_favorite(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.db.remove_favorite(&path)
}

// --- Ignore Patterns ---

#[tauri::command]
fn add_ignore_pattern(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<yaanaiapp::db::IgnorePattern, String> {
    state.db.add_ignore_pattern(&pattern)
}

#[tauri::command]
fn get_ignore_patterns(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<yaanaiapp::db::IgnorePattern>, String> {
    state.db.get_ignore_patterns()
}

#[tauri::command]
fn remove_ignore_pattern(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.db.remove_ignore_pattern(&pattern)
}

// --- Database Stats ---

#[tauri::command]
fn get_db_stats(
    state: tauri::State<'_, AppState>,
) -> Result<yaanaiapp::db::DbStats, String> {
    state.db.get_stats()
}

// --- Main ---

fn main() {
    let app_state = AppState::new().expect("Failed to initialize application state");

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Original commands
            welcome,
            recursively_list_files,
            analyze_disk_usage,
            get_file_tree,
            get_file_tree_with_progress,
            get_files_map,
            get_home_directory,
            // Duplicate detection
            find_true_duplicates,
            // File search
            search_files,
            // File operations
            delete_files,
            get_files_info,
            // Export
            export_report,
            // Favorites
            add_favorite,
            get_favorites,
            remove_favorite,
            // Ignore patterns
            add_ignore_pattern,
            get_ignore_patterns,
            remove_ignore_pattern,
            // Database
            get_db_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
