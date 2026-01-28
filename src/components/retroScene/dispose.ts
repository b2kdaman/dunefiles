import type * as THREE from "three";
import type { World as CannonWorld } from "cannon-es";
import type { SceneObject } from "../../animations/types";

export type DisposeSceneOptions = {
  scene: THREE.Scene;
  world: CannonWorld;
  sceneObjects: SceneObject[];
  controls: { dispose: () => void };
  renderer: { dispose: () => void; domElement: HTMLElement };
  fogLayers: THREE.Mesh[];
  infiniteGrid: THREE.Mesh;
  gridGeometry: THREE.PlaneGeometry;
  gridMaterial: THREE.ShaderMaterial;
  plane: THREE.Mesh;
  planeGeometry: THREE.PlaneGeometry;
  planeMaterial: THREE.Material;
  container: HTMLDivElement;
  labelRenderer: { domElement: HTMLElement };
  fpsDiv: HTMLDivElement;
  loadingOverlay: { dispose: () => void };
};

export function disposeScene({
  scene,
  world,
  sceneObjects,
  controls,
  renderer,
  fogLayers,
  infiniteGrid,
  gridGeometry,
  gridMaterial,
  plane,
  planeGeometry,
  planeMaterial,
  container,
  labelRenderer,
  fpsDiv,
  loadingOverlay,
}: DisposeSceneOptions) {
  for (const obj of sceneObjects) {
    scene.remove(obj.mesh);
    scene.remove(obj.edges);
    world.removeBody(obj.body);
  }

  controls.dispose();
  renderer.dispose();

  fogLayers.forEach((layer) => {
    scene.remove(layer);
    layer.geometry.dispose();
    (layer.material as THREE.Material).dispose();
  });

  scene.remove(infiniteGrid);
  gridGeometry.dispose();
  gridMaterial.dispose();

  scene.remove(plane);
  planeGeometry.dispose();
  planeMaterial.dispose();

  if (container.contains(renderer.domElement)) {
    container.removeChild(renderer.domElement);
  }
  if (container.contains(labelRenderer.domElement)) {
    container.removeChild(labelRenderer.domElement);
  }
  if (container.contains(fpsDiv)) {
    container.removeChild(fpsDiv);
  }

  loadingOverlay.dispose();
}
