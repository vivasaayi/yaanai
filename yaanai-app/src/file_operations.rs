use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteResult {
    pub deleted: Vec<String>,
    pub failed: Vec<DeleteError>,
    pub total_size_freed: u64,
    pub total_size_freed_h: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteError {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub size_h: String,
    pub is_dir: bool,
}

/// Move files to the system trash (recoverable).
pub fn delete_to_trash(paths: Vec<String>) -> Result<DeleteResult, String> {
    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    let mut total_freed: u64 = 0;

    for path_str in paths {
        let path = Path::new(&path_str);

        // Get size before deletion
        let size = if path.is_file() {
            fs::metadata(path).map(|m| m.len()).unwrap_or(0)
        } else if path.is_dir() {
            dir_size(path)
        } else {
            0
        };

        match trash::delete(path) {
            Ok(_) => {
                total_freed += size;
                deleted.push(path_str);
            }
            Err(e) => {
                failed.push(DeleteError {
                    path: path_str,
                    error: format!("{}", e),
                });
            }
        }
    }

    Ok(DeleteResult {
        deleted,
        failed,
        total_size_freed: total_freed,
        total_size_freed_h: bytesize::ByteSize::b(total_freed).to_string(),
    })
}

/// Permanently delete files (not recoverable).
pub fn delete_permanent(paths: Vec<String>) -> Result<DeleteResult, String> {
    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    let mut total_freed: u64 = 0;

    for path_str in paths {
        let path = Path::new(&path_str);

        let size = if path.is_file() {
            fs::metadata(path).map(|m| m.len()).unwrap_or(0)
        } else if path.is_dir() {
            dir_size(path)
        } else {
            0
        };

        let result = if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };

        match result {
            Ok(_) => {
                total_freed += size;
                deleted.push(path_str);
            }
            Err(e) => {
                failed.push(DeleteError {
                    path: path_str,
                    error: format!("{}", e),
                });
            }
        }
    }

    Ok(DeleteResult {
        deleted,
        failed,
        total_size_freed: total_freed,
        total_size_freed_h: bytesize::ByteSize::b(total_freed).to_string(),
    })
}

/// Get file info for a list of paths (used for confirmation dialogs).
pub fn get_files_info(paths: &[String]) -> Vec<FileInfo> {
    paths
        .iter()
        .filter_map(|path_str| {
            let path = Path::new(path_str);
            let metadata = fs::metadata(path).ok()?;
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let size = if metadata.is_dir() {
                dir_size(path)
            } else {
                metadata.len()
            };

            Some(FileInfo {
                path: path_str.clone(),
                name,
                size,
                size_h: bytesize::ByteSize::b(size).to_string(),
                is_dir: metadata.is_dir(),
            })
        })
        .collect()
}

fn dir_size(path: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                total += dir_size(&entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    total
}
