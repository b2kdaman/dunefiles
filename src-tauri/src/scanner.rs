use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};
use sysinfo::Disks;

const MAX_DIRECTORY_LIST_SCAN_DURATION: Duration = Duration::from_millis(1_500);
const MAX_FOLDER_SCAN_DURATION: Duration = Duration::from_millis(250);

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
    pub size_complete: bool,
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

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .map(|name| name.to_string_lossy().starts_with('.'))
        .unwrap_or(false)
}

struct FolderSize {
    bytes: u64,
    complete: bool,
}

/// Calculate folder size recursively until the UI responsiveness budget expires.
fn calculate_folder_size(path: &Path, deadline: Instant) -> FolderSize {
    let mut size = 0u64;
    let mut complete = true;

    if Instant::now() >= deadline {
        return FolderSize {
            bytes: 0,
            complete: false,
        };
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => {
            return FolderSize {
                bytes: 0,
                complete: false,
            };
        }
    };

    for entry in entries.flatten() {
        if Instant::now() >= deadline {
            complete = false;
            break;
        }

        let entry_path = entry.path();

        if is_hidden(&entry_path) {
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            complete = false;
            continue;
        };

        if file_type.is_file() {
            if let Ok(metadata) = entry.metadata() {
                size = size.saturating_add(metadata.len());
            } else {
                complete = false;
            }
        } else if file_type.is_dir() {
            let child_size = calculate_folder_size(&entry_path, deadline);
            size = size.saturating_add(child_size.bytes);
            complete &= child_size.complete;
        }
    }

    FolderSize {
        bytes: size,
        complete,
    }
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
    let list_deadline = Instant::now() + MAX_DIRECTORY_LIST_SCAN_DURATION;

    let read_result = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in read_result.flatten() {
        let entry_path = entry.path();
        let name = entry_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        if is_hidden(&entry_path) {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue, // Skip inaccessible items
        };

        let is_dir = file_type.is_dir();
        let (size, size_complete) = if is_dir {
            let now = Instant::now();
            let folder_deadline = now + MAX_FOLDER_SCAN_DURATION;
            let deadline = if folder_deadline < list_deadline {
                folder_deadline
            } else {
                list_deadline
            };
            let folder_size = calculate_folder_size(&entry_path, deadline);

            (folder_size.bytes, folder_size.complete)
        } else if file_type.is_file() {
            match entry.metadata() {
                Ok(metadata) => (metadata.len(), true),
                Err(_) => continue,
            }
        } else {
            continue;
        };

        entries.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            size,
            size_complete,
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
