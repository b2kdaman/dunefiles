import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SceneObject } from "../../animations/types";
import type { FileEntry } from "../../store/sceneStore";
import { createLabel } from "./labels";
import { formatSize } from "./format";
import { createThickEdges } from "./geometry";
import { diskSizeToScale, sizeToScale } from "./sizing";
import { DIAMOND_RADIUS, SPHERE_RADIUS } from "./constants";

type SpawnFactoryDeps = {
  scene: THREE.Scene;
  world: CANNON.World;
  defaultMaterial: CANNON.Material;
  sceneObjects: SceneObject[];
  generateId: () => string;
};

export type DiskInfo = {
  name: string;
  path: string;
  total_space: number;
  available_space: number;
};

type SpawnFactory = {
  createFolder: (entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number) => SceneObject;
  createFile: (entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number) => SceneObject;
  createDisk: (disk: DiskInfo, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number) => SceneObject;
  removeObject: (obj: SceneObject) => void;
  spawnEntries: (entries: FileEntry[]) => void;
  updateWalls: (itemCount: number, maxScale?: number) => void;
};

export function createSpawnFactory({ scene, world, defaultMaterial, sceneObjects, generateId }: SpawnFactoryDeps): SpawnFactory {
  // Invisible walls (dynamic sizing)
  let wallBodies: CANNON.Body[] = [];
  const wallHeight = 10;
  const wallThickness = 0.5;

  function updateWalls(itemCount: number, maxScale: number = 1.0) {
    // Remove old walls
    wallBodies.forEach(wall => world.removeBody(wall));
    wallBodies = [];

    // Calculate wall size based on items
    // Base size for 1-5 items, scales up with more items and larger scales
    const baseSize = 8;
    const itemFactor = Math.sqrt(itemCount) * 1.5;
    const scaleFactor = maxScale * 1.2;
    const wallSize = Math.max(baseSize, Math.min(baseSize + itemFactor + scaleFactor, 25));

    const wallShapeX = new CANNON.Box(new CANNON.Vec3(wallThickness, wallHeight, wallSize));
    const wallShapeZ = new CANNON.Box(new CANNON.Vec3(wallSize, wallHeight, wallThickness));

    const walls = [
      { shape: wallShapeX, pos: [-wallSize, wallHeight / 2 - 1.2, 0] },
      { shape: wallShapeX, pos: [wallSize, wallHeight / 2 - 1.2, 0] },
      { shape: wallShapeZ, pos: [0, wallHeight / 2 - 1.2, -wallSize] },
      { shape: wallShapeZ, pos: [0, wallHeight / 2 - 1.2, wallSize] },
    ];

    walls.forEach(({ shape, pos }) => {
      const wall = new CANNON.Body({ type: CANNON.Body.STATIC, material: defaultMaterial });
      wall.addShape(shape);
      wall.position.set(pos[0], pos[1], pos[2]);
      world.addBody(wall);
      wallBodies.push(wall);
    });

    console.log(`Updated walls: size=${wallSize.toFixed(1)}, items=${itemCount}, maxScale=${maxScale.toFixed(2)}`);
  }

  // Create folder (sphere) helper
  function createFolder(entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number): SceneObject {
    const scale = sizeToScale(entry.size, maxSize);
    const sizeStr = formatSize(entry.size);
    const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x442a2a, roughness: 0.65, metalness: 0.15 })
    );
    mesh.castShadow = true;
    mesh.scale.set(scale, scale, scale);
    mesh.userData = {
      ...mesh.userData,
      isNavigatorTarget: true,
      navigatorType: "circle",
      navigatorName: entry.name,
    };

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
    mesh.userData = { ...mesh.userData, physicsBody: body };

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

  // Create file (diamond) helper
  function createFile(entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number): SceneObject {
    const scale = sizeToScale(entry.size, maxSize);
    const geo = new THREE.OctahedronGeometry(DIAMOND_RADIUS, 0);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x4a2020,
        roughness: 0.35,
        metalness: 0.25,
        emissive: 0x200505,
        emissiveIntensity: 0.35,
      })
    );
    mesh.castShadow = true;
    mesh.scale.set(0.7 * scale, 1 * scale, 0.7 * scale);
    mesh.userData = {
      ...mesh.userData,
      isNavigatorTarget: true,
      navigatorType: "diamond",
      navigatorName: entry.name,
    };

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
    mesh.userData = { ...mesh.userData, physicsBody: body };

    const edges = createThickEdges(geo, 0xff0000, 3, 1);
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
      originalEmissive: 0x200505,
      originalEmissiveIntensity: 0.35,
      filePath: entry.path,
      fileName: entry.name,
      fileSize: sizeStr,
      isDir: false,
    };
    sceneObjects.push(obj);
    return obj;
  }

  // Create disk (cube) helper - for Windows/Linux disk drives
  function createDisk(disk: DiskInfo, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number): SceneObject {
    // Calculate scale based on total disk size
    const scale = diskSizeToScale(disk.total_space, maxSize);

    const cubeSize = 1.2;
    const geo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

    // Calculate how full the disk is (for color)
    const usedSpace = disk.total_space - disk.available_space;
    const percentUsed = disk.total_space > 0 ? usedSpace / disk.total_space : 0;
    const colorValue = Math.floor(0x3a + (0xff - 0x3a) * percentUsed);

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: (colorValue << 16) | (colorValue << 8) | 0x4a,
        roughness: 0.5,
        metalness: 0.3,
        emissive: 0x101020,
        emissiveIntensity: 0.2,
      })
    );
    mesh.castShadow = true;
    mesh.scale.set(scale, scale, scale);
    mesh.userData = {
      ...mesh.userData,
      isNavigatorTarget: true,
      navigatorType: "circle",
      navigatorName: disk.name,
    };

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
    mesh.userData = { ...mesh.userData, physicsBody: body };

    const edges = createThickEdges(geo, 0xff0000, Math.max(3, scale * 4), 1);
    edges.scale.set(scale, scale, scale);

    // Debug: Log raw disk info
    console.log(`Raw disk data for ${disk.name}:`, disk);
    console.log(`  total_space: ${disk.total_space}`);
    console.log(`  available_space: ${disk.available_space}`);

    // Format available space - values might already be in GB or different unit
    let availableGB = disk.available_space;
    let totalGB = disk.total_space;

    // If values seem to be in bytes (very large numbers), convert to GB
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
      type: "sphere", // Treat as navigable like folders
      scale,
      originalScale: new THREE.Vector3(scale, scale, scale),
      originalEmissive: 0x101020,
      originalEmissiveIntensity: 0.2,
      filePath: disk.path,
      fileName: disk.name,
      fileSize: sizeLabel,
      isDir: true, // Disks are navigable
      isDisk: true, // Mark as disk for special handling
    };
    sceneObjects.push(obj);
    return obj;
  }

  // Remove object from scene
  function removeObject(obj: SceneObject) {
    const idx = sceneObjects.indexOf(obj);
    if (idx !== -1) sceneObjects.splice(idx, 1);

    // Remove CSS2D labels (children of mesh)
    const toRemove: THREE.Object3D[] = [];
    obj.mesh.traverse((child) => {
      if (child instanceof CSS2DObject) {
        toRemove.push(child);
        // Remove the DOM element
        const css2d = child as CSS2DObject;
        if (css2d.element && css2d.element.parentNode) {
          css2d.element.parentNode.removeChild(css2d.element);
        }
      }
    });
    toRemove.forEach((child) => obj.mesh.remove(child));

    scene.remove(obj.mesh);
    scene.remove(obj.edges);
    world.removeBody(obj.body);
    obj.mesh.geometry.dispose();
    (obj.mesh.material as THREE.Material).dispose();
  }

  // Spawn entries as 3D objects
  function spawnEntries(entries: FileEntry[]) {
    const count = Math.min(entries.length, 20); // Limit to 20 objects
    const entriesToShow = entries.slice(0, count);

    // Calculate max size for scaling
    const maxSize = Math.max(...entriesToShow.map(e => e.size), 1);
    const maxScale = sizeToScale(maxSize, maxSize);

    // Update walls based on number of items and their max scale
    updateWalls(count, maxScale);

    // Tight grid spawning - objects spawn close together
    const gridSize = Math.ceil(Math.sqrt(count));
    const spacing = 1.8; // Tight spacing between objects

    for (let i = 0; i < count; i++) {
      const entry = entriesToShow[i];

      // Calculate grid position
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;

      // Center the grid around origin
      const offsetX = (gridSize - 1) * spacing / 2;
      const offsetZ = (gridSize - 1) * spacing / 2;

      // Add slight randomization to avoid perfect grid
      const randomOffset = 0.3;
      const spawnPos = new THREE.Vector3(
        col * spacing - offsetX + (Math.random() - 0.5) * randomOffset,
        5 + Math.random() * 2, // Lower variance in height
        row * spacing - offsetZ + (Math.random() - 0.5) * randomOffset
      );

      // Minimal horizontal velocity for tighter landing
      const spawnVel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        -2,
        (Math.random() - 0.5) * 0.5
      );

      if (entry.is_dir) {
        createFolder(entry, spawnPos, spawnVel, maxSize);
      } else {
        createFile(entry, spawnPos, spawnVel, maxSize);
      }
    }
  }

  return {
    createFolder,
    createFile,
    createDisk,
    removeObject,
    spawnEntries,
    updateWalls,
  };
}
