use serde::Serialize;
use std::io::Write;

use crate::recursive_tree_builder::TreeNode;
use crate::duplicate_detector::DuplicateScanResult;
use crate::types::DiskEntry;

#[derive(Debug, Clone, Serialize)]
struct FlatFileEntry {
    path: String,
    name: String,
    size: u64,
    size_h: String,
    is_dir: bool,
    depth: u32,
}

/// Export a tree as JSON.
pub fn export_tree_json(tree: &TreeNode) -> Result<String, String> {
    serde_json::to_string_pretty(tree)
        .map_err(|e| format!("JSON serialization error: {}", e))
}

/// Export a tree as CSV (flattened).
pub fn export_tree_csv(tree: &TreeNode) -> Result<String, String> {
    let mut entries: Vec<FlatFileEntry> = Vec::new();
    flatten_tree(tree, 0, &mut entries);

    let mut wtr = csv::Writer::from_writer(Vec::new());
    for entry in &entries {
        wtr.serialize(entry)
            .map_err(|e| format!("CSV write error: {}", e))?;
    }

    let bytes = wtr.into_inner()
        .map_err(|e| format!("CSV flush error: {}", e))?;
    String::from_utf8(bytes)
        .map_err(|e| format!("UTF-8 conversion error: {}", e))
}

/// Export duplicate scan results as JSON.
pub fn export_duplicates_json(result: &DuplicateScanResult) -> Result<String, String> {
    serde_json::to_string_pretty(result)
        .map_err(|e| format!("JSON serialization error: {}", e))
}

/// Export duplicate scan results as CSV.
pub fn export_duplicates_csv(result: &DuplicateScanResult) -> Result<String, String> {
    let mut wtr = csv::Writer::from_writer(Vec::new());

    // Write header
    wtr.write_record(&["group_hash", "file_path", "file_name", "size", "size_h", "wasted_space_h"])
        .map_err(|e| format!("CSV header error: {}", e))?;

    for group in &result.groups {
        for file in &group.files {
            wtr.write_record(&[
                &group.hash,
                &file.path,
                &file.name,
                &file.size.to_string(),
                &file.size_h,
                &group.wasted_space_h,
            ])
            .map_err(|e| format!("CSV row error: {}", e))?;
        }
    }

    let bytes = wtr.into_inner()
        .map_err(|e| format!("CSV flush error: {}", e))?;
    String::from_utf8(bytes)
        .map_err(|e| format!("UTF-8 conversion error: {}", e))
}

/// Export disk usage entries as JSON.
pub fn export_disk_usage_json(entries: &[DiskEntry]) -> Result<String, String> {
    serde_json::to_string_pretty(entries)
        .map_err(|e| format!("JSON serialization error: {}", e))
}

/// Export disk usage entries as CSV.
pub fn export_disk_usage_csv(entries: &[DiskEntry]) -> Result<String, String> {
    let mut wtr = csv::Writer::from_writer(Vec::new());

    wtr.write_record(&["path", "name", "size", "size_h", "is_dir", "is_file"])
        .map_err(|e| format!("CSV header error: {}", e))?;

    for entry in entries {
        wtr.write_record(&[
            &entry.path,
            &entry.name,
            &entry.size.to_string(),
            &entry.size_h,
            &entry.is_dir.to_string(),
            &entry.is_file.to_string(),
        ])
        .map_err(|e| format!("CSV row error: {}", e))?;
    }

    let bytes = wtr.into_inner()
        .map_err(|e| format!("CSV flush error: {}", e))?;
    String::from_utf8(bytes)
        .map_err(|e| format!("UTF-8 conversion error: {}", e))
}

/// Write export data to a file.
pub fn write_export_to_file(path: &str, content: &str) -> Result<(), String> {
    let mut file = std::fs::File::create(path)
        .map_err(|e| format!("Cannot create file {}: {}", path, e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Cannot write to file {}: {}", path, e))?;
    Ok(())
}

fn flatten_tree(node: &TreeNode, depth: u32, entries: &mut Vec<FlatFileEntry>) {
    entries.push(FlatFileEntry {
        path: node.disk_entry.path.clone(),
        name: node.disk_entry.name.clone(),
        size: node.disk_entry.size,
        size_h: node.disk_entry.size_h.clone(),
        is_dir: node.disk_entry.is_dir,
        depth,
    });

    for child in &node.children {
        flatten_tree(child, depth + 1, entries);
    }
}
