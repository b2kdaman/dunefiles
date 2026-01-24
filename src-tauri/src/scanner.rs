use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub path: String,
    pub total_space: u64,
    pub available_space: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

/// Get list of available disks/volumes
pub fn get_disks() -> Vec<DiskInfo> {
    let mut disks = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // On macOS, list /Volumes
        if let Ok(entries) = fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(metadata) = fs::metadata(&path) {
                    if metadata.is_dir() {
                        let name = path.file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();

                        disks.push(DiskInfo {
                            name: name.clone(),
                            path: path.to_string_lossy().to_string(),
                            total_space: 0,
                            available_space: 0,
                        });
                    }
                }
            }
        }

        // Also add home directory as a convenient entry point
        if let Some(home) = dirs::home_dir() {
            disks.insert(0, DiskInfo {
                name: "Home".to_string(),
                path: home.to_string_lossy().to_string(),
                total_space: 0,
                available_space: 0,
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, list drive letters
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if Path::new(&drive).exists() {
                disks.push(DiskInfo {
                    name: format!("{}: Drive", letter as char),
                    path: drive,
                    total_space: 0,
                    available_space: 0,
                });
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, check common mount points
        let mount_points = ["/", "/home", "/mnt", "/media"];
        for mp in mount_points {
            if Path::new(mp).exists() {
                disks.push(DiskInfo {
                    name: mp.to_string(),
                    path: mp.to_string(),
                    total_space: 0,
                    available_space: 0,
                });
            }
        }
    }

    disks
}

/// Calculate folder size recursively with depth limit
fn calculate_folder_size(path: &Path, depth: usize) -> u64 {
    if depth > 3 {
        return 0; // Limit recursion depth for performance
    }

    let mut size = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    size += metadata.len();
                } else if metadata.is_dir() {
                    // Skip hidden directories
                    let name = entry.file_name();
                    if !name.to_string_lossy().starts_with('.') {
                        size += calculate_folder_size(&entry.path(), depth + 1);
                    }
                }
            }
        }
    }
    size
}

/// List contents of a directory
pub fn list_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut entries = Vec::new();

    let read_result = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in read_result.flatten() {
        let entry_path = entry.path();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue, // Skip inaccessible items
        };

        let name = entry_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Skip hidden files/folders (starting with .)
        if name.starts_with('.') {
            continue;
        }

        let is_dir = metadata.is_dir();
        let size = if is_dir {
            // Calculate recursive folder size (limited depth)
            calculate_folder_size(&entry_path, 0)
        } else {
            metadata.len()
        };

        entries.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            size,
        });
    }

    // Sort: folders first, then files, by size descending within each group
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => b.size.cmp(&a.size), // Larger first
        }
    });

    Ok(entries)
}

