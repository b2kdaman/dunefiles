# RetroScene Refactor Plan (Tailored)

## Goals
- Reduce `src/components/RetroScene.tsx` to orchestration and React lifecycle only.
- Make the runtime lifecycle explicit: init → load → animate → teardown.
- Isolate responsibilities (rendering, physics, navigation, HUD, audio) into modules with clear APIs.
- Centralize configuration and magic numbers behind named constants.

## Current Responsibilities in `RetroScene.tsx`
- Renderer + label layer setup (WebGLRenderer, CSS2DRenderer, DOM injection).
- Loading overlay + FPS counter management.
- Audio init + background music start.
- Scene setup (fog, background, lights, ground, fog layers, infinite grid).
- Camera + OrbitControls init.
- Physics world setup + collision sound on ground.
- Spawn factory + walls init; creates files, folders, disks.
- Navigation/IO (Tauri `list_directory`, `get_disks`) and state in `useSceneStore`.
- Mecha animation trigger + action music switch.
- Input handlers (drag, double-click, mouse move, keyboard back).
- Render pipeline + bloom control.
- Main animation loop (fps, fog shader time, exit/scale/particles, physics, occlusion, bloom, label rendering).
- Resize handling + label font scaling.
- Cleanup for scene, renderer, listeners, and DOM nodes.
- UI overlay wiring to `RetroSceneOverlays`.

## Existing Helpers to Build On
- `src/components/retroScene/dom.ts` (loading/FPS)
- `src/components/retroScene/labels.ts` (font scaling)
- `src/components/retroScene/shaders.ts` (fog/grid)
- `src/components/retroScene/sizing.ts` (disk sizing)
- `src/components/retroScene/constants.ts` (bloom layer)
- `src/components/retroScene/renderPipeline.ts` (composer + bloom)
- `src/components/retroScene/spawn.ts` (spawn factory)
- `src/animations/*` (flight mode, mecha, audio, particles, exit/scale)

## Proposed Module Boundaries (Adjusted to Current Code)
1. **Scene Context**
   - `retroScene/createSceneContext.ts`
   - Creates renderer, label renderer, scene, camera, controls, clock.
   - Returns `{ renderer, labelRenderer, scene, camera, controls, clock }`.

2. **World Setup**
   - `retroScene/buildWorld.ts`
   - Creates lights, ground plane, fog layers, infinite grid.
   - Returns `{ fogLayers, grid, groundBody, lights }`.

3. **Physics Setup**
   - `retroScene/createPhysicsWorld.ts`
   - Creates CANNON world, materials, ground body, collision sounds.
   - Returns `{ world, defaultMaterial }`.

4. **Navigation + IO**
   - `retroScene/navigation.ts`
   - Wraps `loadDirectory`, `navigateBack`, `returnToComputer`, `loadInitialDisks`.
   - Accepts `sceneObjects`, `spawnEntries`, `updateWalls`, `createDisk`.

5. **Input Handlers**
   - `retroScene/interaction.ts`
   - Owns raycasting, dragging, double-click navigation, and keyboard back.
   - API: `registerInteractionHandlers(...)` returning a cleanup function.

6. **Animation Loop**
   - `retroScene/animate.ts`
   - Owns per-frame updates: fps, fog uniforms, exit/scale/particles, physics,
     label occlusion, bloom, label render toggle.
   - Accepts callbacks and dependencies (sceneObjects, world, renderPipeline, etc.).

7. **Resize Handler**
   - `retroScene/resize.ts`
   - Updates renderer size, label renderer size, camera aspect, pipeline size,
     line material resolution, and label font scale.

8. **Lifecycle Cleanup**
   - `retroScene/dispose.ts`
   - Centralizes cleanup: event handlers, DOM nodes, renderer dispose,
     geometry/material disposal, world bodies.

## Step-by-Step Plan
1. **Extract scene context**
   - Move renderer + label renderer + camera + controls + clock to `createSceneContext`.
   - Replace inline init in `RetroScene.tsx` with a single call.

2. **Extract physics**
   - Move CANNON world + materials + ground body + landing sound into `createPhysicsWorld`.
   - Return `{ world, defaultMaterial, groundBody }`.

3. **Extract world visuals**
   - Move lights, ground mesh, fog layers, and infinite grid to `buildWorld`.
   - Return `fogLayers`, `infiniteGrid`, and store references for cleanup.

4. **Extract navigation/IO**
   - Move `loadDirectory`, `navigateBack`, `returnToComputer`, and initial disk load to `navigation`.
   - Keep `useSceneStore` usage confined to this module.

5. **Extract interaction**
   - Move mouse/keyboard handlers + drag state into `interaction`.
   - Return a cleanup function that unregisters all listeners.

6. **Extract animation loop**
   - Move `animate()` to `animate.ts` and pass in required dependencies.
   - Keep bloom decision + label render toggle inside the loop.

7. **Extract resize**
   - Move `handleResize()` to `resize.ts` and return cleanup.

8. **Create centralized dispose**
   - Build `disposeScene()` that handles all Three/CANNON cleanup and DOM removal.
   - Call from `useEffect` cleanup.

9. **Tighten types and state**
   - Introduce `SceneContext`, `WorldContext`, `NavContext` types.
   - Avoid storing large mutable objects in React state; keep in refs.

10. **Smoke test**
   - Verify: navigation, drag glow, bloom, labels, mecha, audio, flight mode.

## Acceptance Criteria
- `RetroScene.tsx` only wires modules and lifecycle effects.
- All initialization is in dedicated modules with small APIs.
- No DOM mutations outside `dom.ts`, overlays, or interaction modules.
- No duplicated magic numbers in `RetroScene.tsx`.
- Flight mode and audio transitions still work as-is.

## Risks / Notes
- Navigation + scene spawning are intertwined; extract carefully to avoid breaking history.
- Flight mode toggles label renderer visibility; ensure it stays centralized in the loop.
- Audio state is fragile; keep explicit transitions in `sound-effects.ts`.
