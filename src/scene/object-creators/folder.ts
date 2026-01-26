import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { SceneObject } from "../../animations/types";
import type { FileEntry } from "../../store/sceneStore";
import { SPHERE_RADIUS } from "../constants";
import { generateId, formatSize, sizeToScale } from "../utils";
import { createThickEdges } from "./edges";
import { createLabel } from "./labels";

export type FolderCreatorDeps = {
  scene: THREE.Scene;
  world: CANNON.World;
  sceneObjects: SceneObject[];
  defaultMaterial: CANNON.Material;
};

export function createFolder(
  deps: FolderCreatorDeps,
  entry: FileEntry,
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  maxSize: number
): SceneObject {
  const { scene, world, sceneObjects, defaultMaterial } = deps;
  const scale = sizeToScale(entry.size, maxSize);
  const sizeStr = formatSize(entry.size);
  const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x442a2a, roughness: 0.65, metalness: 0.15 })
  );
  mesh.castShadow = true;
  mesh.scale.set(scale, scale, scale);

  const body = new CANNON.Body({
    mass: scale * 5,
    shape: new CANNON.Sphere(SPHERE_RADIUS * scale),
    material: defaultMaterial,
    linearDamping: 0.6,
    angularDamping: 0.5,
  });
  body.position.set(position.x, position.y, position.z);
  body.velocity.set(velocity.x, velocity.y, velocity.z);
  body.angularFactor.set(0, 1, 0);

  const edges = createThickEdges(geo, 0xff0000, scale > 0.6 ? 4 : 3, 1);
  edges.scale.set(scale, scale, scale);

  mesh.add(createLabel(entry.name, sizeStr, scale, SPHERE_RADIUS));

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
    originalEmissive: 0x000000,
    originalEmissiveIntensity: 0,
    filePath: entry.path,
    fileName: entry.name,
    fileSize: sizeStr,
    isDir: true,
  };
  sceneObjects.push(obj);
  return obj;
}
