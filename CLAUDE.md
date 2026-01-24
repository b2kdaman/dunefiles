# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SpaceRingScene is a retro-styled 3D graphics desktop application. It renders a moody, low-poly scene with custom post-processing shaders for pixelation and ordered Bayer dithering.

## Commands

```bash
# Development
npm run tauri:dev      # Run Tauri desktop app in dev mode

# Build
npm run build          # Build frontend only
npm run tauri:build    # Build full desktop application

# Lint
npm run lint           # ESLint
```

## Architecture

### Frontend (React + TypeScript + Vite)

- `src/App.tsx` - Main component, holds settings state, Tauri command integration
- `src/components/RetroScene.tsx` - Three.js scene with postprocessing pipeline
- `src/components/ControlPanel.tsx` - UI sliders for shader parameters
- `src/types.ts` - Shared Settings interface

### Backend (Tauri / Rust)

- `src-tauri/src/lib.rs` - Tauri commands:
  - `load_settings()` / `save_settings()` - JSON persistence in app config dir
  - `save_screenshot()` - Export canvas to PNG in Pictures folder

### Postprocessing Shader

The `DitherPixelShader` in RetroScene.tsx applies:
- Pixelation via UV snapping
- 4x4 Bayer matrix ordered dithering
- Contrast/gloom adjustments
- 6-level color quantization

Tunable uniforms: `pixelSize`, `ditherStrength`, `gloom`, `contrast`

## Legacy

`archive/index.html` contains the original single-file HTML prototype.
