import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Line2 } from "three/examples/jsm/lines/Line2.js";
import { easeInCubic, easeInOutCubic } from "./easing";

/**
 * Animate camera to focus on a target position before mecha appears.
 */
export function focusCameraOnTarget(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  targetCenter: THREE.Vector3,
  focusPosition: THREE.Vector3,
  duration: number = 1000,
  onComplete: () => void
): void {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const focusStartTime = performance.now();

  function animate() {
    const elapsed = performance.now() - focusStartTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(t);

    camera.position.lerpVectors(startPos, focusPosition, eased);
    controls.target.lerpVectors(startTarget, targetCenter, eased);
    camera.lookAt(controls.target);

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      onComplete();
    }
  }

  animate();
}

/**
 * Orbit camera in a full circle around a center point.
 */
export function orbitCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  center: THREE.Vector3,
  orbitRadius: number = 12,
  duration: number = 1500,
  onComplete: () => void
): void {
  const orbitStartTime = performance.now();

  function animate() {
    const elapsed = performance.now() - orbitStartTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeInCubic(t);

    // Half circle (PI radians) for a shorter orbit
    const angle = eased * Math.PI;

    // Camera orbits at same Y level as model center
    camera.position.x = center.x + Math.sin(angle) * orbitRadius;
    camera.position.y = center.y;
    camera.position.z = center.z + Math.cos(angle) * orbitRadius;

    // Keep looking at center
    controls.target.copy(center);
    camera.lookAt(controls.target);

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      onComplete();
    }
  }

  animate();
}

/**
 * Transition camera from orbit position into cockpit view.
 * Fades out mecha as camera enters.
 */
export function transitionToCockpit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  mecha: THREE.Group,
  mechaMaterials: THREE.MeshStandardMaterial[],
  edgeLines: Line2[],
  center: THREE.Vector3,
  duration: number = 1500,
  onComplete: () => void
): void {
  const transitionStart = performance.now();
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();

  // End position: behind mecha, slightly above center
  const cockpitOffset = new THREE.Vector3(0, 0.0, -1.2);
  const endPos = center.clone().add(cockpitOffset);
  const endTarget = center.clone().add(new THREE.Vector3(0, 1, 10)); // Looking forward

  function animate() {
    const elapsed = performance.now() - transitionStart;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(t);

    camera.position.lerpVectors(startPos, endPos, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    camera.lookAt(controls.target);

    // Fade out mecha as we enter cockpit
    if (t > 0.5) {
      const fadeT = (t - 0.5) * 2;
      mechaMaterials.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = 1 - fadeT;
      });
      edgeLines.forEach((edge) => {
        (edge.material as LineMaterial).opacity = 1 - fadeT;
      });
    }

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      // Hide mecha completely
      mecha.visible = false;
      onComplete();
    }
  }

  animate();
}

/**
 * Reset camera to default orbital view.
 */
export function resetCameraToDefault(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  camRadius: number = 9.0,
  pitch: number = Math.PI / 4, // 45 degrees
  yaw: number = Math.PI / 4 // 45 degrees
): void {
  camera.position.set(
    camRadius * Math.cos(pitch) * Math.cos(yaw),
    camRadius * Math.sin(pitch),
    camRadius * Math.cos(pitch) * Math.sin(yaw)
  );
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
}
