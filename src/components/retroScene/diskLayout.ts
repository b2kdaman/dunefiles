import * as THREE from "three";
import { diskMaxScale } from "./sizing";
import type { DiskInfo } from "./spawn";

type DiskSpawnItem = {
  disk: DiskInfo;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
};

export type DiskSpawnPlan = {
  count: number;
  maxDiskSize: number;
  maxScale: number;
  items: DiskSpawnItem[];
};

export function createDiskSpawnPlan(disks: DiskInfo[]): DiskSpawnPlan {
  const count = disks.length;
  const maxDiskSize = Math.max(...disks.map((disk) => disk.total_space), 1);
  const maxScale = diskMaxScale(maxDiskSize);

  const gridSize = Math.ceil(Math.sqrt(count));
  const spacing = 2.0;
  const offsetX = (gridSize - 1) * spacing / 2;
  const offsetZ = (gridSize - 1) * spacing / 2;

  const items = disks.map((disk, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;

    const position = new THREE.Vector3(
      col * spacing - offsetX + (Math.random() - 0.5) * 0.3,
      8 + Math.random() * 2,
      row * spacing - offsetZ + (Math.random() - 0.5) * 0.3
    );

    const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.5, -3, (Math.random() - 0.5) * 0.5);

    return { disk, position, velocity };
  });

  return { count, maxDiskSize, maxScale, items };
}
