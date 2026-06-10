use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Favorite {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgnorePattern {
    pub id: i64,
    pub pattern: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRecord {
    pub id: i64,
    pub path: String,
    pub file_count: i64,
    pub dir_count: i64,
    pub total_size: i64,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStats {
    pub favorites_count: i64,
    pub ignore_patterns_count: i64,
    pub scan_records_count: i64,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let db_path = Self::get_db_path()?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create db directory: {}", e))?;
        }

        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        db.seed_default_ignore_patterns()?;
        Ok(db)
    }

    fn get_db_path() -> Result<PathBuf, String> {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "Cannot determine home directory".to_string())?;
        Ok(PathBuf::from(home).join(".yaanai").join("yaanai.db"))
    }

    fn init_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS ignore_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS scan_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                file_count INTEGER NOT NULL DEFAULT 0,
                dir_count INTEGER NOT NULL DEFAULT 0,
                total_size INTEGER NOT NULL DEFAULT 0,
                scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )
        .map_err(|e| format!("Failed to create tables: {}", e))
    }

    fn seed_default_ignore_patterns(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM ignore_patterns", [], |row| row.get(0))
            .map_err(|e| format!("Failed to count ignore patterns: {}", e))?;

        if count == 0 {
            let defaults = vec![
                ".git",
                "node_modules",
                ".npm",
                ".cargo",
                ".rustup",
                ".m2",
                ".gradle",
                ".nuget",
                ".vscode",
                "target/debug",
                "target/release",
                "__pycache__",
                ".DS_Store",
                "*.tmp",
                "bin/Debug",
                "bin/Release",
                "obj/Debug",
                "obj/Release",
            ];
            for pattern in defaults {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO ignore_patterns (pattern) VALUES (?1)",
                    params![pattern],
                );
            }
        }
        Ok(())
    }

    // --- Favorites ---

    pub fn add_favorite(&self, path: &str, name: &str) -> Result<Favorite, String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO favorites (path, name, created_at) VALUES (?1, ?2, datetime('now'))",
            params![path, name],
        ).map_err(|e| format!("Failed to add favorite: {}", e))?;

        let id = conn.last_insert_rowid();
        Ok(Favorite {
            id,
            path: path.to_string(),
            name: name.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub fn get_favorites(&self) -> Result<Vec<Favorite>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, path, name, created_at FROM favorites ORDER BY name")
            .map_err(|e| format!("Failed to prepare favorites query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Favorite {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    name: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| format!("Failed to query favorites: {}", e))?;

        let mut favorites = Vec::new();
        for row in rows {
            favorites.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(favorites)
    }

    pub fn remove_favorite(&self, path: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM favorites WHERE path = ?1", params![path])
            .map_err(|e| format!("Failed to remove favorite: {}", e))?;
        Ok(())
    }

    // --- Ignore Patterns ---

    pub fn add_ignore_pattern(&self, pattern: &str) -> Result<IgnorePattern, String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO ignore_patterns (pattern) VALUES (?1)",
            params![pattern],
        )
        .map_err(|e| format!("Failed to add ignore pattern: {}", e))?;

        let id = conn.last_insert_rowid();
        Ok(IgnorePattern {
            id,
            pattern: pattern.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub fn get_ignore_patterns(&self) -> Result<Vec<IgnorePattern>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, pattern, created_at FROM ignore_patterns ORDER BY pattern")
            .map_err(|e| format!("Failed to prepare ignore patterns query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(IgnorePattern {
                    id: row.get(0)?,
                    pattern: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .map_err(|e| format!("Failed to query ignore patterns: {}", e))?;

        let mut patterns = Vec::new();
        for row in rows {
            patterns.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(patterns)
    }

    pub fn remove_ignore_pattern(&self, pattern: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM ignore_patterns WHERE pattern = ?1",
            params![pattern],
        )
        .map_err(|e| format!("Failed to remove ignore pattern: {}", e))?;
        Ok(())
    }

    pub fn get_ignore_pattern_strings(&self) -> Result<Vec<String>, String> {
        self.get_ignore_patterns()
            .map(|patterns| patterns.into_iter().map(|p| p.pattern).collect())
    }

    // --- Scan Records ---

    pub fn save_scan_record(
        &self,
        path: &str,
        file_count: i64,
        dir_count: i64,
        total_size: i64,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO scan_records (path, file_count, dir_count, total_size) VALUES (?1, ?2, ?3, ?4)",
            params![path, file_count, dir_count, total_size],
        ).map_err(|e| format!("Failed to save scan record: {}", e))?;
        Ok(())
    }

    pub fn get_scan_records(&self, path: &str) -> Result<Vec<ScanRecord>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, path, file_count, dir_count, total_size, scanned_at FROM scan_records WHERE path = ?1 ORDER BY scanned_at DESC LIMIT 10")
            .map_err(|e| format!("Failed to prepare scan records query: {}", e))?;

        let rows = stmt
            .query_map(params![path], |row| {
                Ok(ScanRecord {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    file_count: row.get(2)?,
                    dir_count: row.get(3)?,
                    total_size: row.get(4)?,
                    scanned_at: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to query scan records: {}", e))?;

        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(records)
    }

    // --- Settings ---

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Failed to get setting: {}", e)),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| format!("Failed to set setting: {}", e))?;
        Ok(())
    }

    // --- Stats ---

    pub fn get_stats(&self) -> Result<DbStats, String> {
        let conn = self.conn.lock().unwrap();
        let favorites_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM favorites", [], |row| row.get(0))
            .unwrap_or(0);
        let ignore_patterns_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM ignore_patterns", [], |row| row.get(0))
            .unwrap_or(0);
        let scan_records_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM scan_records", [], |row| row.get(0))
            .unwrap_or(0);
        Ok(DbStats {
            favorites_count,
            ignore_patterns_count,
            scan_records_count,
        })
    }
}
