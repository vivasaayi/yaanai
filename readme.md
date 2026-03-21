# YAANAI - Desktop File Analyzer

A modern desktop application for analyzing file systems, detecting duplicate files, and managing disk space.

## Architecture

Built with **Tauri** - React frontend + Rust backend for native desktop performance and web UI flexibility.

**Key Features:**
- Recursive file tree analysis with progress tracking
- Real-time disk usage visualization (treemaps, sunbursts, charts)
- True duplicate detection using content hashing (SHA256)
- Smart file search with pattern matching
- Safe file operations with trash/recycle bin support
- Exportable reports (CSV, JSON)
- Persistent caching with SQLite

For setup and development details, refer to the respective project folders:
- `/yaanai-app` - Rust backend library
- `/yaanai-react` - React frontend with Tauri integration
- `/docs` - Architecture and development documentation


# License
This project was created to showcase how rust can be used for desktop development along with react components.

Please check the libraries in the package JSON and corresponding licenses. 


