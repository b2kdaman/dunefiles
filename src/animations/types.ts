import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Line2 } from "three/examples/jsm/lines/Line2.js";

export type SceneObject = {
  id: string;
  mesh: THREE.Mesh;
  body: CANNON.Body;
  edges: Line2;
  type: "sphere" | "diamond";
  scale: number;
  originalScale: THREE.Vector3;
  originalEmissive: number;
  originalEmissiveIntensity: number;
  filePath: string;
  fileName: string;
  fileSize: string;
  isDir: boolean;
  isDisk?: boolean;
  isExiting?: boolean;
};

export type ExitAnim = {
  obj: SceneObject;
  startScale: THREE.Vector3;
  startTime: number;
  duration: number;
};

export type ScaleAnim = {
  obj: SceneObject;
  startScale: THREE.Vector3;
  endScale: THREE.Vector3;
  startTime: number;
  duration: number;
};

export type Particle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  startTime: number;
  lifetime: number;
};

export type PixelParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
};

export type Bullet = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  lastPos: THREE.Vector3;
};

export type FlightState = {
  active: boolean;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  position: THREE.Vector3;
  keys: { w: boolean; a: boolean; s: boolean; d: boolean; q: boolean; e: boolean };
  yaw: number;
  pitch: number;
  roll: number;
  cursorX: number;
  cursorY: number;
  speed: number;
  preventDrag?: (e: MouseEvent) => void;
};
