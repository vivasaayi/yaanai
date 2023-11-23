pub fn public_format_name(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust, YANAIAPP CRETE!", name)
}

pub fn get_files(name:&str) -> Vec<String> {
    let mut vec:Vec<String> = vec![];

    vec.push("Hello".to_string());
    vec.push("Rajan".to_string());

    vec
}
pub fn get_no() -> f32 {
    5.0
}