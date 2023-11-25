mod tests;

use std::io::Error;
use std::fs::{DirEntry, Metadata, ReadDir};
use std::os::macos::fs::MetadataExt;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiskEntry {
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
    is_file: bool
}

impl DiskEntry {
    fn new(dir:&DirEntry) -> Self {
        let meta_data = dir.metadata().unwrap();

        Self{
            name: dir.file_name().into_string().unwrap(),
            path: dir.path().into_os_string().to_str().unwrap().to_string(),
            size: meta_data.len(),
            is_dir: meta_data.is_dir(),
            is_file: meta_data.is_file()
        }
    }
}

struct AllDiskEntries {
    disk_entries: Vec<DiskEntry>
}

impl AllDiskEntries {
    fn new() -> Self{
        Self {
            disk_entries: vec![]
        }
    }
    fn add_new_disk_entry(&mut self, disk_entry: DiskEntry) {
        self.disk_entries.push(disk_entry);
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

pub fn public_format_name(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust, YANAIAPP CRETE!", name)
}

pub fn fetch_files<'a>(name:&'a str, vec:&'a mut Vec<String> ) -> &'a mut Vec<String> {
    let result =recursively_list_files_wc(name, vec, false, true);
    return result
}

pub fn recursively_list_files_de<'a>(name:&'a str, vec:&'a mut Vec<DiskEntry>, recurse:bool, include_dirs:bool)
    -> &'a mut Vec<DiskEntry> {
    println!("Getting files in folder:{}", name);

    let dirs:std::io::Result<ReadDir> =std::fs::read_dir(name);

    match dirs {
        Err(error) => {
            println!("Error occurred when reading the directory {name}");
            println!("{error}");
            return vec;
        }

        _ => {}
    }

    for dir in dirs.unwrap() {
        let dir_entry:DirEntry= dir.unwrap();

        // println!("{dir_entry:?}");

        let dir_path:String = dir_entry.file_name().into_string().unwrap();

        let metadata:Metadata = dir_entry.metadata().unwrap();
        // println!("{metadata:?}");

        if metadata.is_dir(){
            let mut child_dir_path = name.to_string();
            child_dir_path.push_str("/");
            child_dir_path.push_str(dir_path.as_str());

            if vec.len()<10000 && recurse {
                recursively_list_files_de(&child_dir_path, vec, recurse, include_dirs);
            }

            if include_dirs {
                let mut result:String = "".to_string();
                result.push_str(dir_path.clone().as_str());

                let disk_entry:DiskEntry = DiskEntry::new(&dir_entry);
                vec.push(disk_entry);
            }
        } else if metadata.is_file() {
            let mut result:String = "".to_string();
            result.push_str(dir_path.clone().as_str());
            result.push_str(metadata.len().to_string().as_str());

            let disk_entry:DiskEntry = DiskEntry::new(&dir_entry);
            // vec.push(disk_entry);

            vec.push(disk_entry);
            // println!("{dir_path}");
        }
    }

    vec
}

pub fn recursively_list_files_wc<'a>(name:&'a str, vec:&'a mut Vec<String>, recurse:bool, includeDirs:bool) -> &'a mut Vec<String> {
    println!("Getting files in folder:{}", name);

    let dirs:std::io::Result<ReadDir> =std::fs::read_dir(name);

    match dirs {
        Err(error) => {
            println!("Error occurred when reading the directory {name}");
            println!("{error}");
            return vec;
        }

        _ => {}
    }

    for dir in dirs.unwrap() {
        let dir_entry:DirEntry= dir.unwrap();

        // println!("{dir_entry:?}");

        let dir_path:String = dir_entry.file_name().into_string().unwrap();

        let metadata:Metadata = dir_entry.metadata().unwrap();
        // println!("{metadata:?}");

        if metadata.is_dir(){
            let mut child_dir_path = name.to_string();
            child_dir_path.push_str("/");
            child_dir_path.push_str(dir_path.as_str());

            if vec.len()<10000 && recurse {
                recursively_list_files(&child_dir_path, vec);
            }

            if includeDirs {
                let mut result:String = "".to_string();
                result.push_str(dir_path.clone().as_str());

                vec.push(result);
            }
        } else if metadata.is_file() {
            let mut result:String = "".to_string();
            result.push_str(dir_path.clone().as_str());
            result.push_str(metadata.len().to_string().as_str());

            vec.push(result);
            // println!("{dir_path}");
        }
    }

    vec
}

pub fn analyze_disk_usage(folder_name:String) -> Vec<DiskEntry> {
    let mut all_disk_entries = AllDiskEntries::new();

    let mut folders:Vec<String>=vec![];
    folders.push(folder_name);

    while folders.len() > 0 {
        let path = folders.pop().unwrap();
        println!("Analyzing folder:{path}");

        let mut disk_entries:Vec<DiskEntry>=vec![];
        let result = recursively_list_files_de(path.as_str(), &mut disk_entries,false,true);

        for de in result {
            all_disk_entries.add_new_disk_entry(de.to_owned());

            if de.is_file {
                continue
            }

            folders.push(de.path.clone());
        }


        disk_entries.clear()
    }

    return all_disk_entries.disk_entries
}

pub fn recursively_list_files<'a>(name:&'a str, vec:&'a mut Vec<String> ) -> &'a mut Vec<String> {
    println!("Getting files in folder:{}", name);

    let dirs:std::io::Result<ReadDir> =std::fs::read_dir(name);

    match dirs {
        Err(error) => {
            println!("Error occurred when reading the directory {name}");
            println!("{error}");
            return vec;
        }

        _ => {}
    }

    for dir in dirs.unwrap() {
        let dir_entry:DirEntry= dir.unwrap();

        // println!("{dir_entry:?}");

        let dir_path:String = dir_entry.file_name().into_string().unwrap();

        let metadata:Metadata = dir_entry.metadata().unwrap();
        // println!("{metadata:?}");

        if metadata.is_dir(){
            let mut child_dir_path = name.to_string();
            child_dir_path.push_str("/");
            child_dir_path.push_str(dir_path.as_str());

            if vec.len()<10000 {
                recursively_list_files(&child_dir_path, vec);
            }
        } else if metadata.is_file() {
            let mut result:String = "".to_string();
            result.push_str(dir_path.clone().as_str());
            result.push_str(metadata.len().to_string().as_str());

            vec.push(result);
            // println!("{dir_path}");
        }
    }

    vec
}

pub fn get_no() -> f32 {
    5.0
}

#[test]
fn test_list_dirs() {
    let mut vec:Vec<String> = vec![];
    let result = recursively_list_files("/Users/rajanp/work", &mut vec);
    assert_eq!(result.len(), 10010);
}

#[test]
fn test_recursively_list_files_de() {
    let mut vec:Vec<DiskEntry> = vec![];
    let result = recursively_list_files_de(
        "/Users/rajanp/work/music",
              &mut vec, true, true);
    assert_eq!(result.len(), 52);
}

#[test]
fn test_analyze_disk_usage() {
    let result = analyze_disk_usage("/Users/rajanp/work/music".to_string());
    assert_eq!(result.len(), 52);
}