import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { SceneObject } from "../../animations/types";
import type { DiskInfo } from "../types";
import { MIN_DISK_SCALE, MAX_DISK_SCALE } from "../constants";
import { generateId } from "../utils";
import { createThickEdges } from "./edges";
import { createLabel } from "./labels";
import { getCurrentThemePalette } from "../../theme";

export type DiskCreatorDeps = {
  scene: THREE.Scene;
  world: CANNON.World;
  sceneObjects: SceneObject[];
  defaultMaterial: CANNON.Material;
};

export function createDisk(
  deps: DiskCreatorDeps,
  disk: DiskInfo,
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  maxSize: number
): SceneObject {
  const { scene, world, sceneObjects, defaultMaterial } = deps;
  const palette = getCurrentThemePalette();

  const scale = maxSize > 0
    ? MIN_DISK_SCALE + (MAX_DISK_SCALE - MIN_DISK_SCALE) * Math.sqrt(disk.total_space / maxSize)
    : 1.0;

  const cubeSize = 1.2;
  const geo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

  const usedSpace = disk.total_space - disk.available_space;
  const percentUsed = disk.total_space > 0 ? usedSpace / disk.total_space : 0;
  const diskColor = new THREE.Color(palette.meshBaseHex).lerp(new THREE.Color(palette.primaryHex), percentUsed);

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: diskColor.getHex(),
      roughness: 0.5,
      metalness: 0.3,
      emissive: palette.meshEmissiveHex,
      emissiveIntensity: 0.2,
    })
  );
  mesh.castShadow = true;
  mesh.scale.set(scale, scale, scale);

  const body = new CANNON.Body({
    mass: scale * 7.5,
    shape: new CANNON.Box(new CANNON.Vec3(cubeSize * scale / 2, cubeSize * scale / 2, cubeSize * scale / 2)),
    material: defaultMaterial,
    linearDamping: 0.6,
    angularDamping: 0.5,
  });
  body.position.set(position.x, position.y, position.z);
  body.velocity.set(velocity.x, velocity.y, velocity.z);
  body.angularFactor.set(0, 1, 0);

  const edges = createThickEdges(geo, palette.primaryHex, Math.max(3, scale * 4), 1);
  edges.scale.set(scale, scale, scale);

  console.log(`Raw disk data for ${disk.name}:`, disk);
  console.log(`  total_space: ${disk.total_space}`);
  console.log(`  available_space: ${disk.available_space}`);

  let availableGB = disk.available_space;
  let totalGB = disk.total_space;

  if (disk.total_space > 1000000) {
    totalGB = disk.total_space / (1024 * 1024 * 1024);
    availableGB = disk.available_space / (1024 * 1024 * 1024);
  }

  console.log(`Disk ${disk.name}: ${availableGB.toFixed(1)} GB free of ${totalGB.toFixed(1)} GB total`);

  const sizeLabel = availableGB < 0.1 ? "empty" : `${availableGB.toFixed(1)} GB free`;

  mesh.add(createLabel(disk.name, sizeLabel, scale, cubeSize / 2));

  scene.add(mesh);
  scene.add(edges);
  world.addBody(body);

  const obj: SceneObject = {
    id: generateId(),
    mesh,
    body,
    edges,
    type: "sphere",
    scale,
    originalScale: new THREE.Vector3(scale, scale, scale),
    originalEmissive: palette.meshEmissiveHex,
    originalEmissiveIntensity: 0.2,
    filePath: disk.path,
    fileName: disk.name,
    fileSize: sizeLabel,
    isDir: true,
    isDisk: true,
  };
  sceneObjects.push(obj);
  return obj;
}
