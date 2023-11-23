use std::fs::{DirEntry, File, Metadata, ReadDir};

pub fn public_format_name(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust, YANAIAPP CRETE!", name)
}
pub fn get_files(name:&str) -> Vec<String> {
    let mut vec:Vec<String> = vec![];

    let dirs:ReadDir =std::fs::read_dir(name).unwrap();

    for path in dirs {
        let dirEntry:DirEntry= path.unwrap();

        println!("{dirEntry:?}");

        let metadata:Metadata = dirEntry.metadata().unwrap();
        println!("{metadata:?}");

        vec.push(dirEntry.file_name().into_string().unwrap())
    }

    vec
}
pub fn get_no() -> f32 {
    5.0
}