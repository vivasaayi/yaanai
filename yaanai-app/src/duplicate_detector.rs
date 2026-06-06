use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, UNIX_EPOCH};

use crate::db::Database;
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
pub struct DuplicateCandidateInput {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanResult {
    pub groups: Vec<DuplicateGroup>,
    pub total_files_scanned: u64,
    pub total_duplicates: u64,
    pub total_wasted_space: u64,
    pub total_wasted_space_h: String,
    pub files_hashed: u64,
    pub cached_hashes_reused: u64,
    pub duration_ms: u64,
    pub cancelled: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanProgress {
    pub phase: String, // "scanning", "grouping", "hashing"
    pub current_file: String,
    pub files_processed: u64,
    pub total_candidates: u64,
    pub groups_found: u64,
    pub files_hashed: u64,
    pub cached_hashes_reused: u64,
    pub cancelled: bool,
}

/// Progress callback for reporting hashing progress
pub type ProgressCallback = Arc<Mutex<Box<dyn Fn(DuplicateScanProgress) + Send>>>;

#[derive(Debug, Clone)]
struct CandidateFile {
    path: String,
    name: String,
    size: u64,
    mtime: i64,
}

enum HashOutcome {
    Cached(String),
    Computed(String),
    Failed(String),
    Cancelled,
}

/// Find true duplicate files using SHA256 content hashing with optimizations:
/// 1. Size-based pre-filtering (fast)
/// 2. Parallel hashing using rayon (multi-core)
/// 3. Optional progress reporting
pub fn find_duplicates(
    folder: &str,
    ignore_matcher: &IgnoreMatcher,
) -> Result<DuplicateScanResult, String> {
    find_duplicates_with_progress(folder, ignore_matcher, None, None, None)
}

pub fn find_duplicates_with_progress(
    folder: &str,
    ignore_matcher: &IgnoreMatcher,
    progress_cb: Option<ProgressCallback>,
    db: Option<Arc<Database>>,
    cancel_flag: Option<Arc<AtomicBool>>,
) -> Result<DuplicateScanResult, String> {
    let started_at = Instant::now();
    let mut errors: Vec<String> = Vec::new();
    let mut files_by_size: HashMap<u64, Vec<CandidateFile>> = HashMap::new();
    let mut total_scanned: u64 = 0;

    // Phase 1: Collect all files grouped by size
    collect_files_by_size(
        Path::new(folder),
        &mut files_by_size,
        &mut total_scanned,
        &mut errors,
        ignore_matcher,
        &progress_cb,
        &cancel_flag,
    );

    process_candidate_groups(
        files_by_size,
        Some(folder),
        total_scanned,
        errors,
        started_at,
        progress_cb,
        db,
        cancel_flag,
    )
}

/// Find duplicates from an already-built central file-system snapshot.
///
/// The snapshot supplies the candidate list, so this path does not walk the
/// directory tree again. It still checks current metadata before hashing so
/// stale/deleted files are reported instead of blindly trusting old state.
pub fn find_duplicates_from_candidates_with_progress(
    files: Vec<DuplicateCandidateInput>,
    progress_cb: Option<ProgressCallback>,
    db: Option<Arc<Database>>,
    cancel_flag: Option<Arc<AtomicBool>>,
) -> Result<DuplicateScanResult, String> {
    let started_at = Instant::now();
    let mut errors: Vec<String> = Vec::new();
    let mut files_by_size: HashMap<u64, Vec<CandidateFile>> = HashMap::new();
    let mut total_scanned: u64 = 0;

    for file in files {
        if is_cancelled(&cancel_flag) {
            break;
        }

        let path = Path::new(&file.path);
        let metadata = match fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(e) => {
                errors.push(format!("Metadata error for {}: {}", file.path, e));
                continue;
            }
        };

        if !metadata.is_file() || metadata.len() == 0 {
            continue;
        }

        total_scanned += 1;
        let path_str = path.to_string_lossy().to_string();
        let name = if file.name.is_empty() {
            path.file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone())
        } else {
            file.name
        };
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or_default();

        files_by_size
            .entry(metadata.len())
            .or_insert_with(Vec::new)
            .push(CandidateFile {
                path: path_str.clone(),
                name,
                size: metadata.len(),
                mtime,
            });

        if total_scanned % 64 == 0 {
            emit_progress(
                &progress_cb,
                DuplicateScanProgress {
                    phase: "scanning".to_string(),
                    current_file: path_str,
                    files_processed: total_scanned,
                    total_candidates: 0,
                    groups_found: 0,
                    files_hashed: 0,
                    cached_hashes_reused: 0,
                    cancelled: false,
                },
            );
        }
    }

    process_candidate_groups(
        files_by_size,
        None,
        total_scanned,
        errors,
        started_at,
        progress_cb,
        db,
        cancel_flag,
    )
}

fn process_candidate_groups(
    files_by_size: HashMap<u64, Vec<CandidateFile>>,
    stale_root: Option<&str>,
    total_scanned: u64,
    mut errors: Vec<String>,
    started_at: Instant,
    progress_cb: Option<ProgressCallback>,
    db: Option<Arc<Database>>,
    cancel_flag: Option<Arc<AtomicBool>>,
) -> Result<DuplicateScanResult, String> {
    if is_cancelled(&cancel_flag) {
        emit_progress(
            &progress_cb,
            DuplicateScanProgress {
                phase: "cancelled".to_string(),
                current_file: String::new(),
                files_processed: total_scanned,
                total_candidates: 0,
                groups_found: 0,
                files_hashed: 0,
                cached_hashes_reused: 0,
                cancelled: true,
            },
        );

        return Ok(build_result(
            Vec::new(),
            total_scanned,
            0,
            0,
            0,
            0,
            true,
            errors,
            started_at.elapsed().as_millis() as u64,
        ));
    }

    // Report phase 1 progress
    emit_progress(
        &progress_cb,
        DuplicateScanProgress {
            phase: "grouping".to_string(),
            current_file: String::new(),
            files_processed: total_scanned,
            total_candidates: files_by_size.values().map(|v| v.len()).sum::<usize>() as u64,
            groups_found: 0,
            files_hashed: 0,
            cached_hashes_reused: 0,
            cancelled: false,
        },
    );

    // Phase 2: Filter to only sizes with multiple files (potential duplicates)
    let candidates: HashMap<u64, Vec<CandidateFile>> = files_by_size
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .collect();

    let total_candidates: u64 = candidates.values().map(|v| v.len()).sum::<usize>() as u64;
    let candidate_paths: Vec<String> = candidates
        .values()
        .flat_map(|files| files.iter().map(|file| file.path.clone()))
        .collect();
    let existing_paths: HashSet<String> = candidate_paths.iter().cloned().collect();
    let cached_hashes = match &db {
        Some(database) => database.get_file_hashes(&candidate_paths)?,
        None => HashMap::new(),
    };

    if let (Some(database), Some(root)) = (&db, stale_root) {
        let _ = database.remove_stale_file_hashes(root, &existing_paths);
    }

    // Phase 3: Hash files within each size group (using parallel hashing)
    let mut duplicate_groups: Vec<DuplicateGroup> = Vec::new();
    let mut total_duplicates: u64 = 0;
    let mut total_wasted: u64 = 0;
    let files_processed = Arc::new(AtomicU64::new(0));
    let files_hashed = Arc::new(AtomicU64::new(0));
    let cached_hashes_reused = Arc::new(AtomicU64::new(0));

    for (size, files) in candidates {
        if is_cancelled(&cancel_flag) {
            break;
        }

        let files_processed_counter = Arc::clone(&files_processed);
        let files_hashed_counter = Arc::clone(&files_hashed);
        let cache_hits_counter = Arc::clone(&cached_hashes_reused);
        let progress_cb_for_group = progress_cb.clone();
        let cancel_flag_for_group = cancel_flag.clone();
        let cached_hashes_ref = &cached_hashes;

        let hash_results: Vec<(CandidateFile, HashOutcome)> = files
            .par_iter()
            .map(|candidate| {
                if is_cancelled(&cancel_flag_for_group) {
                    return (candidate.clone(), HashOutcome::Cancelled);
                }

                let outcome = match cached_hashes_ref.get(&candidate.path) {
                    Some(record)
                        if record.size == candidate.size as i64
                            && record.mtime == candidate.mtime =>
                    {
                        cache_hits_counter.fetch_add(1, Ordering::Relaxed);
                        HashOutcome::Cached(record.hash.clone())
                    }
                    _ => match hash_file(&candidate.path) {
                        Ok(hash) => {
                            files_hashed_counter.fetch_add(1, Ordering::Relaxed);
                            HashOutcome::Computed(hash)
                        }
                        Err(error) => HashOutcome::Failed(error),
                    },
                };

                let processed = files_processed_counter.fetch_add(1, Ordering::Relaxed) + 1;
                if processed % 8 == 0 || processed == total_candidates {
                    emit_progress(
                        &progress_cb_for_group,
                        DuplicateScanProgress {
                            phase: "hashing".to_string(),
                            current_file: candidate.path.clone(),
                            files_processed: processed,
                            total_candidates,
                            groups_found: duplicate_groups.len() as u64,
                            files_hashed: files_hashed_counter.load(Ordering::Relaxed),
                            cached_hashes_reused: cache_hits_counter.load(Ordering::Relaxed),
                            cancelled: false,
                        },
                    );
                }

                (candidate.clone(), outcome)
            })
            .collect();

        let mut hash_groups: HashMap<String, Vec<(String, String)>> = HashMap::new();
        let mut cancelled = false;

        for (candidate, hash_result) in hash_results {
            match hash_result {
                HashOutcome::Cached(hash) => {
                    hash_groups
                        .entry(hash)
                        .or_insert_with(Vec::new)
                        .push((candidate.path.clone(), candidate.name.clone()));
                }
                HashOutcome::Computed(hash) => {
                    if let Some(database) = &db {
                        let _ = database.save_file_hash(
                            &candidate.path,
                            &hash,
                            candidate.size as i64,
                            candidate.mtime,
                        );
                    }

                    hash_groups
                        .entry(hash)
                        .or_insert_with(Vec::new)
                        .push((candidate.path.clone(), candidate.name.clone()));
                }
                HashOutcome::Failed(error) => {
                    errors.push(format!("Failed to hash {}: {}", candidate.path, error));
                }
                HashOutcome::Cancelled => {
                    cancelled = true;
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

        emit_progress(
            &progress_cb,
            DuplicateScanProgress {
                phase: if cancelled {
                    "cancelled".to_string()
                } else {
                    "hashing".to_string()
                },
                current_file: String::new(),
                files_processed: files_processed.load(Ordering::Relaxed),
                total_candidates,
                groups_found: duplicate_groups.len() as u64,
                files_hashed: files_hashed.load(Ordering::Relaxed),
                cached_hashes_reused: cached_hashes_reused.load(Ordering::Relaxed),
                cancelled,
            },
        );

        if cancelled {
            break;
        }
    }

    let cancelled = is_cancelled(&cancel_flag);

    // Final progress report
    emit_progress(
        &progress_cb,
        DuplicateScanProgress {
            phase: if cancelled {
                "cancelled".to_string()
            } else {
                "complete".to_string()
            },
            current_file: String::new(),
            files_processed: files_processed.load(Ordering::Relaxed),
            total_candidates,
            groups_found: duplicate_groups.len() as u64,
            files_hashed: files_hashed.load(Ordering::Relaxed),
            cached_hashes_reused: cached_hashes_reused.load(Ordering::Relaxed),
            cancelled,
        },
    );

    // Sort by wasted space descending
    duplicate_groups.sort_by(|a, b| b.wasted_space.cmp(&a.wasted_space));

    Ok(build_result(
        duplicate_groups,
        total_scanned,
        total_duplicates,
        total_wasted,
        files_hashed.load(Ordering::Relaxed),
        cached_hashes_reused.load(Ordering::Relaxed),
        cancelled,
        errors,
        started_at.elapsed().as_millis() as u64,
    ))
}

fn collect_files_by_size(
    dir: &Path,
    files_by_size: &mut HashMap<u64, Vec<CandidateFile>>,
    total_scanned: &mut u64,
    errors: &mut Vec<String>,
    ignore_matcher: &IgnoreMatcher,
    progress_cb: &Option<ProgressCallback>,
    cancel_flag: &Option<Arc<AtomicBool>>,
) {
    if is_cancelled(cancel_flag) {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            errors.push(format!("Cannot read {}: {}", dir.display(), e));
            return;
        }
    };

    for entry in entries {
        if is_cancelled(cancel_flag) {
            return;
        }

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
            collect_files_by_size(
                &path,
                files_by_size,
                total_scanned,
                errors,
                ignore_matcher,
                progress_cb,
                cancel_flag,
            );
        } else if metadata.is_file() && metadata.len() > 0 {
            *total_scanned += 1;
            let name = entry.file_name().to_string_lossy().to_string();
            let mtime = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs() as i64)
                .unwrap_or_default();
            files_by_size
                .entry(metadata.len())
                .or_insert_with(Vec::new)
                .push(CandidateFile {
                    path: path_str.clone(),
                    name,
                    size: metadata.len(),
                    mtime,
                });

            if *total_scanned % 64 == 0 {
                emit_progress(
                    progress_cb,
                    DuplicateScanProgress {
                        phase: "scanning".to_string(),
                        current_file: path_str,
                        files_processed: *total_scanned,
                        total_candidates: 0,
                        groups_found: 0,
                        files_hashed: 0,
                        cached_hashes_reused: 0,
                        cancelled: false,
                    },
                );
            }
        }
    }
}

fn emit_progress(progress_cb: &Option<ProgressCallback>, progress: DuplicateScanProgress) {
    if let Some(cb) = progress_cb {
        if let Ok(callback) = cb.lock() {
            callback(progress);
        }
    }
}

fn is_cancelled(cancel_flag: &Option<Arc<AtomicBool>>) -> bool {
    cancel_flag
        .as_ref()
        .map(|flag| flag.load(Ordering::Relaxed))
        .unwrap_or(false)
}

fn build_result(
    groups: Vec<DuplicateGroup>,
    total_files_scanned: u64,
    total_duplicates: u64,
    total_wasted_space: u64,
    files_hashed: u64,
    cached_hashes_reused: u64,
    cancelled: bool,
    errors: Vec<String>,
    duration_ms: u64,
) -> DuplicateScanResult {
    DuplicateScanResult {
        groups,
        total_files_scanned,
        total_duplicates,
        total_wasted_space,
        total_wasted_space_h: bytesize::ByteSize::b(total_wasted_space).to_string(),
        files_hashed,
        cached_hashes_reused,
        duration_ms,
        cancelled,
        errors,
    }
}

/// Hash a file's content using SHA256
fn hash_file(path: &str) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Cannot open file: {}", e))?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536]; // 64KB buffer for faster reading

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| format!("Read error: {}", e))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}
