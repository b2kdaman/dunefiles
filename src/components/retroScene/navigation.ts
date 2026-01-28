import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { useSceneStore, type FileEntry } from "../../store/sceneStore";
import { useShallow } from "zustand/react/shallow";
import type { SceneObject, ExitAnim } from "../../animations/types";
import { exitCurrentObjects } from "../../animations/exit-animation";
import { diskMaxScale } from "./sizing";
import type { DiskInfo } from "./spawn";

export function useSceneNavigationState() {
  return useSceneStore(
    useShallow((state) => ({
      canGoBack: state.canGoBack,
      currentPath: state.currentPath,
    }))
  );
}

type NavigationOptions = {
  sceneObjects: SceneObject[];
  exitAnimsRef: { current: ExitAnim[] };
  spawnEntries: (entries: FileEntry[]) => void;
  updateWalls: (count: number, maxScale: number) => void;
  createDisk: (disk: DiskInfo, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number) => void;
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3 };
  showLoading: (autoHideMs?: number) => void;
  hideLoading: () => void;
  playSpawn: () => void;
  playNavigateIn: () => void;
  playNavigateBack: () => void;
};

type NavigationHandlers = {
  loadDirectory: (path: string) => Promise<void>;
  navigateIntoFolder: (path: string) => Promise<void>;
  navigateBack: () => void;
  returnToComputer: () => Promise<void>;
  loadInitialDisks: () => Promise<void>;
};

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
}: NavigationOptions): NavigationHandlers {
  const getState = useSceneStore.getState;

  async function loadDirectory(path: string) {
    showLoading(1500);
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
      exitCurrentObjects(sceneObjects, exitAnimsRef.current);
      setTimeout(() => {
        if (entries.length > 0) playSpawn();
        spawnEntries(entries);
        hideLoading();
      }, 200);
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
      exitCurrentObjects(sceneObjects, exitAnimsRef.current, 300);
      setTimeout(() => {
        if (previous.entries.length > 0) playSpawn();
        spawnEntries(previous.entries);

        if (previous.cameraPosition) {
          camera.position.set(previous.cameraPosition.x, previous.cameraPosition.y, previous.cameraPosition.z);
        }
        if (previous.cameraTarget) {
          controls.target.set(previous.cameraTarget.x, previous.cameraTarget.y, previous.cameraTarget.z);
        }
      }, 150);
    }
  }

  async function returnToComputer() {
    showLoading(1500);
    try {
      const disks = await invoke<DiskInfo[]>("get_disks");
      getState().clearHistory();
      exitCurrentObjects(sceneObjects, exitAnimsRef.current, 300);

      setTimeout(async () => {
        if (disks.length > 0) {
          const count = disks.length;
          const maxDiskSize = Math.max(...disks.map((d) => d.total_space), 1);

          const maxScale = diskMaxScale(maxDiskSize);
          updateWalls(count, maxScale);

          const gridSize = Math.ceil(Math.sqrt(count));
          const spacing = 2.0;

          for (let i = 0; i < count; i++) {
            const disk = disks[i];
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            const offsetX = (gridSize - 1) * spacing / 2;
            const offsetZ = (gridSize - 1) * spacing / 2;

            const spawnPos = new THREE.Vector3(
              col * spacing - offsetX + (Math.random() - 0.5) * 0.3,
              8 + Math.random() * 2,
              row * spacing - offsetZ + (Math.random() - 0.5) * 0.3
            );

            const spawnVel = new THREE.Vector3((Math.random() - 0.5) * 0.5, -3, (Math.random() - 0.5) * 0.5);

            createDisk(disk, spawnPos, spawnVel, maxDiskSize);
          }
          getState().navigateTo("", []);
        }
        hideLoading();
      }, 200);
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
        const count = disks.length;
        const maxDiskSize = Math.max(...disks.map((d) => d.total_space), 1);
        const maxScale = diskMaxScale(maxDiskSize);

        updateWalls(count, maxScale);

        const gridSize = Math.ceil(Math.sqrt(count));
        const spacing = 2.0;

        for (let i = 0; i < count; i++) {
          const disk = disks[i];
          const row = Math.floor(i / gridSize);
          const col = i % gridSize;
          const offsetX = (gridSize - 1) * spacing / 2;
          const offsetZ = (gridSize - 1) * spacing / 2;

          const spawnPos = new THREE.Vector3(
            col * spacing - offsetX + (Math.random() - 0.5) * 0.3,
            8 + Math.random() * 2,
            row * spacing - offsetZ + (Math.random() - 0.5) * 0.3
          );

          const spawnVel = new THREE.Vector3((Math.random() - 0.5) * 0.5, -3, (Math.random() - 0.5) * 0.5);

          createDisk(disk, spawnPos, spawnVel, maxDiskSize);
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
