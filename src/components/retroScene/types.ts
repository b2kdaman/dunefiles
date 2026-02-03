import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { FileEntry } from "../../store/sceneStore";
import type { ExitAnim, Particle, ScaleAnim, SceneObject } from "../../animations/types";
import type { DiskInfo } from "./spawn";

export type MutableRef<T> = { current: T };

export type SceneWindowSize = {
  width: number;
  height: number;
};

export type SceneCommands = {
  navigateBack: () => void;
  loadDirectory: (path: string) => Promise<void>;
  returnToComputer: () => Promise<void>;
  loadMecha: () => void;
};

export type SceneRuntime = SceneCommands & {
  ditherPass: ShaderPass;
  dispose: () => void;
};

export type SceneDeps = {
  container: HTMLDivElement;
  onRendererReady?: (renderer: THREE.WebGLRenderer) => void;
  onWindowSizeChange: (size: SceneWindowSize) => void;
  onShowMechaButtonChange: (show: boolean) => void;
};

export type SceneMutableState = {
  exitAnimsRef: MutableRef<ExitAnim[]>;
  scaleAnimsRef: MutableRef<ScaleAnim[]>;
  particlesRef: MutableRef<Particle[]>;
  bloomActiveRef: MutableRef<boolean>;
};

export type NavigationDeps = {
  sceneObjects: SceneObject[];
  exitAnimsRef: MutableRef<ExitAnim[]>;
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

export type NavigationHandlers = {
  loadDirectory: (path: string) => Promise<void>;
  navigateIntoFolder: (path: string) => Promise<void>;
  navigateBack: () => void;
  returnToComputer: () => Promise<void>;
  loadInitialDisks: () => Promise<void>;
};
