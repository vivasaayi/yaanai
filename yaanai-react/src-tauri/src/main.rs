#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

extern crate yaanaiapp;

use serde::Serialize;
use std::process::Command;
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use std::{fs, path::Path};
use tauri::Emitter;
use yaanaiapp::db::Database;
use yaanaiapp::exporter;
use yaanaiapp::file_manager::FileManager;
use yaanaiapp::file_operations;
use yaanaiapp::ignore_matcher::IgnoreMatcher;
use yaanaiapp::recursive_tree_builder::{NodeType, TreeBuildProgress, TreeNode};
use yaanaiapp::searcher;
use yaanaiapp::types::DiskEntry;

// --- App State ---

struct AppState {
    file_manager: FileManager,
    db: Arc<Database>,
}

#[derive(Debug, Clone, Serialize)]
struct StaleCheckResult {
    stale: bool,
    changed_path: Option<String>,
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
    state
        .file_manager
        .analyze_disk_usage_async(folder_name.to_string())
        .await
}

#[tauri::command]
async fn get_file_tree(
    folder_name: &str,
    state: tauri::State<'_, AppState>,
) -> Result<TreeNode, String> {
    let ignore_matcher = state.get_ignore_matcher();
    state
        .file_manager
        .get_file_tree_with_ignore_async(folder_name.to_string(), ignore_matcher)
        .await
}

#[tauri::command]
async fn get_file_tree_with_progress(
    folder_name: &str,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<TreeNode, String> {
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::channel::<TreeBuildProgress>(64);
    let progress_window = window.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            let _ = progress_window.emit("tree-build-progress", &progress);
        }
    });

    let ignore_matcher = state.get_ignore_matcher();
    let tree = state
        .file_manager
        .get_file_tree_with_progress_and_ignore_async(
            folder_name.to_string(),
            progress_tx,
            ignore_matcher,
        )
        .await?;

    let (file_count, dir_count, total_size) = summarize_tree(&tree);
    let _ = state.db.save_scan_record(
        folder_name,
        file_count.min(i64::MAX as u64) as i64,
        dir_count.min(i64::MAX as u64) as i64,
        total_size.min(i64::MAX as u64) as i64,
    );

    let _ = window.emit(
        "tree-build-progress",
        &TreeBuildProgress {
            current_path: folder_name.to_string(),
            files_processed: file_count,
            directories_processed: dir_count,
            total_size_bytes: total_size,
            partial_tree: None,
            errors: Vec::new(),
        },
    );

    Ok(tree)
}

#[tauri::command]
fn get_home_directory() -> String {
    std::env::var("HOME")
        .unwrap_or_else(|_| std::env::var("USERPROFILE").unwrap_or_else(|_| "/".to_string()))
}

fn summarize_tree(tree: &TreeNode) -> (u64, u64, u64) {
    fn walk(node: &TreeNode, files: &mut u64, dirs: &mut u64) {
        match &node.node_type {
            NodeType::File => *files += 1,
            NodeType::Directory => *dirs += 1,
            NodeType::Empty => {}
        }

        for child in &node.children {
            walk(child, files, dirs);
        }
    }

    let mut files = 0;
    let mut dirs = 0;
    walk(tree, &mut files, &mut dirs);
    (files, dirs, tree.disk_entry.size)
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

#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let trimmed_path = path.trim();
    if trimmed_path.is_empty() {
        return Err("Path is required".to_string());
    }

    let target = Path::new(trimmed_path);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", trimmed_path));
    }

    let status = reveal_path(target, trimmed_path)?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("File manager exited with status: {}", status))
    }
}

#[cfg(target_os = "macos")]
fn reveal_path(_target: &Path, path: &str) -> Result<std::process::ExitStatus, String> {
    Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))
}

#[cfg(target_os = "windows")]
fn reveal_path(_target: &Path, path: &str) -> Result<std::process::ExitStatus, String> {
    Command::new("explorer")
        .arg(format!("/select,{}", path))
        .status()
        .map_err(|e| format!("Failed to reveal in Explorer: {}", e))
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn reveal_path(target: &Path, _path: &str) -> Result<std::process::ExitStatus, String> {
    let open_target = if target.is_dir() {
        target
    } else {
        target.parent().unwrap_or(target)
    };

    Command::new("xdg-open")
        .arg(open_target)
        .status()
        .map_err(|e| format!("Failed to open file manager: {}", e))
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
            let ignore_matcher = state.get_ignore_matcher();
            let tree = state
                .file_manager
                .get_file_tree_with_ignore_async(folder_name, ignore_matcher)
                .await?;
            match format.as_str() {
                "json" => exporter::export_tree_json(&tree)?,
                "csv" => exporter::export_tree_csv(&tree)?,
                _ => return Err("Unsupported format. Use 'json' or 'csv'.".to_string()),
            }
        }
        "disk_usage" => {
            let entries = state
                .file_manager
                .analyze_disk_usage_async(folder_name)
                .await?;
            match format.as_str() {
                "json" => exporter::export_disk_usage_json(&entries)?,
                "csv" => exporter::export_disk_usage_csv(&entries)?,
                _ => return Err("Unsupported format. Use 'json' or 'csv'.".to_string()),
            }
        }
        _ => return Err("Unsupported report type. Use 'tree' or 'disk_usage'.".to_string()),
    };

    exporter::write_export_to_file(&file_path, &content)?;
    Ok(file_path)
}

#[tauri::command]
fn export_tree_snapshot(
    format: String,
    file_path: String,
    tree: TreeNode,
) -> Result<String, String> {
    let content = match format.as_str() {
        "json" => exporter::export_tree_json(&tree)?,
        "csv" => exporter::export_tree_csv(&tree)?,
        _ => return Err("Unsupported format. Use 'json' or 'csv'.".to_string()),
    };

    exporter::write_export_to_file(&file_path, &content)?;
    Ok(file_path)
}

#[tauri::command]
fn export_metadata_duplicate_result(
    format: String,
    file_path: String,
    result: serde_json::Value,
) -> Result<String, String> {
    let content = match format.as_str() {
        "json" => exporter::export_metadata_duplicates_json(&result)?,
        "csv" => exporter::export_metadata_duplicates_csv(&result)?,
        _ => return Err("Unsupported format. Use 'json' or 'csv'.".to_string()),
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
fn remove_favorite(path: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
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
fn remove_ignore_pattern(pattern: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.remove_ignore_pattern(&pattern)
}

// --- Database Stats ---

#[tauri::command]
fn get_db_stats(state: tauri::State<'_, AppState>) -> Result<yaanaiapp::db::DbStats, String> {
    state.db.get_stats()
}

#[tauri::command]
async fn check_path_stale(
    path: String,
    since_unix_secs: i64,
    state: tauri::State<'_, AppState>,
) -> Result<StaleCheckResult, String> {
    let ignore_matcher = state.get_ignore_matcher();

    tokio::task::spawn_blocking(move || {
        let changed_path = detect_stale_path(Path::new(&path), since_unix_secs, &ignore_matcher)?;
        Ok(StaleCheckResult {
            stale: changed_path.is_some(),
            changed_path,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

fn detect_stale_path(
    path: &Path,
    since_unix_secs: i64,
    ignore_matcher: &IgnoreMatcher,
) -> Result<Option<String>, String> {
    let path_str = path.to_string_lossy().to_string();
    if ignore_matcher.should_ignore(&path_str) {
        return Ok(None);
    }

    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default();

    if modified_at > since_unix_secs {
        return Ok(Some(path_str));
    }

    if metadata.is_dir() {
        let entries = fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;

        for entry in entries {
            let entry =
                entry.map_err(|e| format!("Directory entry error in {}: {}", path.display(), e))?;
            if let Some(changed_path) =
                detect_stale_path(&entry.path(), since_unix_secs, ignore_matcher)?
            {
                return Ok(Some(changed_path));
            }
        }
    }

    Ok(None)
}

// --- Main ---

fn main() {
    let app_state = AppState::new().expect("Failed to initialize application state");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Original commands
            welcome,
            recursively_list_files,
            analyze_disk_usage,
            get_file_tree,
            get_file_tree_with_progress,
            get_home_directory,
            // File search
            search_files,
            // File operations
            delete_files,
            get_files_info,
            reveal_in_file_manager,
            // Export
            export_report,
            export_tree_snapshot,
            export_metadata_duplicate_result,
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
            check_path_stale,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
