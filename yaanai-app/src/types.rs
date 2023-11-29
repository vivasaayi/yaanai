use serde::{Deserialize, Serialize};
use bytesize::{GB, KB, MB};
use std::fs::{DirEntry, Metadata, ReadDir};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiskEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_h: String,
    pub is_dir: bool,
    pub is_file: bool,
}


impl DiskEntry {
    pub fn new_from_empty() -> Self {
        Self{
            name: String::new(),
            path: String::new(),
            size: 0,
            size_h: String::new(),
            is_dir: false,
            is_file: false
        }
    }

    pub fn new(dir:&DirEntry) -> Self {
        let meta_data = dir.metadata().unwrap();

        Self{
            name: dir.file_name().into_string().unwrap(),
            path: dir.path().into_os_string().to_str().unwrap().to_string(),
            size: meta_data.len(),
            size_h: bytesize::ByteSize::b(meta_data.len()).to_string(),
            is_dir: meta_data.is_dir(),
            is_file: meta_data.is_file()
        }
    }

    pub fn calculate_human_size(&mut self) {
        self.size_h = bytesize::ByteSize::b(self.size).to_string()
    }
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
    pub disk_entries: Vec<DiskEntry>
}

impl AllDiskEntries {
    pub fn new() -> Self{
        Self {
            disk_entries: vec![]
        }
    }
    pub fn add_new_disk_entry(&mut self, disk_entry: DiskEntry) {
        self.disk_entries.push(disk_entry);
    }
}

