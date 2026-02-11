import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { SceneObject } from "../../animations/types";
import type { FileEntry } from "../../store/sceneStore";
import { DIAMOND_RADIUS } from "../constants";
import { generateId, formatSize, sizeToScale } from "../utils";
import { createThickEdges } from "./edges";
import { createLabel } from "./labels";
import { getCurrentThemePalette } from "../../theme";

export type FileCreatorDeps = {
  scene: THREE.Scene;
  world: CANNON.World;
  sceneObjects: SceneObject[];
  defaultMaterial: CANNON.Material;
};

export function createFile(
  deps: FileCreatorDeps,
  entry: FileEntry,
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  maxSize: number
): SceneObject {
  const { scene, world, sceneObjects, defaultMaterial } = deps;
  const palette = getCurrentThemePalette();
  const fileColor = new THREE.Color(palette.meshBaseHex).lerp(new THREE.Color(palette.softHex), 0.55).getHex();
  const scale = sizeToScale(entry.size, maxSize);
  const geo = new THREE.OctahedronGeometry(DIAMOND_RADIUS, 0);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: fileColor,
      roughness: 0.35,
      metalness: 0.25,
      emissive: palette.meshEmissiveHex,
      emissiveIntensity: 0.42,
    })
  );
  mesh.castShadow = true;
  mesh.scale.set(0.7 * scale, 1 * scale, 0.7 * scale);

  const body = new CANNON.Body({
    mass: scale * 5,
    shape: new CANNON.Sphere(DIAMOND_RADIUS * scale * 1.2),
    material: defaultMaterial,
    linearDamping: 0.6,
    angularDamping: 0.5,
  });
  body.position.set(position.x, position.y, position.z);
  body.velocity.set(velocity.x, velocity.y, velocity.z);
  body.angularFactor.set(0, 1, 0);

  const edges = createThickEdges(geo, palette.primaryHex, 3, 1);
  edges.scale.set(0.7 * scale, 1 * scale, 0.7 * scale);

  const sizeStr = formatSize(entry.size);
  mesh.add(createLabel(entry.name, sizeStr, scale, DIAMOND_RADIUS));

  scene.add(mesh);
  scene.add(edges);
  world.addBody(body);

  const obj: SceneObject = {
    id: generateId(),
    mesh,
    body,
    edges,
    type: "diamond",
    scale,
    originalScale: new THREE.Vector3(0.7 * scale, 1 * scale, 0.7 * scale),
    originalEmissive: palette.meshEmissiveHex,
    originalEmissiveIntensity: 0.42,
    filePath: entry.path,
    fileName: entry.name,
    fileSize: sizeStr,
    isDir: false,
  };
  sceneObjects.push(obj);
  return obj;
}
