# Plan: Convert Three.js HTML Prototype into React + Tauri Project

## Goal

Turn the single-file Three.js HTML prototype into a **desktop application** using:

- **Frontend:** React + Vite + TypeScript
- **Rendering:** Three.js + postprocessing (pixelation + dithering)
- **Backend:** Tauri (Rust)
- **Persistence:** Local settings stored as JSON
- **Optional:** Screenshot export

---

## High-level Architecture

### Frontend (React)

- `RetroScene.tsx`
  - Owns Three.js lifecycle
  - Creates renderer, scene, camera, controls, composer
  - Applies postprocessing (pixel + dither shader)
  - Updates shader uniforms live when settings change

- `ControlPanel.tsx`
  - UI sliders for:
    - pixelSize
    - ditherStrength
    - gloom
    - contrast
  - Save / Load / Reset buttons

- `App.tsx`
  - Holds global settings state
  - Loads settings from Tauri on mount
  - Passes settings down to scene + UI

### Backend (Tauri / Rust)

- Commands:
  - `load_settings() -> Settings`
  - `save_settings(settings: Settings)`
  - `save_screenshot(png_base64: String) -> String`
- Settings stored as JSON in app config or app data directory

---

## Project Scaffold

### Commands

```bash
npm create vite@latest spaceringscene -- --template react-ts
cd spaceringscene
npm install three
npm install -D @tauri-apps/cli
npm install @tauri-apps/api
npx tauri init
