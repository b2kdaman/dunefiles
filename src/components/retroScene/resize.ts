import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { updateLabelFontSizes } from "./labels";
import type { SceneObject } from "../../animations/types";

type ResizeHandlerOptions = {
  window: Window;
  renderer: { setSize: (width: number, height: number) => void };
  labelRenderer: { setSize: (width: number, height: number) => void };
  camera: { aspect: number; updateProjectionMatrix: () => void };
  renderPipeline: { setSize: (width: number, height: number) => void };
  sceneObjects: SceneObject[];
  onResize?: (size: { width: number; height: number }) => void;
};

export function registerResizeHandler({
  window,
  renderer,
  labelRenderer,
  camera,
  renderPipeline,
  sceneObjects,
  onResize,
}: ResizeHandlerOptions) {
  function handleResize() {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    renderer.setSize(newWidth, newHeight);
    labelRenderer.setSize(newWidth, newHeight);
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderPipeline.setSize(newWidth, newHeight);

    for (const obj of sceneObjects) {
      const lineMat = obj.edges.material as LineMaterial;
      lineMat.resolution.set(newWidth, newHeight);
    }

    const screenScale = Math.min(newWidth, newHeight) / 1000;
    updateLabelFontSizes(sceneObjects, screenScale);

    onResize?.({ width: newWidth, height: newHeight });
  }

  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
  };
}
