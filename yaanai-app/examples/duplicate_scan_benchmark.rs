use std::env;
use std::sync::{Arc, Mutex};

use yaanaiapp::db::Database;
use yaanaiapp::duplicate_detector::{self, DuplicateScanProgress, ProgressCallback};
use yaanaiapp::ignore_matcher::IgnoreMatcher;

fn main() -> Result<(), String> {
    let folder = env::args()
        .nth(1)
        .ok_or_else(|| "Usage: cargo run --example duplicate_scan_benchmark -- <folder> [runs]".to_string())?;
    let runs = env::args()
        .nth(2)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(2)
        .max(1);

    let db = Arc::new(Database::new()?);
    let ignore_matcher = match db.get_ignore_pattern_strings() {
        Ok(patterns) => IgnoreMatcher::new(patterns),
        Err(_) => IgnoreMatcher::empty(),
    };

    for run in 1..=runs {
        println!("\n== Duplicate scan run {} ==", run);
        println!("Path: {}", folder);

        let progress_cb: ProgressCallback = Arc::new(Mutex::new(Box::new(|progress: DuplicateScanProgress| {
            match progress.phase.as_str() {
                "grouping" => {
                    println!(
                        "Grouping complete: {} scanned files, {} candidates",
                        progress.files_processed,
                        progress.total_candidates
                    );
                }
                "hashing" => {
                    if progress.files_processed % 250 == 0 || progress.files_processed == progress.total_candidates {
                        println!(
                            "Hashing: {}/{} candidates, {} hashed, {} cache hits",
                            progress.files_processed,
                            progress.total_candidates,
                            progress.files_hashed,
                            progress.cached_hashes_reused
                        );
                    }
                }
                "complete" => {
                    println!(
                        "Complete: {} hashed, {} cache hits, {} groups",
                        progress.files_hashed,
                        progress.cached_hashes_reused,
                        progress.groups_found
                    );
                }
                _ => {}
            }
        }) as Box<dyn Fn(DuplicateScanProgress) + Send>));

        let result = duplicate_detector::find_duplicates_with_progress(
            &folder,
            &ignore_matcher,
            Some(progress_cb),
            Some(db.clone()),
            None,
        )?;

        println!("Duration: {:.2}s", result.duration_ms as f64 / 1000.0);
        println!("Files scanned: {}", result.total_files_scanned);
        println!("Files hashed: {}", result.files_hashed);
        println!("Cache hits: {}", result.cached_hashes_reused);
        println!("Duplicate groups: {}", result.groups.len());
        println!("Duplicate files: {}", result.total_duplicates);
        println!("Wasted space: {}", result.total_wasted_space_h);
        if !result.errors.is_empty() {
            println!("Errors: {}", result.errors.len());
        }
    }

    Ok(())
}