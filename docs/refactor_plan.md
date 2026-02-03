# RetroScene Refactor Plan

## Scope
Refactor `src/components/RetroScene.tsx` so it becomes a thin composition layer for scene lifecycle, while pushing feature logic into focused modules with testable boundaries.

## Why Refactor Now
- `RetroScene.tsx` still carries mixed concerns (scene bootstrapping, audio wiring, mode polling, breadcrumb parsing, and overlay glue).
- Cross-module contracts are implicit (refs and callback signatures), which makes changes risky.
- Several hot paths (`navigation.ts`, `spawn.ts`, `interaction.ts`) duplicate logic and carry hidden coupling to store shape and object internals.

## Current Baseline
- Initialization and teardown are mostly extracted (`createSceneContext`, `createPhysicsWorld`, `buildWorld`, `disposeScene`).
- Runtime systems are modular (`animate`, `interaction`, `resize`, `renderPipeline`).
- Remaining complexity sits in orchestration and data flow boundaries.

## Target End State
- `RetroScene.tsx` only:
  - creates a scene runtime
  - mounts/unmounts it in `useEffect`
  - passes UI state + callbacks to overlays
- Runtime API is explicit and typed (single `SceneRuntime` contract).
- Directory/disks spawning and navigation transitions are shared through one layout/spawn service.
- Polling-based flight-mode sync is replaced with event/store subscription.

## Refactor Phases

### Phase 1: Introduce Runtime Facade (No Behavior Change)
1. Add `src/components/retroScene/runtime.ts` with:
   - `createSceneRuntime(deps)`
   - `start()` / `dispose()`
   - command methods: `navigateBack`, `loadDirectory`, `returnToComputer`, `loadMecha`
2. Move most of `useEffect` body from `RetroScene.tsx` into runtime setup.
3. Keep current modules untouched; runtime composes them.

**Exit criteria**: `RetroScene.tsx` is mostly refs/state + one runtime lifecycle effect.

### Phase 2: Normalize Data Contracts
1. Add shared runtime types in `src/components/retroScene/types.ts`:
   - `SceneRuntime`, `SceneCommands`, `SceneDeps`, `SceneMutableState`.
2. Replace ad-hoc object literals passed across modules with named types.
3. Remove `sceneRef` shape duplication in `RetroScene.tsx`.

**Exit criteria**: cross-module interfaces are centralized and imported from one place.

### Phase 3: Consolidate Navigation + Spawn Flow
1. Extract shared disk placement logic from `navigation.ts` into a dedicated helper (e.g. `diskLayout.ts`).
2. Move repeated “spawn with delayed exit transition” patterns to a reusable transition helper.
3. Keep store interactions localized to navigation/runtime boundary.

**Exit criteria**: no duplicated disk grid math and fewer timing constants scattered across modules.

### Phase 4: Replace Flight-Mode Polling
1. Replace `setInterval` polling in `RetroScene.tsx` with an event-based subscription.
   - Preferred: expose subscribe API from `flight-mode` module.
   - Alternative: lift mode state into Zustand and subscribe once.
2. Keep `animate.ts` and overlay visibility driven by one authoritative state source.

**Exit criteria**: no interval polling for flight mode.

### Phase 5: UI Boundary Cleanup
1. Move breadcrumb parsing and “back/computer” command routing into a small view-model hook (e.g. `useRetroSceneViewModel.ts`).
2. Keep `Overlays.tsx` presentational only.
3. Optional: move inline style objects into `Overlays.styles.ts` to reduce render churn.

**Exit criteria**: `RetroScene.tsx` no longer owns UI transformation logic.

## Validation Plan
After each phase, verify:
- Initial load works on macOS and non-macOS disk flow.
- Folder enter/back/computer navigation state remains correct.
- Drag, bloom glow, and drop interactions behave as before.
- Mecha launch and audio transitions still trigger correctly.
- Resize, labels, and FPS overlay still update correctly.

## Risk Areas
- Timing dependencies in navigation (`setTimeout`) may mask race conditions.
- Runtime extraction can break cleanup ordering (event listeners, physics bodies, DOM nodes).
- Flight mode state source changes can desync overlay visibility vs. controls lock.

## Out of Scope (for this refactor)
- Rewriting object creation visuals/material design.
- Migrating physics engine or replacing Three.js post-processing stack.
- Full UI redesign of overlay controls.
