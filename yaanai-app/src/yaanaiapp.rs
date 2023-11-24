mod tests;

use std::io::Error;
use std::fs::{DirEntry, Metadata, ReadDir};

pub fn public_format_name(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust, YANAIAPP CRETE!", name)
}

pub fn get_files(_name:&str) -> Vec<String> {
    let vec:Vec<String> = vec![];
    vec
}
pub fn recursively_list_files(name:&str, vec:&mut Vec<String> ) -> Vec<String> {
    println!("Getting files in folder:{}", name);

    let dirs:std::io::Result<ReadDir> =std::fs::read_dir(name);

    match dirs {
        Err(error) => {
            println!("Error occurred when reading the directory {name}");
            println!("{error}");
            return vec.to_vec();
        }

        _ => {}
    }

    for dir in dirs.unwrap() {
        let dir_entry:DirEntry= dir.unwrap();

        println!("{dir_entry:?}");

        let dir_path:String = dir_entry.file_name().into_string().unwrap();

        let metadata:Metadata = dir_entry.metadata().unwrap();
        println!("{metadata:?}");

        if metadata.is_dir(){
            let mut child_dir_path = name.to_string();
            child_dir_path.push_str("/");
            child_dir_path.push_str(dir_path.as_str());

            if vec.len()<100 {
                recursively_list_files(&child_dir_path, &mut vec.to_vec());
            }
        } else if metadata.is_file() {
            let mut result:String = "".to_string();
            result.push_str(dir_path.clone().as_str());
            result.push_str(metadata.len().to_string().as_str());

            vec.push(result);
            println!("{dir_path}");
        }
    }

    vec.to_vec()
}

pub fn get_no() -> f32 {
    5.0
}

#[test]
fn test_list_dirs() {
    let vec:Vec<String> = vec![];
    let result = recursively_list_files("/Users/rajanp/work/music", &mut vec.to_vec());
    assert_eq!(result.len(), 5);
}