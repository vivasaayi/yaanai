use serde::Serialize;
use serde_json::Value;
use std::io::Write;

use crate::recursive_tree_builder::TreeNode;
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
    serde_json::to_string_pretty(tree).map_err(|e| format!("JSON serialization error: {}", e))
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

    let bytes = wtr
        .into_inner()
        .map_err(|e| format!("CSV flush error: {}", e))?;
    String::from_utf8(bytes).map_err(|e| format!("UTF-8 conversion error: {}", e))
}

/// Export disk usage entries as JSON.
pub fn export_disk_usage_json(entries: &[DiskEntry]) -> Result<String, String> {
    serde_json::to_string_pretty(entries).map_err(|e| format!("JSON serialization error: {}", e))
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

    let bytes = wtr
        .into_inner()
        .map_err(|e| format!("CSV flush error: {}", e))?;
    String::from_utf8(bytes).map_err(|e| format!("UTF-8 conversion error: {}", e))
}

/// Export metadata duplicate candidates as JSON.
pub fn export_metadata_duplicates_json(result: &Value) -> Result<String, String> {
    serde_json::to_string_pretty(result).map_err(|e| format!("JSON serialization error: {}", e))
}

/// Export metadata duplicate candidates as CSV.
pub fn export_metadata_duplicates_csv(result: &Value) -> Result<String, String> {
    let mut wtr = csv::Writer::from_writer(Vec::new());

    wtr.write_record(&[
        "group_id",
        "group_index",
        "file_index",
        "extra_copy",
        "match_label",
        "confidence",
        "name",
        "path",
        "size",
        "size_h",
        "modified_unix_secs",
        "created_unix_secs",
        "group_wasted_space",
        "group_wasted_space_h",
    ])
    .map_err(|e| format!("CSV header error: {}", e))?;

    if let Some(groups) = result.get("groups").and_then(Value::as_array) {
        for (group_index, group) in groups.iter().enumerate() {
            let group_id = value_string(group.get("id"));
            let match_label = value_string(group.get("match_label"));
            let confidence = value_string(group.get("confidence"));
            let wasted_space = value_string(group.get("wasted_space"));
            let wasted_space_h = value_string(group.get("wasted_space_h"));

            if let Some(files) = group.get("files").and_then(Value::as_array) {
                for (file_index, file) in files.iter().enumerate() {
                    wtr.write_record(vec![
                        group_id.clone(),
                        group_index.to_string(),
                        file_index.to_string(),
                        (file_index > 0).to_string(),
                        match_label.clone(),
                        confidence.clone(),
                        value_string(file.get("name")),
                        value_string(file.get("path")),
                        value_string(file.get("size")),
                        value_string(file.get("size_h")),
                        value_string(file.get("modified_unix_secs")),
                        value_string(file.get("created_unix_secs")),
                        wasted_space.clone(),
                        wasted_space_h.clone(),
                    ])
                    .map_err(|e| format!("CSV row error: {}", e))?;
                }
            }
        }
    }

    let bytes = wtr
        .into_inner()
        .map_err(|e| format!("CSV flush error: {}", e))?;
    String::from_utf8(bytes).map_err(|e| format!("UTF-8 conversion error: {}", e))
}

/// Write export data to a file.
pub fn write_export_to_file(path: &str, content: &str) -> Result<(), String> {
    let mut file =
        std::fs::File::create(path).map_err(|e| format!("Cannot create file {}: {}", path, e))?;
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

fn value_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(flag)) => flag.to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}
