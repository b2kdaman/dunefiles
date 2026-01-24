use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub pixel_size: f32,
    pub dither_strength: f32,
    pub gloom: f32,
    pub contrast: f32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            pixel_size: 3.0,
            dither_strength: 0.85,
            gloom: 0.12,
            contrast: 1.15,
        }
    }
}

fn get_settings_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("spaceringscene").join("settings.json"))
}

#[tauri::command]
fn load_settings() -> Settings {
    let Some(path) = get_settings_path() else {
        return Settings::default();
    };

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> {
    let Some(path) = get_settings_path() else {
        return Err("Could not determine config directory".into());
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_screenshot(png_base64: String) -> Result<String, String> {
    let Some(pictures_dir) = dirs::picture_dir() else {
        return Err("Could not determine pictures directory".into());
    };

    let screenshots_dir = pictures_dir.join("SpaceRingScene");
    fs::create_dir_all(&screenshots_dir).map_err(|e| e.to_string())?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    let filename = format!("screenshot_{}.png", timestamp);
    let path = screenshots_dir.join(&filename);

    let data = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &png_base64,
    )
    .map_err(|e| e.to_string())?;

    fs::write(&path, data).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            save_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
