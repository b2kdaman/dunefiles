import * as THREE from "three";
import type { SceneObject, ExitAnim } from "./types";
import { easeOutCubic } from "./easing";

/**
 * Creates an exit animation for all current scene objects.
 * Objects will scale up and fade out.
 */
export function exitCurrentObjects(
  sceneObjects: SceneObject[],
  exitAnims: ExitAnim[],
  duration: number = 400
): void {
  const now = performance.now();

  for (const obj of sceneObjects) {
    if (!obj.isExiting) {
      obj.isExiting = true;
      obj.body.type = 4; // CANNON.Body.STATIC = 4
      obj.body.velocity.set(0, 0, 0);
      obj.body.angularVelocity.set(0, 0, 0);

      exitAnims.push({
        obj,
        startScale: obj.mesh.scale.clone(),
        startTime: now,
        duration,
      });
    }
  }
}

/**
 * Updates all exit animations. Objects scale up to 10x and fade out.
 * Returns the filtered array of still-active animations.
 */
export function updateExitAnimations(
  exitAnims: ExitAnim[],
  removeObject: (obj: SceneObject) => void
): ExitAnim[] {
  const now = performance.now();

  return exitAnims.filter((anim) => {
    const t = Math.min((now - anim.startTime) / anim.duration, 1);
    const eased = easeOutCubic(t);
    const targetScale = 10;
    const newScale = anim.startScale.clone().multiplyScalar(1 + (targetScale - 1) * eased);
    anim.obj.mesh.scale.copy(newScale);
    anim.obj.edges.scale.copy(newScale);

    // Fade out material
    const mat = anim.obj.mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = 1 - eased;
    mat.transparent = true;

    if (t >= 1) {
      removeObject(anim.obj);
      return false;
    }
    return true;
  });
}
