use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use rayon::prelude::*;

use crate::ignore_matcher::IgnoreMatcher;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub size_h: String,
    pub files: Vec<DuplicateFile>,
    pub wasted_space: u64,
    pub wasted_space_h: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub size_h: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanResult {
    pub groups: Vec<DuplicateGroup>,
    pub total_files_scanned: u64,
    pub total_duplicates: u64,
    pub total_wasted_space: u64,
    pub total_wasted_space_h: String,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanProgress {
    pub phase: String, // "scanning", "grouping", "hashing"
    pub current_file: String,
    pub files_processed: u64,
    pub total_candidates: u64,
    pub groups_found: u64,
}

/// Progress callback for reporting hashing progress
pub type ProgressCallback = Arc<Mutex<Box<dyn Fn(DuplicateScanProgress) + Send>>>;

/// Find true duplicate files using SHA256 content hashing with optimizations:
/// 1. Size-based pre-filtering (fast)
/// 2. Parallel hashing using rayon (multi-core)
/// 3. Optional progress reporting
pub fn find_duplicates(
    folder: &str,
    ignore_matcher: &IgnoreMatcher,
) -> Result<DuplicateScanResult, String> {
    find_duplicates_with_progress(folder, ignore_matcher, None)
}

pub fn find_duplicates_with_progress(
    folder: &str,
    ignore_matcher: &IgnoreMatcher,
    progress_cb: Option<ProgressCallback>,
) -> Result<DuplicateScanResult, String> {
    let mut errors: Vec<String> = Vec::new();
    let mut files_by_size: HashMap<u64, Vec<(String, String)>> = HashMap::new();
    let mut total_scanned: u64 = 0;

    // Phase 1: Collect all files grouped by size
    collect_files_by_size(
        Path::new(folder),
        &mut files_by_size,
        &mut total_scanned,
        &mut errors,
        ignore_matcher,
    );

    // Report phase 1 progress
    if let Some(cb) = &progress_cb {
        if let Ok(callback) = cb.lock() {
            callback(DuplicateScanProgress {
                phase: "grouping".to_string(),
                current_file: String::new(),
                files_processed: total_scanned,
                total_candidates: files_by_size.values().map(|v| v.len()).sum::<usize>() as u64,
                groups_found: 0,
            });
        }
    }

    // Phase 2: Filter to only sizes with multiple files (potential duplicates)
    let candidates: HashMap<u64, Vec<(String, String)>> = files_by_size
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .collect();

    let total_candidates: u64 = candidates.values().map(|v| v.len()).sum::<usize>() as u64;

    // Phase 3: Hash files within each size group (using parallel hashing)
    let mut duplicate_groups: Vec<DuplicateGroup> = Vec::new();
    let mut total_duplicates: u64 = 0;
    let mut total_wasted: u64 = 0;
    let mut files_processed: u64 = 0;

    for (size, files) in candidates {
        // Hash files in parallel using rayon
        let hash_results: Vec<(String, String, Result<String, String>)> = files
            .par_iter()
            .map(|(path, name)| (path.clone(), name.clone(), hash_file(path)))
            .collect();

        let mut hash_groups: HashMap<String, Vec<(String, String)>> = HashMap::new();

        for (path, name, hash_result) in hash_results {
            files_processed += 1;

            match hash_result {
                Ok(hash) => {
                    hash_groups
                        .entry(hash)
                        .or_insert_with(Vec::new)
                        .push((path.clone(), name.clone()));
                }
                Err(e) => {
                    errors.push(format!("Failed to hash {}: {}", path, e));
                }
            }

            // Report progress every 10 files
            if files_processed % 10 == 0 {
                if let Some(cb) = &progress_cb {
                    if let Ok(mut callback) = cb.lock() {
                        callback(DuplicateScanProgress {
                            phase: "hashing".to_string(),
                            current_file: path,
                            files_processed,
                            total_candidates,
                            groups_found: hash_groups.values().filter(|g| g.len() > 1).count() as u64,
                        });
                    }
                }
            }
        }

        for (hash, group_files) in hash_groups {
            if group_files.len() > 1 {
                let wasted = size * (group_files.len() as u64 - 1);
                total_wasted += wasted;
                total_duplicates += group_files.len() as u64 - 1;

                duplicate_groups.push(DuplicateGroup {
                    hash,
                    size,
                    size_h: bytesize::ByteSize::b(size).to_string(),
                    wasted_space: wasted,
                    wasted_space_h: bytesize::ByteSize::b(wasted).to_string(),
                    files: group_files
                        .into_iter()
                        .map(|(path, name)| DuplicateFile {
                            path,
                            name,
                            size,
                            size_h: bytesize::ByteSize::b(size).to_string(),
                        })
                        .collect(),
                });
            }
        }
    }

    // Final progress report
    if let Some(cb) = &progress_cb {
        if let Ok(callback) = cb.lock() {
            callback(DuplicateScanProgress {
                phase: "complete".to_string(),
                current_file: String::new(),
                files_processed,
                total_candidates,
                groups_found: duplicate_groups.len() as u64,
            });
        }
    }

    // Sort by wasted space descending
    duplicate_groups.sort_by(|a, b| b.wasted_space.cmp(&a.wasted_space));

    Ok(DuplicateScanResult {
        groups: duplicate_groups,
        total_files_scanned: total_scanned,
        total_duplicates,
        total_wasted_space: total_wasted,
        total_wasted_space_h: bytesize::ByteSize::b(total_wasted).to_string(),
        errors,
    })
}

fn collect_files_by_size(
    dir: &Path,
    files_by_size: &mut HashMap<u64, Vec<(String, String)>>,
    total_scanned: &mut u64,
    errors: &mut Vec<String>,
    ignore_matcher: &IgnoreMatcher,
) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            errors.push(format!("Cannot read {}: {}", dir.display(), e));
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("Entry error in {}: {}", dir.display(), e));
                continue;
            }
        };

        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();

        if ignore_matcher.should_ignore(&path_str) {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                errors.push(format!("Metadata error for {}: {}", path_str, e));
                continue;
            }
        };

        if metadata.is_dir() {
            collect_files_by_size(&path, files_by_size, total_scanned, errors, ignore_matcher);
        } else if metadata.is_file() && metadata.len() > 0 {
            *total_scanned += 1;
            let name = entry.file_name().to_string_lossy().to_string();
            files_by_size
                .entry(metadata.len())
                .or_insert_with(Vec::new)
                .push((path_str, name));
        }
    }
}

/// Hash a file's content using SHA256
fn hash_file(path: &str) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|e| format!("Cannot open file: {}", e))?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536]; // 64KB buffer for faster reading

    loop {
        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("Read error: {}", e))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}
