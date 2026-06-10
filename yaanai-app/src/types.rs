use serde::{Deserialize, Serialize};
use std::fs::{DirEntry, Metadata};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiskEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_h: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub modified_unix_secs: Option<i64>,
    pub created_unix_secs: Option<i64>,
}

impl DiskEntry {
    pub fn new_from_empty() -> Self {
        Self {
            name: String::new(),
            path: String::new(),
            size: 0,
            size_h: String::new(),
            is_dir: false,
            is_file: false,
            modified_unix_secs: None,
            created_unix_secs: None,
        }
    }

    pub fn new(dir: &DirEntry) -> Self {
        let meta_data = dir.metadata().unwrap();

        Self {
            name: dir.file_name().into_string().unwrap(),
            path: dir.path().into_os_string().to_str().unwrap().to_string(),
            size: meta_data.len(),
            size_h: bytesize::ByteSize::b(meta_data.len()).to_string(),
            is_dir: meta_data.is_dir(),
            is_file: meta_data.is_file(),
            modified_unix_secs: Self::metadata_modified_unix_secs(&meta_data),
            created_unix_secs: Self::metadata_created_unix_secs(&meta_data),
        }
    }

    pub fn calculate_human_size(&mut self) {
        self.size_h = bytesize::ByteSize::b(self.size).to_string()
    }

    pub fn metadata_modified_unix_secs(metadata: &Metadata) -> Option<i64> {
        system_time_to_unix_secs(metadata.modified())
    }

    pub fn metadata_created_unix_secs(metadata: &Metadata) -> Option<i64> {
        system_time_to_unix_secs(metadata.created())
    }
}

fn system_time_to_unix_secs(time: std::io::Result<SystemTime>) -> Option<i64> {
    time.ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs().min(i64::MAX as u64) as i64)
}

// impl Clone for DiskEntry {
//     fn clone(&self) -> Self {
//         let cl = DiskEntry{
//             name: "".to_string(),
//             path: "".to_string(),
//             size: 0,
//             is_dir: false,
//             is_file: false,
//         };
//
//         cl
//     }
// }

pub struct AllDiskEntries {
    pub disk_entries: Vec<DiskEntry>,
}

impl AllDiskEntries {
    pub fn new() -> Self {
        Self {
            disk_entries: vec![],
        }
    }
    pub fn add_new_disk_entry(&mut self, disk_entry: DiskEntry) {
        self.disk_entries.push(disk_entry);
    }
}
