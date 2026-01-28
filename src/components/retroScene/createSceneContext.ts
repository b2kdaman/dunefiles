import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export type SceneContext = {
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  clock: THREE.Clock;
};

type CreateSceneContextOptions = {
  container: HTMLDivElement;
  onRendererReady?: (renderer: THREE.WebGLRenderer) => void;
};

export function createSceneContext({ container, onRendererReady }: CreateSceneContextOptions): SceneContext {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  onRendererReady?.(renderer);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  labelRenderer.domElement.id = "label-layer";
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  const camRadius = 9.0;
  const pitch = THREE.MathUtils.degToRad(45);
  const yaw = THREE.MathUtils.degToRad(45);
  camera.position.set(
    camRadius * Math.cos(pitch) * Math.cos(yaw),
    camRadius * Math.sin(pitch),
    camRadius * Math.cos(pitch) * Math.sin(yaw)
  );
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.minDistance = 4;
  controls.maxDistance = 18;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
  controls.enablePan = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.panSpeed = 0.8;

  const clock = new THREE.Clock();

  return { renderer, labelRenderer, scene, camera, controls, clock };
}
