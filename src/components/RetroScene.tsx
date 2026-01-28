import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { invoke } from "@tauri-apps/api/core";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { useSceneStore, type FileEntry } from "../store/sceneStore";
import type { Settings } from "../types";
import RetroSceneOverlays from "./retroScene/Overlays";
import { createLoadingOverlay, createFpsCounter } from "./retroScene/dom";
import { createThickEdges } from "./retroScene/geometry";
import { updateLabelFontSizes } from "./retroScene/labels";
import { createFogShader, createInfiniteGridShader } from "./retroScene/shaders";
import { diskMaxScale } from "./retroScene/sizing";
import { BLOOM_LAYER } from "./retroScene/constants";
import { createRenderPipeline } from "./retroScene/renderPipeline";
import { createSpawnFactory, type DiskInfo } from "./retroScene/spawn";

// Animation modules
import type { SceneObject, ExitAnim, ScaleAnim, Particle } from "../animations/types";
// Easing functions are used by imported animation modules
import { spawnClickParticles, updateClickParticles } from "../animations/particles";
import { startScaleAnim, updateScaleAnimations } from "../animations/scale-animation";
import { exitCurrentObjects, updateExitAnimations } from "../animations/exit-animation";
import { loadMechaAnimation } from "../animations/mecha-animation";
import { isFlightModeActive } from "../animations/flight-mode";
import {
  initSoundSystem,
  ensureAudio,
  playPickup,
  playDrop,
  playNavigateIn,
  playNavigateBack,
  playSpawn,
  playLand,
} from "../animations/sound-effects";


interface RetroSceneProps {
  settings: Settings;
  onRendererReady?: (renderer: THREE.WebGLRenderer) => void;
}


let objectIdCounter = 0;
function generateId() {
  return `obj_${objectIdCounter++}`;
}

export default function RetroScene({ settings, onRendererReady }: RetroSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ditherPassRef = useRef<ShaderPass | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    world: CANNON.World;
    sceneObjects: SceneObject[];
    createFolder: (entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number) => SceneObject;
    createFile: (entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number) => SceneObject;
    removeObject: (obj: SceneObject) => void;
    spawnEntries: (entries: FileEntry[]) => void;
    exitAnims: ExitAnim[];
    returnToComputer: () => Promise<void>;
  } | null>(null);

  const { navigateTo, goBack, canGoBack, currentPath } = useSceneStore();
  const navigateBackRef = useRef<(() => void) | null>(null);
  const loadDirectoryRef = useRef<((path: string) => Promise<void>) | null>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const loadMechaRef = useRef<(() => void) | null>(null);
  const [showMechaButton, setShowMechaButton] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Renderer
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
    rendererRef.current = renderer;
    onRendererReady?.(renderer);

    const fpsDiv = createFpsCounter(container);
    const loadingOverlay = createLoadingOverlay(container);
    let loadingToken = 0;
    const showLoading = (autoHideMs: number = 0) => {
      loadingToken += 1;
      const token = loadingToken;
      loadingOverlay.show();
      if (autoHideMs > 0) {
        setTimeout(() => {
          if (loadingToken === token) {
            loadingOverlay.hide();
          }
        }, autoHideMs);
      }
    };
    const hideLoading = () => {
      loadingToken += 1;
      loadingOverlay.hide();
    };

    // Initialize sound system from animation module
    initSoundSystem();

    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let currentFps = 0;

    // CSS2D Renderer for labels
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    labelRenderer.domElement.id = "label-layer";
    container.appendChild(labelRenderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050101, 0.065);
    scene.background = new THREE.Color(0x050101);

    // Camera
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

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.minDistance = 4;
    controls.maxDistance = 18;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(80);

    // Enable panning with middle mouse button
    controls.enablePan = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE
    };
    controls.panSpeed = 0.8;

    // Physics world
    const world = new CANNON.World();
    world.gravity.set(0, -25, 0);
    world.broadphase = new CANNON.NaiveBroadphase();

    const defaultMaterial = new CANNON.Material("default");
    const contactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
      friction: 0.4,
      restitution: 0.15,
    });
    world.addContactMaterial(contactMaterial);
    world.defaultContactMaterial = contactMaterial;

    // Lights
    scene.add(new THREE.AmbientLight(0xff4444, 0.4));

    const key = new THREE.DirectionalLight(0xff6666, 2.0);
    key.position.set(3, 6, 2);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xff3333, 0.8);
    rim.position.set(-5, 2, -6);
    scene.add(rim);

    const pointLight = new THREE.PointLight(0xff2222, 1.5, 20);
    pointLight.position.set(0, 3, 0);
    scene.add(pointLight);

    // Ground
    const planeGeo = new THREE.PlaneGeometry(30, 30, 1, 1);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x170b0b, roughness: 0.98, metalness: 0.02 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -1.2;
    plane.receiveShadow = true;
    scene.add(plane);

    // Volumetric ground fog - multiple layers with gradient
    const fogShader = createFogShader();

    // Create multiple fog layers for volumetric effect
    const fogLayers: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const layerHeight = i * 0.6;
      const fogGeometry = new THREE.PlaneGeometry(40, 40, 48, 48);

      // Create vertices with height variation for volumetric look
      const positions = fogGeometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        const z = positions.getZ(j);
        positions.setZ(j, z + (Math.random() - 0.5) * 0.3);
      }
      positions.needsUpdate = true;

      const fogMaterial = new THREE.ShaderMaterial({
        uniforms: {
          fogColor: { value: new THREE.Color(0x3a0808) },
          time: { value: 0 },
          layerHeight: { value: layerHeight },
        },
        vertexShader: fogShader.vertexShader,
        fragmentShader: fogShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const fogPlane = new THREE.Mesh(fogGeometry, fogMaterial);
      fogPlane.rotation.x = -Math.PI / 2;
      fogPlane.position.y = -0.9 + layerHeight;
      fogPlane.userData = { ...fogPlane.userData, isFogLayer: true };
      scene.add(fogPlane);
      fogLayers.push(fogPlane);
    }

    const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: defaultMaterial });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.y = -1.2;
    world.addBody(groundBody);

    // Play sound on ground collision
    const recentLands = new Set<number>();
    groundBody.addEventListener("collide", (event: { body: CANNON.Body }) => {
      const bodyId = event.body.id;
      if (!recentLands.has(bodyId)) {
        recentLands.add(bodyId);
        playLand();
        setTimeout(() => recentLands.delete(bodyId), 300);
      }
    });

    // All scene objects
    const sceneObjects: SceneObject[] = [];
    const { createFolder, createFile, createDisk, removeObject, spawnEntries, updateWalls } = createSpawnFactory({
      scene,
      world,
      defaultMaterial,
      sceneObjects,
      generateId,
    });

    // Initialize with default walls
    updateWalls(5, 1.0);

    // Infinite grid shader - red squares extending to horizon
    const infiniteGridShader = createInfiniteGridShader();

    const gridGeometry = new THREE.PlaneGeometry(200, 200);
    const gridMaterial = new THREE.ShaderMaterial({
      uniforms: infiniteGridShader.uniforms,
      vertexShader: infiniteGridShader.vertexShader,
      fragmentShader: infiniteGridShader.fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const infiniteGrid = new THREE.Mesh(gridGeometry, gridMaterial);
    infiniteGrid.rotation.x = -Math.PI / 2;
    infiniteGrid.position.y = -1.195;
    scene.add(infiniteGrid);

    // Exit animations state (uses imported functions)
    let exitAnims: ExitAnim[] = [];

    // Load directory contents from Rust backend
    async function loadDirectory(path: string) {
      showLoading(1500);
      try {
        const entries = await invoke<FileEntry[]>("list_directory", { path });

        // Save current camera position and object states
        const cameraPosition = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const cameraTarget = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
        const objectStates = sceneObjects.map(obj => ({
          id: obj.id,
          position: { x: obj.body.position.x, y: obj.body.position.y, z: obj.body.position.z },
          rotation: { x: obj.body.quaternion.x, y: obj.body.quaternion.y, z: obj.body.quaternion.z, w: obj.body.quaternion.w },
        }));

        navigateTo(path, entries, { cameraPosition, cameraTarget, objectStates });
        exitCurrentObjects(sceneObjects, exitAnims);
        setTimeout(() => {
          if (entries.length > 0) playSpawn();
          spawnEntries(entries);
          hideLoading();
        }, 200);
      } catch (err) {
        console.error("Failed to load directory:", err);
        hideLoading();
      }
    }

    // Navigate into a folder
    async function navigateIntoFolder(folderPath: string) {
      playNavigateIn();
      await loadDirectory(folderPath);
    }

    // Go back to previous state
    function navigateBack() {
      const previous = goBack();
      if (previous) {
        playNavigateBack();
        exitCurrentObjects(sceneObjects, exitAnims, 300);
        setTimeout(() => {
          if (previous.entries.length > 0) playSpawn();
          spawnEntries(previous.entries);

          // Restore camera position if saved
          if (previous.cameraPosition) {
            camera.position.set(previous.cameraPosition.x, previous.cameraPosition.y, previous.cameraPosition.z);
          }
          if (previous.cameraTarget) {
            controls.target.set(previous.cameraTarget.x, previous.cameraTarget.y, previous.cameraTarget.z);
          }
        }, 150);
      }
    }

    // Function to return to Computer view (disks) without sound
    async function returnToComputer() {
      showLoading(1500);
      try {
        const disks = await invoke<DiskInfo[]>("get_disks");

        // Clear history and exit current objects
        const { clearHistory } = useSceneStore.getState();
        clearHistory();
        exitCurrentObjects(sceneObjects, exitAnims, 300);

        setTimeout(async () => {
          if (disks.length > 0) {
            // Show disks WITHOUT playing spawn sound
            const count = disks.length;
            const maxDiskSize = Math.max(...disks.map(d => d.total_space), 1);

            const maxScale = diskMaxScale(maxDiskSize);

            updateWalls(count, maxScale);

            const gridSize = Math.ceil(Math.sqrt(count));
            const spacing = 2.0;

            for (let i = 0; i < count; i++) {
              const disk = disks[i];
              const row = Math.floor(i / gridSize);
              const col = i % gridSize;
              const offsetX = (gridSize - 1) * spacing / 2;
              const offsetZ = (gridSize - 1) * spacing / 2;

              const spawnPos = new THREE.Vector3(
                col * spacing - offsetX + (Math.random() - 0.5) * 0.3,
                8 + Math.random() * 2,
                row * spacing - offsetZ + (Math.random() - 0.5) * 0.3
              );

              const spawnVel = new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                -3,
                (Math.random() - 0.5) * 0.5
              );

              createDisk(disk, spawnPos, spawnVel, maxDiskSize);
            }
            navigateTo("", []);
          }
          hideLoading();
        }, 200);
      } catch (err) {
        console.error("Failed to load disks:", err);
        hideLoading();
      }
    }

    // Load mecha model - uses extracted animation module
    function loadMecha() {
      ensureAudio();
      setShowMechaButton(false);
      loadMechaAnimation(
        scene,
        camera,
        controls,
        renderer,
        createThickEdges,
        BLOOM_LAYER,
        () => {
          setShowMechaButton(true);
        }
      );
    }

    // Store ref for external access
    sceneRef.current = { scene, world, sceneObjects, createFolder, createFile, removeObject, spawnEntries, exitAnims, returnToComputer };
    navigateBackRef.current = navigateBack;
    loadDirectoryRef.current = loadDirectory;
    loadMechaRef.current = loadMecha;

    // Load initial disks/home directory
    (async () => {
      try {
        const disks = await invoke<DiskInfo[]>("get_disks");
        const isMac = navigator.platform.toLowerCase().includes("mac");

        if (isMac && disks.length > 0) {
          // On Mac, load home directory directly
          await loadDirectory(disks[0].path);
        } else if (disks.length > 0) {
          // On Windows/Linux, show disks as cubes falling from the top
          playSpawn();
          const count = disks.length;

          // Calculate max disk size for scaling
          const maxDiskSize = Math.max(...disks.map(d => d.total_space), 1);

          // Calculate max scale for disks
          const maxScale = diskMaxScale(maxDiskSize);

          // Update walls for disks
          updateWalls(count, maxScale);

          // Tight grid spawning for disks
          const gridSize = Math.ceil(Math.sqrt(count));
          const spacing = 2.0;

          for (let i = 0; i < count; i++) {
            const disk = disks[i];

            // Calculate grid position
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;

            // Center the grid around origin
            const offsetX = (gridSize - 1) * spacing / 2;
            const offsetZ = (gridSize - 1) * spacing / 2;

            // Spawn from higher up to create falling effect
            const spawnPos = new THREE.Vector3(
              col * spacing - offsetX + (Math.random() - 0.5) * 0.3,
              8 + Math.random() * 2,
              row * spacing - offsetZ + (Math.random() - 0.5) * 0.3
            );

            // Minimal horizontal velocity
            const spawnVel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              -3,
              (Math.random() - 0.5) * 0.5
            );

            createDisk(disk, spawnPos, spawnVel, maxDiskSize);
          }
          // Store empty path as current
          navigateTo("", []);
        }
      } catch (err) {
        console.error("Failed to load disks:", err);
      }
    })();

    // Interaction state
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    let draggedObject: SceneObject | null = null;
    let dragConstraint: CANNON.PointToPointConstraint | null = null;

    const mouseBody = new CANNON.Body({ mass: 0 });
    world.addBody(mouseBody);

    // Scale animations state (uses imported functions)
    let scaleAnims: ScaleAnim[] = [];

    // Particle system state (uses imported functions)
    let particles: Particle[] = [];

    // Mouse handlers
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

        // Don't allow dragging disks (cubes)
        if (hitObj && !hitObj.isExiting && !hitObj.isDisk) {
          controls.enabled = false;
          draggedObject = hitObj;

          playPickup();

          // Spawn click particles
          spawnClickParticles(scene, hitObj.mesh.position.clone(), particles);

          // Scale up for dragging
          const bigScale = hitObj.originalScale.clone().multiplyScalar(1.3);
          startScaleAnim(scaleAnims, hitObj, bigScale, 400);

          // Glow
          const mat = hitObj.mesh.material as THREE.MeshStandardMaterial;
          mat.emissive.setHex(0xff0000);
          mat.emissiveIntensity = 3.5;
          hitObj.mesh.layers.enable(BLOOM_LAYER);
          hitObj.edges.layers.enable(BLOOM_LAYER);
          bloomActive = true;

          // Drag constraint
          dragPlane.constant = -hitObj.body.position.y;
          const hitPoint = intersects[0].point;
          mouseBody.position.set(hitPoint.x, hitPoint.y, hitPoint.z);
          dragConstraint = new CANNON.PointToPointConstraint(hitObj.body, new CANNON.Vec3(0, 0, 0), mouseBody, new CANNON.Vec3(0, 0, 0), 50);
          world.addConstraint(dragConstraint);
        }
      }
    }

    // Double-click to navigate into folders (spheres)
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
          navigateIntoFolder(hitObj.filePath);
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
        playDrop();
        startScaleAnim(scaleAnims, draggedObject, draggedObject.originalScale, 400);
        const mat = draggedObject.mesh.material as THREE.MeshStandardMaterial;

        // Restore original colors
        mat.emissive.setHex(draggedObject.originalEmissive);
        mat.emissiveIntensity = draggedObject.originalEmissiveIntensity;

        draggedObject.mesh.layers.disable(BLOOM_LAYER);
        draggedObject.edges.layers.disable(BLOOM_LAYER);
        bloomActive = false;
      }
      if (dragConstraint) {
        world.removeConstraint(dragConstraint);
        dragConstraint = null;
      }
      draggedObject = null;
      controls.enabled = true;
    }

    // Keyboard handler for back navigation
    function onKeyDown(event: KeyboardEvent) {
      if (isFlightModeActive()) return;
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        navigateBack();
      }
    }

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("mouseleave", () => onMouseUp());
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown);

    // Bloom setup
    const renderPipeline = createRenderPipeline(renderer, scene, camera, BLOOM_LAYER);
    const { composer, bloomComposer, blendPass, ditherPass, darkenNonBloomed, restoreMaterial } = renderPipeline;
    ditherPassRef.current = ditherPass;

    let bloomActive = false;

    // Animation loop
    const clock = new THREE.Clock();
    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const now = performance.now();

      // FPS
      frameCount++;
      if (now - lastFpsUpdate >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
        fpsDiv.textContent = `${currentFps} FPS`;
      }

      // Update fog animation for all layers
      fogLayers.forEach(layer => {
        const mat = layer.material as THREE.ShaderMaterial;
        mat.uniforms.time.value = now * 0.001;
      });

      // Exit animations (scale up to 10x and remove) - uses imported function
      exitAnims = updateExitAnimations(exitAnims, removeObject);

      // Scale animations - uses imported function
      scaleAnims = updateScaleAnimations(scaleAnims);

      // Particle animations - uses imported function
      particles = updateClickParticles(scene, particles, delta);

      // Physics
      world.step(1 / 120, delta, 10);

      // Sync all objects and update label occlusion
      const occlusionRaycaster = new THREE.Raycaster();
      const cameraPos = camera.position.clone();

      for (const obj of sceneObjects) {
        if (!obj.isExiting) {
          obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
          obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);

          // Check label occlusion
          const objPos = obj.mesh.position.clone();
          const direction = objPos.sub(cameraPos).normalize();
          occlusionRaycaster.set(cameraPos, direction);

          const otherMeshes = sceneObjects
            .filter(o => o !== obj && !o.isExiting)
            .map(o => o.mesh);
          const intersects = occlusionRaycaster.intersectObjects(otherMeshes);

          // Get distance to this object
          const distToObj = cameraPos.distanceTo(obj.mesh.position);

          // Check if something is in front
          const isOccluded = intersects.some(i => i.distance < distToObj - 0.5);

          // Update label opacity
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

      // Bloom
      if (bloomActive) {
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

    // Resize
    function handleResize() {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      renderer.setSize(newWidth, newHeight);
      labelRenderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderPipeline.setSize(newWidth, newHeight);

      // Update edge line materials resolution
      for (const obj of sceneObjects) {
        const lineMat = obj.edges.material as LineMaterial;
        lineMat.resolution.set(newWidth, newHeight);
      }

      // Update label font sizes
      const screenScale = Math.min(newWidth, newHeight) / 1000;
      updateLabelFontSizes(sceneObjects, screenScale);

      // Update React state to trigger re-render of UI elements
      setWindowSize({ width: newWidth, height: newHeight });
    }
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("mouseleave", onMouseUp);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      for (const obj of sceneObjects) {
        scene.remove(obj.mesh);
        scene.remove(obj.edges);
        world.removeBody(obj.body);
      }
      controls.dispose();
      renderer.dispose();
      fogLayers.forEach(layer => {
        scene.remove(layer);
        layer.geometry.dispose();
        (layer.material as THREE.Material).dispose();
      });
      scene.remove(infiniteGrid);
      gridGeometry.dispose();
      gridMaterial.dispose();
      container.removeChild(renderer.domElement);
      container.removeChild(labelRenderer.domElement);
      container.removeChild(fpsDiv);
      loadingOverlay.dispose();
      // Sound system cleanup is handled by the sound-effects module
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRendererReady]);

  // Update shader uniforms
  useEffect(() => {
    if (ditherPassRef.current) {
      ditherPassRef.current.uniforms.pixelSize.value = settings.pixel_size;
      ditherPassRef.current.uniforms.ditherStrength.value = settings.dither_strength;
      ditherPassRef.current.uniforms.gloom.value = settings.gloom;
      ditherPassRef.current.uniforms.contrast.value = settings.contrast;
    }
  }, [settings]);

  const handleBack = () => {
    if (navigateBackRef.current && canGoBack) {
      navigateBackRef.current();
    }
  };

  // Parse breadcrumbs from currentPath
  const getBreadcrumbs = () => {
    const breadcrumbs = [{ name: "Computer", path: "" }]; // Always start with Computer

    if (currentPath) {
      const parts = currentPath.split(/[/\\]/).filter(Boolean);
      let accumulated = "";
      for (let i = 0; i < parts.length; i++) {
        accumulated += (accumulated ? "/" : "") + parts[i];
        breadcrumbs.push({ name: parts[i], path: accumulated });
      }
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  // Navigate to Computer view (disks) - without sound
  const navigateToComputer = async () => {
    if (sceneRef.current?.returnToComputer) {
      await sceneRef.current.returnToComputer();
    }
  };

  return (
    <>
      <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      <RetroSceneOverlays
        breadcrumbs={breadcrumbs}
        windowSize={windowSize}
        canGoBack={canGoBack}
        currentPath={currentPath}
        onNavigateBack={handleBack}
        onNavigateToComputer={navigateToComputer}
        onLoadDirectory={(path) => loadDirectoryRef.current?.(path)}
        onLoadMecha={() => loadMechaRef.current?.()}
        showMechaButton={showMechaButton}
      />
    </>
  );
}
