import * as THREE from "three";
import type { SceneObject, ScaleAnim } from "./types";
import { easeOutBounce } from "./easing";

export function startScaleAnim(
  scaleAnims: ScaleAnim[],
  obj: SceneObject,
  toScale: THREE.Vector3,
  duration: number
) {
  // Remove existing animation for this object
  const existingIdx = scaleAnims.findIndex(a => a.obj === obj);
  if (existingIdx !== -1) {
    scaleAnims.splice(existingIdx, 1);
  }

  scaleAnims.push({
    obj,
    startScale: obj.mesh.scale.clone(),
    endScale: toScale,
    startTime: performance.now(),
    duration,
  });
}

export function updateScaleAnimations(scaleAnims: ScaleAnim[]): ScaleAnim[] {
  const now = performance.now();

  return scaleAnims.filter(anim => {
    if (anim.obj.isExiting) return false;

    const t = Math.min((now - anim.startTime) / anim.duration, 1);
    const eased = easeOutBounce(t);
    const newScale = new THREE.Vector3().lerpVectors(anim.startScale, anim.endScale, eased);
    anim.obj.mesh.scale.copy(newScale);
    anim.obj.edges.scale.copy(newScale);

    return t < 1;
  });
}
