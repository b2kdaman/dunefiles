use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use sysinfo::Disks;

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
    let mut disk_infos = Vec::new();
    let disks = Disks::new_with_refreshed_list();

    for disk in disks.list() {
        let name = disk.name().to_string_lossy().to_string();
        let path = disk.mount_point().to_string_lossy().to_string();
        let total_space = disk.total_space();
        let available_space = disk.available_space();

        // Create a display name with drive letter and volume name
        let display_name = if cfg!(target_os = "windows") {
            // For Windows, show drive letter + volume name
            if let Some(drive_letter) = path.chars().next() {
                if name.is_empty() {
                    format!("{}:", drive_letter)
                } else {
                    format!("{}: {}", drive_letter, name)
                }
            } else {
                if name.is_empty() {
                    path.clone()
                } else {
                    name
                }
            }
        } else {
            // For Unix-like systems
            if name.is_empty() {
                path.clone()
            } else {
                format!("{} ({})", path, name)
            }
        };

        disk_infos.push(DiskInfo {
            name: display_name,
            path,
            total_space,
            available_space,
        });
    }

    disk_infos
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

