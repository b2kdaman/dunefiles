import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SceneObject, ExitAnim, ScaleAnim, Particle } from "../../animations/types";
import { updateClickParticles } from "../../animations/particles";
import { updateScaleAnimations } from "../../animations/scale-animation";
import { updateExitAnimations } from "../../animations/exit-animation";
import type { RenderPipeline } from "./renderPipeline";

type AnimationLoopOptions = {
  clock: THREE.Clock;
  fpsDiv: HTMLDivElement;
  fogLayers: THREE.Mesh[];
  exitAnimsRef: { current: ExitAnim[] };
  scaleAnimsRef: { current: ScaleAnim[] };
  particlesRef: { current: Particle[] };
  sceneObjects: SceneObject[];
  removeObject: (obj: SceneObject) => void;
  world: { step: (timeStep: number, delta: number, maxSubSteps: number) => void };
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: { update: () => void; enabled: boolean };
  labelRenderer: { domElement: HTMLElement; render: (scene: THREE.Scene, camera: THREE.Camera) => void };
  renderPipeline: RenderPipeline;
  isFlightModeActive: () => boolean;
  bloomActiveRef: { current: boolean };
};

export function startAnimationLoop({
  clock,
  fpsDiv,
  fogLayers,
  exitAnimsRef,
  scaleAnimsRef,
  particlesRef,
  sceneObjects,
  removeObject,
  world,
  scene,
  camera,
  controls,
  labelRenderer,
  renderPipeline,
  isFlightModeActive,
  bloomActiveRef,
}: AnimationLoopOptions) {
  let animationId = 0;
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let currentFps = 0;

  const occlusionRaycaster = new THREE.Raycaster();
  const cameraPos = new THREE.Vector3();

  const { composer, bloomComposer, blendPass, darkenNonBloomed, restoreMaterial } = renderPipeline;

  function animate() {
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const now = performance.now();

    frameCount++;
    if (now - lastFpsUpdate >= 1000) {
      currentFps = frameCount;
      frameCount = 0;
      lastFpsUpdate = now;
      fpsDiv.textContent = `${currentFps} FPS`;
    }

    fogLayers.forEach((layer) => {
      const mat = layer.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = now * 0.001;
    });

    exitAnimsRef.current = updateExitAnimations(exitAnimsRef.current, removeObject);
    scaleAnimsRef.current = updateScaleAnimations(scaleAnimsRef.current);
    particlesRef.current = updateClickParticles(scene, particlesRef.current, delta);

    world.step(1 / 120, delta, 10);

    cameraPos.copy(camera.position);

    for (const obj of sceneObjects) {
      if (!obj.isExiting) {
        obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
        obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);

        const objPos = obj.mesh.position.clone();
        const direction = objPos.sub(cameraPos).normalize();
        occlusionRaycaster.set(cameraPos, direction);

        const otherMeshes = sceneObjects.filter((o) => o !== obj && !o.isExiting).map((o) => o.mesh);
        const intersects = occlusionRaycaster.intersectObjects(otherMeshes);

        const distToObj = cameraPos.distanceTo(obj.mesh.position);
        const isOccluded = intersects.some((i) => i.distance < distToObj - 0.5);

        obj.mesh.traverse((child) => {
          if (child instanceof CSS2DObject) {
            const label = child as CSS2DObject;
            label.element.style.opacity = isOccluded ? "0.2" : "1";
          }
        });
      }
      obj.edges.position.copy(obj.mesh.position);
      obj.edges.quaternion.copy(obj.mesh.quaternion);
      obj.edges.scale.copy(obj.mesh.scale);
    }

    if (!isFlightModeActive()) {
      controls.update();
    }

    if (bloomActiveRef.current) {
      scene.traverse(darkenNonBloomed);
      bloomComposer.render();
      scene.traverse(restoreMaterial);
      blendPass.uniforms.bloomIntensity.value = 1.0;
    } else {
      blendPass.uniforms.bloomIntensity.value = 0.0;
    }

    composer.render();
    if (isFlightModeActive()) {
      labelRenderer.domElement.style.display = "none";
    } else {
      labelRenderer.domElement.style.display = "block";
      labelRenderer.render(scene, camera);
    }
  }

  animate();

  return () => {
    cancelAnimationFrame(animationId);
  };
}
