import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { SceneObject } from "../../animations/types";
import { spawnClickParticles } from "../../animations/particles";
import { startScaleAnim } from "../../animations/scale-animation";
import { getCurrentThemePalette } from "../../theme";

type InteractionOptions = {
  rendererDom: HTMLCanvasElement;
  window: Window;
  scene: THREE.Scene;
  world: CANNON.World;
  camera: THREE.PerspectiveCamera;
  controls: { enabled: boolean };
  sceneObjects: SceneObject[];
  scaleAnimsRef: ScaleAnimRef;
  particlesRef: ParticleRef;
  onNavigateIntoFolder: (path: string) => void | Promise<void>;
  onNavigateBack: () => void;
  isFlightModeActive: () => boolean;
  BLOOM_LAYER: number;
  onPickup: () => void;
  onDrop: () => void;
  onBloomStart: () => void;
  onBloomEnd: () => void;
};

type ScaleAnimArray = Parameters<typeof startScaleAnim>[0];
type ParticleArray = Parameters<typeof spawnClickParticles>[2];
type ScaleAnimRef = { current: ScaleAnimArray };
type ParticleRef = { current: ParticleArray };

export function registerInteractionHandlers({
  rendererDom,
  window,
  scene,
  world,
  camera,
  controls,
  sceneObjects,
  scaleAnimsRef,
  particlesRef,
  onNavigateIntoFolder,
  onNavigateBack,
  isFlightModeActive,
  BLOOM_LAYER,
  onPickup,
  onDrop,
  onBloomStart,
  onBloomEnd,
}: InteractionOptions) {
  const palette = getCurrentThemePalette();
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersection = new THREE.Vector3();
  let draggedObject: SceneObject | null = null;
  let dragConstraint: CANNON.PointToPointConstraint | null = null;

  const mouseBody = new CANNON.Body({ mass: 0 });
  world.addBody(mouseBody);

  function onMouseDown(event: MouseEvent) {
    if (isFlightModeActive()) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshes = sceneObjects.filter(o => !o.isExiting).map(o => o.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const hitObj = sceneObjects.find(o => o.mesh === hitMesh);

      if (hitObj && !hitObj.isExiting && !hitObj.isDisk) {
        const scaleAnims = scaleAnimsRef.current;
        controls.enabled = false;
        draggedObject = hitObj;

        onPickup();
        spawnClickParticles(scene, hitObj.mesh.position.clone(), particlesRef.current as ParticleArray);

        const bigScale = hitObj.originalScale.clone().multiplyScalar(1.3);
        startScaleAnim(scaleAnims as ScaleAnimArray, hitObj, bigScale, 400);

        const mat = hitObj.mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(palette.primaryHex);
        mat.emissiveIntensity = 3.5;
        hitObj.mesh.layers.enable(BLOOM_LAYER);
        hitObj.edges.layers.enable(BLOOM_LAYER);
        onBloomStart();

        dragPlane.constant = -hitObj.body.position.y;
        const hitPoint = intersects[0].point;
        mouseBody.position.set(hitPoint.x, hitPoint.y, hitPoint.z);
        dragConstraint = new CANNON.PointToPointConstraint(
          hitObj.body,
          new CANNON.Vec3(0, 0, 0),
          mouseBody,
          new CANNON.Vec3(0, 0, 0),
          50
        );
        world.addConstraint(dragConstraint);
      }
    }
  }

  function onDoubleClick(event: MouseEvent) {
    if (isFlightModeActive()) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshes = sceneObjects.filter(o => !o.isExiting).map(o => o.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const hitObj = sceneObjects.find(o => o.mesh === hitMesh);

      if (hitObj && !hitObj.isExiting && hitObj.isDir) {
        onNavigateIntoFolder(hitObj.filePath);
      }
    }
  }

  function onMouseMove(event: MouseEvent) {
    if (isFlightModeActive()) return;
    if (!draggedObject || !dragConstraint) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
      mouseBody.position.set(intersection.x, intersection.y, intersection.z);
    }
  }

  function onMouseUp() {
    if (isFlightModeActive()) return;
    if (draggedObject) {
      onDrop();
      startScaleAnim(scaleAnimsRef.current as ScaleAnimArray, draggedObject, draggedObject.originalScale, 400);
      const mat = draggedObject.mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(draggedObject.originalEmissive);
      mat.emissiveIntensity = draggedObject.originalEmissiveIntensity;

      draggedObject.mesh.layers.disable(BLOOM_LAYER);
      draggedObject.edges.layers.disable(BLOOM_LAYER);
      onBloomEnd();
    }
    if (dragConstraint) {
      world.removeConstraint(dragConstraint);
      dragConstraint = null;
    }
    draggedObject = null;
    controls.enabled = true;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isFlightModeActive()) return;
    if (event.key === "Escape" || event.key === "Backspace") {
      event.preventDefault();
      onNavigateBack();
    }
  }

  rendererDom.addEventListener("mousedown", onMouseDown);
  rendererDom.addEventListener("mousemove", onMouseMove);
  rendererDom.addEventListener("mouseup", onMouseUp);
  rendererDom.addEventListener("mouseleave", onMouseUp);
  rendererDom.addEventListener("dblclick", onDoubleClick);
  window.addEventListener("keydown", onKeyDown);

  return () => {
    rendererDom.removeEventListener("mousedown", onMouseDown);
    rendererDom.removeEventListener("mousemove", onMouseMove);
    rendererDom.removeEventListener("mouseup", onMouseUp);
    rendererDom.removeEventListener("mouseleave", onMouseUp);
    rendererDom.removeEventListener("dblclick", onDoubleClick);
    window.removeEventListener("keydown", onKeyDown);
    world.removeBody(mouseBody);
  };
}
