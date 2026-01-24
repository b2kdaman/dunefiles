import { useEffect, useRef } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { useSceneStore, type ObjectData } from "../store/sceneStore";
import type { Settings } from "../types";

const BLOOM_LAYER = 1;

interface RetroSceneProps {
  settings: Settings;
  onRendererReady?: (renderer: THREE.WebGLRenderer) => void;
}

type SceneObject = {
  id: string;
  mesh: THREE.Mesh;
  body: CANNON.Body;
  edges: Line2;
  type: "sphere" | "diamond";
  scale: number;
  originalScale: THREE.Vector3;
  originalEmissive: number;
  originalEmissiveIntensity: number;
  hasLabel: boolean;
  labelName: string;
  labelSize: string;
  isExiting?: boolean;
};

const DitherPixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    pixelSize: { value: 3.0 },
    ditherStrength: { value: 0.85 },
    gloom: { value: 0.12 },
    contrast: { value: 1.15 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    uniform float ditherStrength;
    uniform float gloom;
    uniform float contrast;
    varying vec2 vUv;

    float bayer4(vec2 p) {
      vec2 P = floor(mod(p, 4.0));
      float a = mod(P.x + P.y * 2.0, 4.0);
      float b = mod(P.x / 2.0 + P.y, 2.0);
      return (a * 4.0 + b) / 16.0 + 0.03125;
    }

    vec3 applyContrast(vec3 c, float k) {
      return (c - 0.5) * k + 0.5;
    }

    void main() {
      vec2 fragCoord = vUv * resolution;
      vec2 snapped = floor(fragCoord / pixelSize) * pixelSize;
      vec2 uv2 = (snapped + 0.5) / resolution;

      vec3 col = texture2D(tDiffuse, uv2).rgb;

      col = applyContrast(col, contrast);
      col *= (1.0 - gloom);

      float t = bayer4(snapped / pixelSize);

      float levels = 6.0;
      vec3 q = floor(col * levels + (t - 0.5) * ditherStrength) / levels;

      gl_FragColor = vec4(clamp(q, 0.0, 1.0), 1.0);
    }
  `,
};

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
    createSphere: (scale: number, position: THREE.Vector3, velocity: THREE.Vector3, hasLabel?: boolean, labelName?: string, labelSize?: string) => SceneObject;
    createDiamond: (scale: number, position: THREE.Vector3, velocity: THREE.Vector3, hasLabel?: boolean, labelName?: string, labelSize?: string) => SceneObject;
    removeObject: (obj: SceneObject) => void;
    exitAnims: ExitAnim[];
  } | null>(null);

  const { pushState, goBack, canGoBack } = useSceneStore();
  const navigateBackRef = useRef<(() => void) | null>(null);

  type ExitAnim = {
    obj: SceneObject;
    startScale: THREE.Vector3;
    startTime: number;
    duration: number;
  };

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

    // FPS counter
    const fpsDiv = document.createElement("div");
    fpsDiv.style.cssText = `
      position: absolute;
      top: 12px;
      left: 12px;
      color: #ff4444;
      font: 14px ui-monospace, monospace;
      z-index: 100;
      pointer-events: none;
    `;
    container.appendChild(fpsDiv);
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

    // Physics world
    const world = new CANNON.World();
    world.gravity.set(0, -25, 0);
    world.broadphase = new CANNON.NaiveBroadphase();

    const defaultMaterial = new CANNON.Material("default");
    const contactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
      friction: 0.3,
      restitution: 0.7,
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

    const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: defaultMaterial });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.y = -1.2;
    world.addBody(groundBody);

    // Invisible walls
    const wallSize = 6;
    const wallHeight = 10;
    const wallThickness = 0.5;
    const wallShapeX = new CANNON.Box(new CANNON.Vec3(wallThickness, wallHeight, wallSize));
    const wallShapeZ = new CANNON.Box(new CANNON.Vec3(wallSize, wallHeight, wallThickness));

    const walls = [
      { shape: wallShapeX, pos: [-wallSize, wallHeight / 2 - 1.2, 0] },
      { shape: wallShapeX, pos: [wallSize, wallHeight / 2 - 1.2, 0] },
      { shape: wallShapeZ, pos: [0, wallHeight / 2 - 1.2, -wallSize] },
      { shape: wallShapeZ, pos: [0, wallHeight / 2 - 1.2, wallSize] },
    ];
    walls.forEach(({ shape, pos }) => {
      const wall = new CANNON.Body({ type: CANNON.Body.STATIC, material: defaultMaterial });
      wall.addShape(shape);
      wall.position.set(pos[0], pos[1], pos[2]);
      world.addBody(wall);
    });

    // Grid
    const grid = new THREE.GridHelper(30, 30, 0x221010, 0x1a0a0a);
    grid.position.y = -1.19;
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Helper functions
    function createThickEdges(geometry: THREE.BufferGeometry, color: number, lineWidth: number, thresholdAngle = 1): Line2 {
      const edges = new THREE.EdgesGeometry(geometry, thresholdAngle);
      const posAttr = edges.attributes.position;
      const positions: number[] = [];
      for (let i = 0; i < posAttr.count; i += 2) {
        positions.push(
          posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i),
          posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)
        );
      }
      const lineGeo = new LineGeometry();
      lineGeo.setPositions(positions);
      const lineMat = new LineMaterial({
        color,
        linewidth: lineWidth,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      });
      return new Line2(lineGeo, lineMat);
    }

    function createLabel(name: string, size: string): CSS2DObject {
      const div = document.createElement("div");
      div.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid #ff0000;
        padding: 4px 8px;
        font: 12px ui-monospace, monospace;
        color: #ffffff;
        white-space: nowrap;
        pointer-events: none;
      `;
      div.innerHTML = `<div style="color: #ff6666">${name}</div><div style="color: #888">${size}</div>`;
      const label = new CSS2DObject(div);
      label.position.set(1.2, 1.2, 0);
      return label;
    }

    // All scene objects
    const sceneObjects: SceneObject[] = [];
    const SPHERE_RADIUS = 1.1;
    const DIAMOND_RADIUS = 1.0;

    // Create sphere helper
    function createSphere(scale: number, position: THREE.Vector3, velocity: THREE.Vector3, hasLabel = false, labelName = "", labelSize = ""): SceneObject {
      const geo = new THREE.SphereGeometry(SPHERE_RADIUS * scale, scale > 0.5 ? 24 : 16, scale > 0.5 ? 16 : 12);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0x442a2a, roughness: 0.65, metalness: 0.15 })
      );
      mesh.castShadow = true;

      const body = new CANNON.Body({
        mass: scale,
        shape: new CANNON.Sphere(SPHERE_RADIUS * scale),
        material: defaultMaterial,
        linearDamping: 0.3,
        angularDamping: 0.3,
      });
      body.position.set(position.x, position.y, position.z);
      body.velocity.set(velocity.x, velocity.y, velocity.z);
      body.angularFactor.set(0, 1, 0);

      const edges = createThickEdges(geo, 0xff0000, scale > 0.5 ? 4 : 3, 1);

      if (hasLabel) {
        mesh.add(createLabel(labelName, labelSize));
      }

      scene.add(mesh);
      scene.add(edges);
      world.addBody(body);

      const obj: SceneObject = {
        id: generateId(),
        mesh,
        body,
        edges,
        type: "sphere",
        scale,
        originalScale: new THREE.Vector3(1, 1, 1),
        originalEmissive: 0x000000,
        originalEmissiveIntensity: 0,
        hasLabel,
        labelName,
        labelSize,
      };
      sceneObjects.push(obj);
      return obj;
    }

    // Create diamond helper
    function createDiamond(scale: number, position: THREE.Vector3, velocity: THREE.Vector3, hasLabel = false, labelName = "", labelSize = ""): SceneObject {
      const geo = new THREE.OctahedronGeometry(DIAMOND_RADIUS * scale, 0);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: 0x4a2020,
          roughness: 0.35,
          metalness: 0.25,
          emissive: 0x200505,
          emissiveIntensity: 0.35,
        })
      );
      mesh.castShadow = true;
      mesh.scale.set(0.7, 1, 0.7);

      const body = new CANNON.Body({
        mass: scale,
        shape: new CANNON.Sphere(DIAMOND_RADIUS * scale * 1.2),
        material: defaultMaterial,
        linearDamping: 0.3,
        angularDamping: 0.0,
      });
      body.position.set(position.x, position.y, position.z);
      body.velocity.set(velocity.x, velocity.y, velocity.z);
      body.angularFactor.set(0, 1, 0);

      const edges = createThickEdges(geo, 0xff0000, scale > 0.5 ? 4 : 3, 1);
      edges.scale.set(0.7, 1, 0.7);

      if (hasLabel) {
        mesh.add(createLabel(labelName, labelSize));
      }

      scene.add(mesh);
      scene.add(edges);
      world.addBody(body);

      const obj: SceneObject = {
        id: generateId(),
        mesh,
        body,
        edges,
        type: "diamond",
        scale,
        originalScale: new THREE.Vector3(0.7, 1, 0.7),
        originalEmissive: 0x200505,
        originalEmissiveIntensity: 0.35,
        hasLabel,
        labelName,
        labelSize,
      };
      sceneObjects.push(obj);
      return obj;
    }

    // Remove object from scene
    function removeObject(obj: SceneObject) {
      const idx = sceneObjects.indexOf(obj);
      if (idx !== -1) sceneObjects.splice(idx, 1);
      scene.remove(obj.mesh);
      scene.remove(obj.edges);
      world.removeBody(obj.body);
      obj.mesh.geometry.dispose();
      (obj.mesh.material as THREE.Material).dispose();
    }

    // Convert scene objects to serializable data
    function objectsToData(): ObjectData[] {
      return sceneObjects
        .filter(obj => !obj.isExiting)
        .map(obj => ({
          id: obj.id,
          type: obj.type,
          scale: obj.scale,
          position: [obj.body.position.x, obj.body.position.y, obj.body.position.z] as [number, number, number],
          velocity: [obj.body.velocity.x, obj.body.velocity.y, obj.body.velocity.z] as [number, number, number],
          hasLabel: obj.hasLabel,
          labelName: obj.labelName,
          labelSize: obj.labelSize,
        }));
    }

    // Restore objects from data
    function restoreFromData(data: ObjectData[]) {
      // Remove all current objects
      while (sceneObjects.length > 0) {
        removeObject(sceneObjects[0]);
      }

      // Create objects from data
      for (const d of data) {
        const pos = new THREE.Vector3(d.position[0], d.position[1], d.position[2]);
        const vel = new THREE.Vector3(d.velocity[0], d.velocity[1], d.velocity[2]);
        if (d.type === "sphere") {
          createSphere(d.scale, pos, vel, d.hasLabel, d.labelName, d.labelSize);
        } else {
          createDiamond(d.scale, pos, vel, d.hasLabel, d.labelName, d.labelSize);
        }
      }
    }

    // Exit animations (scale up and fade out)
    let exitAnims: ExitAnim[] = [];

    // Navigate into a sphere - old objects exit, new ones spawn
    function navigateInto() {
      // Save current state to history
      const currentData = objectsToData();
      pushState(currentData);

      // Mark all current objects as exiting and start exit animation
      const now = performance.now();
      for (const obj of sceneObjects) {
        if (!obj.isExiting) {
          obj.isExiting = true;
          // Disable physics
          obj.body.type = CANNON.Body.STATIC;
          obj.body.velocity.set(0, 0, 0);
          obj.body.angularVelocity.set(0, 0, 0);

          exitAnims.push({
            obj,
            startScale: obj.mesh.scale.clone(),
            startTime: now,
            duration: 400,
          });
        }
      }

      // Spawn new objects after a short delay
      setTimeout(() => {
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          const isSphere = Math.random() > 0.4; // Slightly more spheres
          const scale = 0.6 + Math.random() * 0.4;
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
          const radius = 1 + Math.random() * 2;

          const spawnPos = new THREE.Vector3(
            Math.cos(angle) * radius,
            6 + Math.random() * 2,
            Math.sin(angle) * radius
          );
          const spawnVel = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            -2,
            (Math.random() - 0.5) * 2
          );

          if (isSphere) {
            createSphere(scale, spawnPos, spawnVel);
          } else {
            createDiamond(scale, spawnPos, spawnVel);
          }
        }
      }, 200);
    }

    // Go back to previous state
    function navigateBack() {
      const previousData = goBack();
      if (previousData) {
        // Exit current objects quickly
        const now = performance.now();
        for (const obj of sceneObjects) {
          if (!obj.isExiting) {
            obj.isExiting = true;
            obj.body.type = CANNON.Body.STATIC;
            obj.body.velocity.set(0, 0, 0);
            exitAnims.push({
              obj,
              startScale: obj.mesh.scale.clone(),
              startTime: now,
              duration: 300,
            });
          }
        }

        // Restore after exit animation
        setTimeout(() => {
          restoreFromData(previousData);
        }, 150);
      }
    }

    // Store ref for external access
    sceneRef.current = { scene, world, sceneObjects, createSphere, createDiamond, removeObject, exitAnims };
    navigateBackRef.current = navigateBack;

    // Initial objects
    createSphere(1, new THREE.Vector3(-2, 6, 1), new THREE.Vector3(1, 0, -1), true, "Photos", "2GB");
    createDiamond(1, new THREE.Vector3(2, 5, -1), new THREE.Vector3(-1, 1, 1), true, "Archive.zip", "1GB");

    // Save initial state
    pushState(objectsToData());

    // Interaction state
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    let draggedObject: SceneObject | null = null;
    let dragConstraint: CANNON.PointToPointConstraint | null = null;

    const mouseBody = new CANNON.Body({ mass: 0 });
    world.addBody(mouseBody);

    // Scale animations
    type ScaleAnim = { obj: SceneObject; startScale: THREE.Vector3; endScale: THREE.Vector3; startTime: number; duration: number };
    let scaleAnims: ScaleAnim[] = [];

    function easeOutBounce(x: number): number {
      const n1 = 7.5625, d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }

    function easeOutCubic(x: number): number {
      return 1 - Math.pow(1 - x, 3);
    }

    function startScaleAnim(obj: SceneObject, toScale: THREE.Vector3, duration = 300) {
      scaleAnims = scaleAnims.filter(a => a.obj !== obj);
      scaleAnims.push({ obj, startScale: obj.mesh.scale.clone(), endScale: toScale.clone(), startTime: performance.now(), duration });
    }

    // Mouse handlers
    function onMouseDown(event: MouseEvent) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = sceneObjects.filter(o => !o.isExiting).map(o => o.mesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        controls.enabled = false;
        const hitMesh = intersects[0].object;
        const hitObj = sceneObjects.find(o => o.mesh === hitMesh);

        if (hitObj && !hitObj.isExiting) {
          draggedObject = hitObj;

          // Scale up for dragging
          const bigScale = hitObj.originalScale.clone().multiplyScalar(1.3);
          startScaleAnim(hitObj, bigScale, 400);

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

    // Double-click to navigate into spheres
    function onDoubleClick(event: MouseEvent) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = sceneObjects.filter(o => !o.isExiting).map(o => o.mesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const hitObj = sceneObjects.find(o => o.mesh === hitMesh);

        if (hitObj && !hitObj.isExiting && hitObj.type === "sphere") {
          navigateInto();
        }
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (!draggedObject || !dragConstraint) return;
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
        mouseBody.position.set(intersection.x, intersection.y, intersection.z);
      }
    }

    function onMouseUp() {
      if (draggedObject) {
        startScaleAnim(draggedObject, draggedObject.originalScale, 400);
        const mat = draggedObject.mesh.material as THREE.MeshStandardMaterial;
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
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        navigateBack();
      }
    }

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("mouseleave", onMouseUp);
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown);

    // Bloom setup
    const bloomLayer = new THREE.Layers();
    bloomLayer.set(BLOOM_LAYER);
    const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const materials: Map<string, THREE.Material | THREE.Material[]> = new Map();

    function darkenNonBloomed(obj: THREE.Object3D) {
      if ((obj as THREE.Mesh).isMesh && !bloomLayer.test(obj.layers)) {
        const mesh = obj as THREE.Mesh;
        materials.set(mesh.uuid, mesh.material);
        mesh.material = darkMaterial;
      }
    }

    function restoreMaterial(obj: THREE.Object3D) {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const cached = materials.get(mesh.uuid);
        if (cached) {
          mesh.material = cached;
          materials.delete(mesh.uuid);
        }
      }
    }

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 0.15, 0.0);
    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(renderScene);
    bloomComposer.addPass(bloomPass);

    const BlendShader = {
      uniforms: {
        tDiffuse: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
        bloomIntensity: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D bloomTexture;
        uniform float bloomIntensity;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec4 bloom = texture2D(bloomTexture, vUv);
          gl_FragColor = base + bloom * bloomIntensity;
        }
      `,
    };

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const blendPass = new ShaderPass(BlendShader);
    blendPass.needsSwap = true;
    composer.addPass(blendPass);

    const ditherPass = new ShaderPass(DitherPixelShader);
    composer.addPass(ditherPass);
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

      // Exit animations (scale up to 10x and remove)
      exitAnims = exitAnims.filter(anim => {
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

      // Scale animations
      scaleAnims = scaleAnims.filter(anim => {
        if (anim.obj.isExiting) return false;
        const t = Math.min((now - anim.startTime) / anim.duration, 1);
        const eased = easeOutBounce(t);
        const newScale = new THREE.Vector3().lerpVectors(anim.startScale, anim.endScale, eased);
        anim.obj.mesh.scale.copy(newScale);
        anim.obj.edges.scale.copy(newScale);
        return t < 1;
      });

      // Physics
      world.step(1 / 120, delta, 10);

      // Sync all objects
      for (const obj of sceneObjects) {
        if (!obj.isExiting) {
          obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
          obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);
        }
        obj.edges.position.copy(obj.mesh.position);
        obj.edges.quaternion.copy(obj.mesh.quaternion);
      }

      controls.update();

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
      labelRenderer.render(scene, camera);
    }
    animate();

    // Resize
    function handleResize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      labelRenderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      composer.setSize(window.innerWidth, window.innerHeight);
      bloomComposer.setSize(window.innerWidth, window.innerHeight);
      bloomPass.resolution.set(window.innerWidth, window.innerHeight);
      ditherPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
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
      container.removeChild(renderer.domElement);
      container.removeChild(labelRenderer.domElement);
      container.removeChild(fpsDiv);
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

  return (
    <>
      <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      {canGoBack && (
        <button
          onClick={handleBack}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(0, 0, 0, 0.7)",
            border: "2px solid #ff0000",
            padding: "8px 16px",
            font: "14px ui-monospace, monospace",
            color: "#ff6666",
            cursor: "pointer",
            zIndex: 100,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 0, 0, 0.2)";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 0, 0, 0.7)";
            e.currentTarget.style.color = "#ff6666";
          }}
        >
          ← Back
        </button>
      )}
    </>
  );
}
