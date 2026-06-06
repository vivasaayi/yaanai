use std::path::Path;

/// Gitignore-style pattern matcher for excluding directories/files from scans.
#[derive(Debug, Clone)]
pub struct IgnoreMatcher {
    patterns: Vec<String>,
}

impl IgnoreMatcher {
    pub fn new(patterns: Vec<String>) -> Self {
        Self { patterns }
    }

    pub fn empty() -> Self {
        Self {
            patterns: Vec::new(),
        }
    }

    /// Check if a path should be ignored based on the configured patterns.
    pub fn should_ignore(&self, path: &str) -> bool {
        let path_obj = Path::new(path);
        let file_name = path_obj
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        for pattern in &self.patterns {
            // Direct name match (e.g., "node_modules", ".git")
            if !pattern.contains('/') && !pattern.contains('*') {
                if file_name == *pattern {
                    return true;
                }
                // Also check if the path ends with the pattern as a component
                if path.ends_with(&format!("/{}", pattern))
                    || path.ends_with(&format!("\\{}", pattern))
                {
                    return true;
                }
            }

            // Path suffix match (e.g., "target/debug", "bin/Release")
            if pattern.contains('/') && !pattern.contains('*') {
                let normalized_pattern = pattern.replace('\\', "/");
                let normalized_path = path.replace('\\', "/");
                if normalized_path.ends_with(&normalized_pattern) {
                    return true;
                }
                if normalized_path.contains(&format!("/{}/", normalized_pattern)) {
                    return true;
                }
            }

            // Glob pattern match (e.g., "*.tmp", "*.log")
            if pattern.contains('*') || pattern.contains('?') {
                if glob_match(pattern, &file_name) {
                    return true;
                }
            }
        }

        false
    }

    pub fn patterns(&self) -> &[String] {
        &self.patterns
    }
}

/// Simple glob matching supporting * and ? wildcards.
fn glob_match(pattern: &str, text: &str) -> bool {
    let pattern_chars: Vec<char> = pattern.chars().collect();
    let text_chars: Vec<char> = text.chars().collect();

    fn match_helper(p: &[char], t: &[char]) -> bool {
        match (p.first(), t.first()) {
            (None, None) => true,
            (Some('*'), _) => {
                // * matches zero or more characters
                match_helper(&p[1..], t) || (!t.is_empty() && match_helper(p, &t[1..]))
            }
            (Some('?'), Some(_)) => match_helper(&p[1..], &t[1..]),
            (Some(pc), Some(tc)) => {
                pc.to_lowercase().eq(tc.to_lowercase()) && match_helper(&p[1..], &t[1..])
            }
            _ => false,
        }
    }

    match_helper(&pattern_chars, &text_chars)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glob_match() {
        assert!(glob_match("*.tmp", "file.tmp"));
        assert!(glob_match("*.log", "server.log"));
        assert!(!glob_match("*.tmp", "file.txt"));
        assert!(glob_match("test?", "test1"));
        assert!(!glob_match("test?", "test12"));
        assert!(glob_match("*", "anything"));
    }

    #[test]
    fn test_should_ignore_simple_names() {
        let matcher = IgnoreMatcher::new(vec!["node_modules".to_string(), ".git".to_string()]);
        assert!(matcher.should_ignore("/project/node_modules"));
        assert!(matcher.should_ignore("/project/.git"));
        assert!(!matcher.should_ignore("/project/src"));
    }

    #[test]
    fn test_should_ignore_path_patterns() {
        let matcher =
            IgnoreMatcher::new(vec!["target/debug".to_string(), "bin/Release".to_string()]);
        assert!(matcher.should_ignore("/project/target/debug"));
        assert!(matcher.should_ignore("/project/bin/Release"));
        assert!(!matcher.should_ignore("/project/src/debug"));
    }

    #[test]
    fn test_should_ignore_glob_patterns() {
        let matcher = IgnoreMatcher::new(vec!["*.tmp".to_string(), "*.log".to_string()]);
        assert!(matcher.should_ignore("/project/file.tmp"));
        assert!(matcher.should_ignore("/project/server.log"));
        assert!(!matcher.should_ignore("/project/file.rs"));
    }
}
