use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::ignore_matcher::IgnoreMatcher;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub size_h: String,
    pub is_dir: bool,
    pub matched_on: String, // "name", "extension", "path"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub pattern: String,
    pub recursive: bool,
    pub extensions: Option<Vec<String>>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub include_dirs: bool,
}

impl Default for SearchQuery {
    fn default() -> Self {
        Self {
            pattern: String::new(),
            recursive: true,
            extensions: None,
            min_size: None,
            max_size: None,
            include_dirs: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchSummary {
    pub results: Vec<SearchResult>,
    pub total_matches: u64,
    pub files_searched: u64,
    pub errors: Vec<String>,
}

pub fn search_files(
    folder: &str,
    query: &SearchQuery,
    ignore_matcher: &IgnoreMatcher,
) -> Result<SearchSummary, String> {
    let mut results: Vec<SearchResult> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut files_searched: u64 = 0;

    let pattern_lower = query.pattern.to_lowercase();
    let regex_pattern = regex::Regex::new(&query.pattern);

    search_recursive(
        Path::new(folder),
        query,
        &pattern_lower,
        &regex_pattern,
        ignore_matcher,
        &mut results,
        &mut errors,
        &mut files_searched,
    );

    let total_matches = results.len() as u64;
    Ok(SearchSummary {
        results,
        total_matches,
        files_searched,
        errors,
    })
}

fn search_recursive(
    dir: &Path,
    query: &SearchQuery,
    pattern_lower: &str,
    regex_pattern: &Result<regex::Regex, regex::Error>,
    ignore_matcher: &IgnoreMatcher,
    results: &mut Vec<SearchResult>,
    errors: &mut Vec<String>,
    files_searched: &mut u64,
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
                errors.push(format!("Entry error: {}", e));
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

        let name = entry.file_name().to_string_lossy().to_string();
        let name_lower = name.to_lowercase();

        if metadata.is_dir() {
            // Check if directory name matches
            if query.include_dirs && matches_pattern(&name_lower, pattern_lower, regex_pattern) {
                results.push(SearchResult {
                    path: path_str.clone(),
                    name: name.clone(),
                    size: 0,
                    size_h: "0 B".to_string(),
                    is_dir: true,
                    matched_on: "name".to_string(),
                });
            }
            if query.recursive {
                search_recursive(
                    &path, query, pattern_lower, regex_pattern,
                    ignore_matcher, results, errors, files_searched,
                );
            }
        } else if metadata.is_file() {
            *files_searched += 1;
            let size = metadata.len();

            // Check size filters
            if let Some(min) = query.min_size {
                if size < min { continue; }
            }
            if let Some(max) = query.max_size {
                if size > max { continue; }
            }

            // Check extension filter
            if let Some(ref exts) = query.extensions {
                let file_ext = path.extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if !exts.iter().any(|ext| ext.to_lowercase() == file_ext) {
                    continue;
                }
            }

            // Check pattern match
            let mut matched_on = None;

            if matches_pattern(&name_lower, pattern_lower, regex_pattern) {
                matched_on = Some("name".to_string());
            } else if matches_pattern(&path_str.to_lowercase(), pattern_lower, regex_pattern) {
                matched_on = Some("path".to_string());
            }

            if let Some(matched) = matched_on {
                results.push(SearchResult {
                    path: path_str,
                    name,
                    size,
                    size_h: bytesize::ByteSize::b(size).to_string(),
                    is_dir: false,
                    matched_on: matched,
                });
            }
        }
    }
}

fn matches_pattern(
    text: &str,
    pattern_lower: &str,
    regex_pattern: &Result<regex::Regex, regex::Error>,
) -> bool {
    // Try simple substring match first
    if text.contains(pattern_lower) {
        return true;
    }
    // Try regex match if pattern is valid regex
    if let Ok(ref regex) = regex_pattern {
        if regex.is_match(text) {
            return true;
        }
    }
    // Try glob-like matching (convert * to .*)
    if pattern_lower.contains('*') || pattern_lower.contains('?') {
        let glob_regex = pattern_lower
            .replace('.', "\\.")
            .replace('*', ".*")
            .replace('?', ".");
        if let Ok(re) = regex::Regex::new(&format!("^{}$", glob_regex)) {
            return re.is_match(text);
        }
    }
    false
}
