import { invoke } from "@tauri-apps/api/core";
import { useSceneStore, type FileEntry } from "../../store/sceneStore";
import { useShallow } from "zustand/react/shallow";
import type { DiskInfo } from "./spawn";
import type { NavigationDeps, NavigationHandlers } from "./types";
import { createDiskSpawnPlan } from "./diskLayout";
import { runExitTransition } from "./transitions";

const LOADING_OVERLAY_AUTO_HIDE_MS = 1500;
const NAVIGATE_IN_SPAWN_DELAY_MS = 200;
const NAVIGATE_BACK_EXIT_MS = 300;
const NAVIGATE_BACK_SPAWN_DELAY_MS = 150;
const RETURN_TO_COMPUTER_EXIT_MS = 300;
const RETURN_TO_COMPUTER_SPAWN_DELAY_MS = 200;

export function useSceneNavigationState() {
  return useSceneStore(
    useShallow((state) => ({
      canGoBack: state.canGoBack,
      currentPath: state.currentPath,
    }))
  );
}

export function createNavigationHandlers({
  sceneObjects,
  exitAnimsRef,
  spawnEntries,
  updateWalls,
  createDisk,
  camera,
  controls,
  showLoading,
  hideLoading,
  playSpawn,
  playNavigateIn,
  playNavigateBack,
}: NavigationDeps): NavigationHandlers {
  const getState = useSceneStore.getState;

  async function loadDirectory(path: string) {
    showLoading(LOADING_OVERLAY_AUTO_HIDE_MS);
    try {
      const entries = await invoke<FileEntry[]>("list_directory", { path });

      const cameraPosition = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      const cameraTarget = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
      const objectStates = sceneObjects.map((obj) => ({
        id: obj.id,
        position: { x: obj.body.position.x, y: obj.body.position.y, z: obj.body.position.z },
        rotation: {
          x: obj.body.quaternion.x,
          y: obj.body.quaternion.y,
          z: obj.body.quaternion.z,
          w: obj.body.quaternion.w,
        },
      }));

      getState().navigateTo(path, entries, { cameraPosition, cameraTarget, objectStates });
      runExitTransition({
        sceneObjects,
        exitAnimsRef,
        delayMs: NAVIGATE_IN_SPAWN_DELAY_MS,
        onComplete: () => {
          if (entries.length > 0) playSpawn();
          spawnEntries(entries);
          hideLoading();
        },
      });
    } catch (err) {
      console.error("Failed to load directory:", err);
      hideLoading();
    }
  }

  async function navigateIntoFolder(folderPath: string) {
    playNavigateIn();
    await loadDirectory(folderPath);
  }

  function navigateBack() {
    const previous = getState().goBack();
    if (previous) {
      playNavigateBack();
      runExitTransition({
        sceneObjects,
        exitAnimsRef,
        exitAnimDurationMs: NAVIGATE_BACK_EXIT_MS,
        delayMs: NAVIGATE_BACK_SPAWN_DELAY_MS,
        onComplete: () => {
          if (previous.entries.length > 0) playSpawn();
          spawnEntries(previous.entries);

          if (previous.cameraPosition) {
            camera.position.set(previous.cameraPosition.x, previous.cameraPosition.y, previous.cameraPosition.z);
          }
          if (previous.cameraTarget) {
            controls.target.set(previous.cameraTarget.x, previous.cameraTarget.y, previous.cameraTarget.z);
          }
        },
      });
    }
  }

  async function returnToComputer() {
    showLoading(LOADING_OVERLAY_AUTO_HIDE_MS);
    try {
      const disks = await invoke<DiskInfo[]>("get_disks");
      getState().clearHistory();
      runExitTransition({
        sceneObjects,
        exitAnimsRef,
        exitAnimDurationMs: RETURN_TO_COMPUTER_EXIT_MS,
        delayMs: RETURN_TO_COMPUTER_SPAWN_DELAY_MS,
        onComplete: () => {
          if (disks.length > 0) {
            const plan = createDiskSpawnPlan(disks);
            updateWalls(plan.count, plan.maxScale);
            for (const item of plan.items) {
              createDisk(item.disk, item.position, item.velocity, plan.maxDiskSize);
            }
            getState().navigateTo("", []);
          }
          hideLoading();
        },
      });
    } catch (err) {
      console.error("Failed to load disks:", err);
      hideLoading();
    }
  }

  async function loadInitialDisks() {
    try {
      const disks = await invoke<DiskInfo[]>("get_disks");
      const isMac = navigator.platform.toLowerCase().includes("mac");

      if (isMac && disks.length > 0) {
        await loadDirectory(disks[0].path);
      } else if (disks.length > 0) {
        playSpawn();
        const plan = createDiskSpawnPlan(disks);
        updateWalls(plan.count, plan.maxScale);
        for (const item of plan.items) {
          createDisk(item.disk, item.position, item.velocity, plan.maxDiskSize);
        }
        getState().navigateTo("", []);
      }
    } catch (err) {
      console.error("Failed to load disks:", err);
    }
  }

  return {
    loadDirectory,
    navigateIntoFolder,
    navigateBack,
    returnToComputer,
    loadInitialDisks,
  };
}
