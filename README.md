# SpaceRingScene

SpaceRingScene is a retro-styled 3D desktop file navigator built with React, Three.js, and Tauri. It renders files and folders as physical objects in a low-poly scene with pixelation, ordered Bayer dithering, and moody post-processing.

## Commands

```bash
npm run tauri:dev      # Run the Tauri desktop app in development mode
npm run build          # Build the frontend
npm run tauri:build    # Build the full desktop app and bundles
npm run lint           # Run ESLint
```

## Navigation

- Double-click a folder object to navigate into it.
- Press `Escape` or `Backspace` to go back.
- Shift-click a folder object to open that folder in the system file manager.
- Drag objects to move them around the scene.

Folder size labels are computed recursively within a short UI budget. If a folder is too large to scan immediately, the label is shown as a lower bound, for example `>4.2 GB`, or `large` when no reliable partial size was collected.

## Architecture

- `src/App.tsx` - Main app shell, settings state, and Tauri command integration.
- `src/components/RetroScene.tsx` - React bridge for the Three.js runtime.
- `src/components/retroScene/` - Scene runtime, navigation, interaction, spawning, resizing, rendering pipeline, labels, and formatting.
- `src-tauri/src/scanner.rs` - Disk and directory scanning.
- `src-tauri/src/lib.rs` - Tauri commands for settings, screenshots, directory listing, and opening folders.

## Legacy

`archive/index.html` contains the original single-file HTML prototype.
