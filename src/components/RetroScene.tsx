import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { invoke } from "@tauri-apps/api/core";
import * as Tone from "tone";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { useSceneStore, type FileEntry } from "../store/sceneStore";
import type { Settings } from "../types";

type DiskInfo = {
  name: string;
  path: string;
  total_space: number;
  available_space: number;
};

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
  filePath: string;
  fileName: string;
  fileSize: string;
  isDir: boolean;
  isExiting?: boolean;
};

// Format bytes to human readable
function formatSize(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;

  if (bytes >= TB) return `${(bytes / TB).toFixed(1)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${bytes} B`;
}

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
    createFolder: (entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3) => SceneObject;
    createFile: (entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3) => SceneObject;
    removeObject: (obj: SceneObject) => void;
    spawnEntries: (entries: FileEntry[]) => void;
    exitAnims: ExitAnim[];
    returnToComputer: () => Promise<void>;
  } | null>(null);

  const { navigateTo, goBack, canGoBack, currentPath } = useSceneStore();
  const navigateBackRef = useRef<(() => void) | null>(null);
  const loadDirectoryRef = useRef<((path: string) => Promise<void>) | null>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

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

    // Loading overlay
    const loadingOverlay = document.createElement("div");
    loadingOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 200;
    `;
    const spinner = document.createElement("div");
    spinner.style.cssText = `
      width: 50px;
      height: 50px;
      border: 4px solid #333;
      border-top: 4px solid #ff4444;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;
    // Add keyframes for spinner and custom font
    const style = document.createElement("style");
    style.textContent = `
      @font-face {
        font-family: 'VCR OSD Mono';
        src: url('/src/assets/VCR_OSD_MONO_1.001.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
    loadingOverlay.appendChild(spinner);
    container.appendChild(loadingOverlay);

    function showLoading() {
      loadingOverlay.style.display = "flex";
    }
    function hideLoading() {
      loadingOverlay.style.display = "none";
    }

    // Sound system - Cyberpunk/Tron style
    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination();
    const filter = new Tone.Filter(800, "lowpass").connect(reverb);

    // Deep bass synth for main sounds
    const bassSynth = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.4 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3, baseFrequency: 200, octaves: 2 },
      volume: -8,
    }).connect(filter);

    // Sub bass for impacts
    const subBass = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.3 },
      volume: -6,
    }).connect(reverb);

    // Glitchy high synth for accents
    const glitchSynth = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
      filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1, baseFrequency: 2000, octaves: -2 },
      volume: -18,
    }).connect(reverb);

    // FM synth for digital sounds
    const fmSynth = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 10,
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
      modulation: { type: "square" },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 },
      volume: -22,
    }).connect(filter);

    let audioStarted = false;
    async function ensureAudio() {
      if (!audioStarted) {
        await Tone.start();
        audioStarted = true;
      }
    }

    function playPickup() {
      ensureAudio();
      bassSynth.triggerAttackRelease("C2", 0.15);
      glitchSynth.triggerAttackRelease("G4", 0.08, Tone.now() + 0.02);
    }

    function playDrop() {
      ensureAudio();
      subBass.triggerAttackRelease("E1", 0.25);
      glitchSynth.triggerAttackRelease("C3", 0.1);
    }

    function playNavigateIn() {
      ensureAudio();
      fmSynth.triggerAttackRelease("C2", 0.2, Tone.now());
      fmSynth.triggerAttackRelease("G2", 0.15, Tone.now() + 0.1);
      glitchSynth.triggerAttackRelease("C4", 0.1, Tone.now() + 0.15);
    }

    function playNavigateBack() {
      ensureAudio();
      fmSynth.triggerAttackRelease("G2", 0.15, Tone.now());
      fmSynth.triggerAttackRelease("C2", 0.2, Tone.now() + 0.1);
      subBass.triggerAttackRelease("C1", 0.3, Tone.now() + 0.05);
    }

    function playSpawn() {
      ensureAudio();
      bassSynth.triggerAttackRelease("G1", 0.1);
      glitchSynth.triggerAttackRelease("E5", 0.05, Tone.now() + 0.02);
    }

    function playLand() {
      ensureAudio();
      subBass.triggerAttackRelease("C1", 0.15);
    }

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
    const fogShader = {
      uniforms: {
        fogColor: { value: new THREE.Color(0x3a0808) },
        time: { value: 0 },
        layerHeight: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vHeight = position.z; // Local Z becomes height in rotated plane
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 fogColor;
        uniform float time;
        uniform float layerHeight;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;

        float hash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.13);
          p3 += dot(p3, p3.yzx + 3.333);
          return fract((p3.x + p3.y) * p3.z);
        }

        float noise(vec2 x) {
          vec2 i = floor(x);
          vec2 f = fract(x);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          for(int i = 0; i < 5; i++) {
            value += amplitude * noise(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }

        void main() {
          // Distance from center
          float dist = length(vWorldPosition.xz) / 18.0;

          // Animated noise for smoke
          vec2 fogUv1 = vUv * 2.5 + vec2(time * 0.012, time * 0.008) + layerHeight * 0.5;
          vec2 fogUv2 = vUv * 3.5 - vec2(time * 0.018, time * 0.012) + layerHeight * 0.3;
          float noiseValue1 = fbm(fogUv1);
          float noiseValue2 = fbm(fogUv2);
          float combinedNoise = (noiseValue1 * 0.6 + noiseValue2 * 0.4);

          // Wispy smoke patterns with threshold
          float smokeDensity = smoothstep(0.3, 0.7, combinedNoise);

          // Distance falloff
          float distFactor = 1.0 - smoothstep(0.2, 1.0, dist);

          // Vertical gradient - denser at bottom, fades to top
          float heightGradient = 1.0 - (vHeight / 3.0 + 0.5);
          heightGradient = clamp(pow(heightGradient, 1.2), 0.0, 1.0);

          // Combine all factors
          float alpha = smokeDensity * distFactor * heightGradient;

          // Red glow with gradient
          vec3 glowColor = mix(fogColor, vec3(0.5, 0.08, 0.08), heightGradient * 0.6);

          gl_FragColor = vec4(glowColor, alpha * 0.6);
        }
      `,
    };

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

    // Invisible walls (dynamic sizing)
    let wallBodies: CANNON.Body[] = [];
    const wallHeight = 10;
    const wallThickness = 0.5;

    function updateWalls(itemCount: number, maxScale: number = 1.0) {
      // Remove old walls
      wallBodies.forEach(wall => world.removeBody(wall));
      wallBodies = [];

      // Calculate wall size based on items
      // Base size for 1-5 items, scales up with more items and larger scales
      const baseSize = 8;
      const itemFactor = Math.sqrt(itemCount) * 1.5;
      const scaleFactor = maxScale * 1.2;
      const wallSize = Math.max(baseSize, Math.min(baseSize + itemFactor + scaleFactor, 25));

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
        wallBodies.push(wall);
      });

      console.log(`Updated walls: size=${wallSize.toFixed(1)}, items=${itemCount}, maxScale=${maxScale.toFixed(2)}`);
    }

    // Initialize with default walls
    updateWalls(5, 1.0);

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

    function createLabel(name: string, size: string, scale: number, objectHeight: number = 1.1): CSS2DObject {
      // Trim long names
      const maxLen = 16;
      const displayName = name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
      const isTrimmed = name.length > maxLen;

      // Scale font size based on screen size and object scale (1.5x larger)
      const screenScale = Math.min(window.innerWidth, window.innerHeight) / 1000;
      const baseFontSize = 15 * screenScale;  // 10 * 1.5
      const fontSize = Math.round(baseFontSize + (scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) * 9 * screenScale);  // 6 * 1.5
      const padding = Math.round(4.5 + scale * 3);  // 3 * 1.5 and 2 * 1.5

      const div = document.createElement("div");
      div.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        border: 3px solid #ff0000;
        padding: ${padding}px ${padding * 2}px;
        font: ${fontSize}px 'VCR OSD Mono', ui-monospace, monospace;
        color: #ffffff;
        white-space: nowrap;
        pointer-events: auto;
        text-align: center;
        transform: translate(-50%, -50%);
        cursor: default;
        transition: background 0.15s;
        user-select: none;
        -webkit-user-select: none;
        letter-spacing: 1.5px;
      `;

      const nameDiv = document.createElement("div");
      nameDiv.style.color = "#ff6666";
      nameDiv.textContent = displayName;
      div.appendChild(nameDiv);

      if (size) {
        const sizeDiv = document.createElement("div");
        sizeDiv.style.color = "#888";
        sizeDiv.textContent = size;
        div.appendChild(sizeDiv);
      }

      // Show full name on hover if trimmed
      if (isTrimmed) {
        div.addEventListener("mouseenter", () => {
          nameDiv.textContent = name;
          div.style.background = "rgba(0, 0, 0, 0.9)";
          div.style.zIndex = "1000";
        });
        div.addEventListener("mouseleave", () => {
          nameDiv.textContent = displayName;
          div.style.background = "rgba(0, 0, 0, 0.7)";
          div.style.zIndex = "";
        });
      }

      // Pass through click/drag events to the scene
      const passThrough = (e: MouseEvent) => {
        div.style.pointerEvents = "none";
        const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
        div.style.pointerEvents = "auto";
        if (elementBelow && elementBelow !== div) {
          elementBelow.dispatchEvent(new MouseEvent(e.type, e));
        }
      };
      div.addEventListener("mousedown", passThrough);
      div.addEventListener("mouseup", passThrough);
      div.addEventListener("mousemove", passThrough);
      div.addEventListener("dblclick", passThrough);

      const label = new CSS2DObject(div);
      // Position based on base geometry height (not scaled)
      label.position.set(0, objectHeight + 0.2, 0);
      label.center.set(0.5, 1);
      return label;
    }

    // All scene objects
    const sceneObjects: SceneObject[] = [];
    const SPHERE_RADIUS = 1.1;
    const DIAMOND_RADIUS = 1.0;
    const MIN_SCALE = 0.3;
    const MAX_SCALE = 1.5;

    // Calculate scale based on size - more linear for noticeable differences
    function sizeToScale(size: number, maxSize: number): number {
      if (maxSize <= 0 || size <= 0) return MIN_SCALE;
      // Linear ratio with slight curve for better distribution
      const ratio = size / maxSize;
      // Gentle power curve to prevent tiny objects but keep differences visible
      const curved = Math.pow(ratio, 0.7);
      return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * curved;
    }

    // Create folder (sphere) helper
    function createFolder(entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number): SceneObject {
      const scale = sizeToScale(entry.size, maxSize);
      const sizeStr = formatSize(entry.size);
      const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0x442a2a, roughness: 0.65, metalness: 0.15 })
      );
      mesh.castShadow = true;
      mesh.scale.set(scale, scale, scale);

      const body = new CANNON.Body({
        mass: scale * 5,
        shape: new CANNON.Sphere(SPHERE_RADIUS * scale),
        material: defaultMaterial,
        linearDamping: 0.6,
        angularDamping: 0.5,
      });
      body.position.set(position.x, position.y, position.z);
      body.velocity.set(velocity.x, velocity.y, velocity.z);
      body.angularFactor.set(0, 1, 0);

      const edges = createThickEdges(geo, 0xff0000, scale > 0.6 ? 4 : 3, 1);
      edges.scale.set(scale, scale, scale);

      mesh.add(createLabel(entry.name, sizeStr, scale, SPHERE_RADIUS));

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
        originalScale: new THREE.Vector3(scale, scale, scale),
        originalEmissive: 0x000000,
        originalEmissiveIntensity: 0,
        filePath: entry.path,
        fileName: entry.name,
        fileSize: sizeStr,
        isDir: true,
      };
      sceneObjects.push(obj);
      return obj;
    }

    // Create file (diamond) helper
    function createFile(entry: FileEntry, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number): SceneObject {
      const scale = sizeToScale(entry.size, maxSize);
      const geo = new THREE.OctahedronGeometry(DIAMOND_RADIUS, 0);
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
      mesh.scale.set(0.7 * scale, 1 * scale, 0.7 * scale);

      const body = new CANNON.Body({
        mass: scale * 5,
        shape: new CANNON.Sphere(DIAMOND_RADIUS * scale * 1.2),
        material: defaultMaterial,
        linearDamping: 0.6,
        angularDamping: 0.5,
      });
      body.position.set(position.x, position.y, position.z);
      body.velocity.set(velocity.x, velocity.y, velocity.z);
      body.angularFactor.set(0, 1, 0);

      const edges = createThickEdges(geo, 0xff0000, 3, 1);
      edges.scale.set(0.7 * scale, 1 * scale, 0.7 * scale);

      const sizeStr = formatSize(entry.size);
      mesh.add(createLabel(entry.name, sizeStr, scale, DIAMOND_RADIUS));

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
        originalScale: new THREE.Vector3(0.7 * scale, 1 * scale, 0.7 * scale),
        originalEmissive: 0x200505,
        originalEmissiveIntensity: 0.35,
        filePath: entry.path,
        fileName: entry.name,
        fileSize: sizeStr,
        isDir: false,
      };
      sceneObjects.push(obj);
      return obj;
    }

    // Create disk (cube) helper - for Windows/Linux disk drives
    function createDisk(disk: DiskInfo, position: THREE.Vector3, velocity: THREE.Vector3, maxSize: number): SceneObject {
      // Calculate scale based on total disk size
      const MIN_DISK_SCALE = 0.5;
      const MAX_DISK_SCALE = 1.8;
      const scale = maxSize > 0
        ? MIN_DISK_SCALE + (MAX_DISK_SCALE - MIN_DISK_SCALE) * Math.sqrt(disk.total_space / maxSize)
        : 1.0;

      const cubeSize = 1.2;
      const geo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

      // Calculate how full the disk is (for color)
      const usedSpace = disk.total_space - disk.available_space;
      const percentUsed = disk.total_space > 0 ? usedSpace / disk.total_space : 0;
      const colorValue = Math.floor(0x3a + (0xff - 0x3a) * percentUsed);

      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: (colorValue << 16) | (colorValue << 8) | 0x4a,
          roughness: 0.5,
          metalness: 0.3,
          emissive: 0x101020,
          emissiveIntensity: 0.2,
        })
      );
      mesh.castShadow = true;
      mesh.scale.set(scale, scale, scale);

      const body = new CANNON.Body({
        mass: scale * 7.5,
        shape: new CANNON.Box(new CANNON.Vec3(cubeSize * scale / 2, cubeSize * scale / 2, cubeSize * scale / 2)),
        material: defaultMaterial,
        linearDamping: 0.6,
        angularDamping: 0.5,
      });
      body.position.set(position.x, position.y, position.z);
      body.velocity.set(velocity.x, velocity.y, velocity.z);
      body.angularFactor.set(0, 1, 0);

      const edges = createThickEdges(geo, 0xff0000, Math.max(3, scale * 4), 1);
      edges.scale.set(scale, scale, scale);

      // Debug: Log raw disk info
      console.log(`Raw disk data for ${disk.name}:`, disk);
      console.log(`  total_space: ${disk.total_space}`);
      console.log(`  available_space: ${disk.available_space}`);

      // Format available space - values might already be in GB or different unit
      let availableGB = disk.available_space;
      let totalGB = disk.total_space;

      // If values seem to be in bytes (very large numbers), convert to GB
      if (disk.total_space > 1000000) {
        totalGB = disk.total_space / (1024 * 1024 * 1024);
        availableGB = disk.available_space / (1024 * 1024 * 1024);
      }

      console.log(`Disk ${disk.name}: ${availableGB.toFixed(1)} GB free of ${totalGB.toFixed(1)} GB total`);

      const sizeLabel = availableGB < 0.1 ? "empty" : `${availableGB.toFixed(1)} GB free`;

      mesh.add(createLabel(disk.name, sizeLabel, scale, cubeSize / 2));

      scene.add(mesh);
      scene.add(edges);
      world.addBody(body);

      const obj: SceneObject = {
        id: generateId(),
        mesh,
        body,
        edges,
        type: "sphere", // Treat as navigable like folders
        scale,
        originalScale: new THREE.Vector3(scale, scale, scale),
        originalEmissive: 0x101020,
        originalEmissiveIntensity: 0.2,
        filePath: disk.path,
        fileName: disk.name,
        fileSize: sizeLabel,
        isDir: true, // Disks are navigable
      };
      sceneObjects.push(obj);
      return obj;
    }

    // Remove object from scene
    function removeObject(obj: SceneObject) {
      const idx = sceneObjects.indexOf(obj);
      if (idx !== -1) sceneObjects.splice(idx, 1);

      // Remove CSS2D labels (children of mesh)
      const toRemove: THREE.Object3D[] = [];
      obj.mesh.traverse((child) => {
        if ((child as CSS2DObject).isCSS2DObject) {
          toRemove.push(child);
          // Remove the DOM element
          const css2d = child as CSS2DObject;
          if (css2d.element && css2d.element.parentNode) {
            css2d.element.parentNode.removeChild(css2d.element);
          }
        }
      });
      toRemove.forEach((child) => obj.mesh.remove(child));

      scene.remove(obj.mesh);
      scene.remove(obj.edges);
      world.removeBody(obj.body);
      obj.mesh.geometry.dispose();
      (obj.mesh.material as THREE.Material).dispose();
    }

    // Spawn entries as 3D objects
    function spawnEntries(entries: FileEntry[]) {
      if (entries.length > 0) playSpawn();
      const count = Math.min(entries.length, 20); // Limit to 20 objects
      const entriesToShow = entries.slice(0, count);

      // Calculate max size for scaling
      const maxSize = Math.max(...entriesToShow.map(e => e.size), 1);
      const maxScale = sizeToScale(maxSize, maxSize);

      // Update walls based on number of items and their max scale
      updateWalls(count, maxScale);

      // Tight grid spawning - objects spawn close together
      const gridSize = Math.ceil(Math.sqrt(count));
      const spacing = 1.8; // Tight spacing between objects

      for (let i = 0; i < count; i++) {
        const entry = entriesToShow[i];

        // Calculate grid position
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;

        // Center the grid around origin
        const offsetX = (gridSize - 1) * spacing / 2;
        const offsetZ = (gridSize - 1) * spacing / 2;

        // Add slight randomization to avoid perfect grid
        const randomOffset = 0.3;
        const spawnPos = new THREE.Vector3(
          col * spacing - offsetX + (Math.random() - 0.5) * randomOffset,
          5 + Math.random() * 2, // Lower variance in height
          row * spacing - offsetZ + (Math.random() - 0.5) * randomOffset
        );

        // Minimal horizontal velocity for tighter landing
        const spawnVel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          -2,
          (Math.random() - 0.5) * 0.5
        );

        if (entry.is_dir) {
          createFolder(entry, spawnPos, spawnVel, maxSize);
        } else {
          createFile(entry, spawnPos, spawnVel, maxSize);
        }
      }
    }

    // Exit animations (scale up and fade out)
    let exitAnims: ExitAnim[] = [];

    // Exit all current objects with animation
    function exitCurrentObjects(duration = 400) {
      const now = performance.now();
      for (const obj of sceneObjects) {
        if (!obj.isExiting) {
          obj.isExiting = true;
          obj.body.type = CANNON.Body.STATIC;
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

    // Load directory contents from Rust backend
    async function loadDirectory(path: string) {
      showLoading();
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
        exitCurrentObjects();
        setTimeout(() => {
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
        exitCurrentObjects(300);
        setTimeout(() => {
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
      showLoading();
      try {
        const disks = await invoke<DiskInfo[]>("get_disks");

        // Clear history and exit current objects
        const { clearHistory } = useSceneStore.getState();
        clearHistory();
        exitCurrentObjects(300);

        setTimeout(async () => {
          if (disks.length > 0) {
            // Show disks WITHOUT playing spawn sound
            const count = disks.length;
            const maxDiskSize = Math.max(...disks.map(d => d.total_space), 1);

            const MIN_DISK_SCALE = 0.5;
            const MAX_DISK_SCALE = 1.8;
            const maxScale = maxDiskSize > 0
              ? MIN_DISK_SCALE + (MAX_DISK_SCALE - MIN_DISK_SCALE) * Math.sqrt(maxDiskSize / maxDiskSize)
              : 1.0;

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

    // Store ref for external access
    sceneRef.current = { scene, world, sceneObjects, createFolder, createFile, removeObject, spawnEntries, exitAnims, returnToComputer };
    navigateBackRef.current = navigateBack;
    loadDirectoryRef.current = loadDirectory;

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
          const MIN_DISK_SCALE = 0.5;
          const MAX_DISK_SCALE = 1.8;
          const maxScale = maxDiskSize > 0
            ? MIN_DISK_SCALE + (MAX_DISK_SCALE - MIN_DISK_SCALE) * Math.sqrt(maxDiskSize / maxDiskSize)
            : 1.0;

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

    // Particle system for click effects
    type Particle = {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      startTime: number;
      lifetime: number;
    };
    let particles: Particle[] = [];

    function spawnClickParticles(position: THREE.Vector3, count = 10) {
      for (let i = 0; i < count; i++) {
        const geo = new THREE.SphereGeometry(0.05, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);

        const angle = (i / count) * Math.PI * 2;
        const speed = 2 + Math.random() * 2;
        const velocity = new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.random() * 3 + 2,
          Math.sin(angle) * speed
        );

        scene.add(mesh);
        particles.push({
          mesh,
          velocity,
          startTime: performance.now(),
          lifetime: 500 + Math.random() * 300,
        });
      }
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
          playPickup();

          // Spawn click particles
          spawnClickParticles(hitObj.mesh.position.clone());

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

    // Double-click to navigate into folders (spheres)
    function onDoubleClick(event: MouseEvent) {
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
        playDrop();
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

      // Update fog animation for all layers
      fogLayers.forEach(layer => {
        const mat = layer.material as THREE.ShaderMaterial;
        mat.uniforms.time.value = now * 0.001;
      });

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

      // Particle animations
      particles = particles.filter(particle => {
        const elapsed = now - particle.startTime;
        const t = Math.min(elapsed / particle.lifetime, 1);

        if (t >= 1) {
          scene.remove(particle.mesh);
          particle.mesh.geometry.dispose();
          (particle.mesh.material as THREE.Material).dispose();
          return false;
        }

        // Update position with gravity
        particle.velocity.y -= delta * 15;
        particle.mesh.position.add(particle.velocity.clone().multiplyScalar(delta));

        // Fade out
        (particle.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;

        return true;
      });

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
            if ((child as CSS2DObject).isCSS2DObject) {
              const label = child as CSS2DObject;
              label.element.style.opacity = isOccluded ? "0.2" : "1";
            }
          });
        }
        obj.edges.position.copy(obj.mesh.position);
        obj.edges.quaternion.copy(obj.mesh.quaternion);
        obj.edges.scale.copy(obj.mesh.scale);
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
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      renderer.setSize(newWidth, newHeight);
      labelRenderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      composer.setSize(newWidth, newHeight);
      bloomComposer.setSize(newWidth, newHeight);
      bloomPass.resolution.set(newWidth, newHeight);
      ditherPass.uniforms.resolution.value.set(newWidth, newHeight);

      // Update edge line materials resolution
      for (const obj of sceneObjects) {
        const lineMat = obj.edges.material as LineMaterial;
        lineMat.resolution.set(newWidth, newHeight);
      }

      // Update label font sizes
      const screenScale = Math.min(newWidth, newHeight) / 1000;
      for (const obj of sceneObjects) {
        obj.mesh.traverse((child) => {
          if ((child as CSS2DObject).isCSS2DObject) {
            const label = child as CSS2DObject;
            const div = label.element;

            // Recalculate font size based on new screen size and object scale
            const baseFontSize = 15 * screenScale;
            const fontSize = Math.round(baseFontSize + (obj.scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) * 9 * screenScale);
            const padding = Math.round(4.5 + obj.scale * 3);

            // Update font size in the style
            const currentFont = div.style.font;
            div.style.font = currentFont.replace(/\d+px/, `${fontSize}px`);
            div.style.padding = `${padding}px ${padding * 2}px`;
          }
        });
      }

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
      container.removeChild(renderer.domElement);
      container.removeChild(labelRenderer.domElement);
      container.removeChild(fpsDiv);
      container.removeChild(loadingOverlay);
      style.remove();
      bassSynth.dispose();
      subBass.dispose();
      glitchSynth.dispose();
      fmSynth.dispose();
      filter.dispose();
      reverb.dispose();
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
      {breadcrumbs.length > 0 && (
        <div style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0, 0, 0, 0.7)",
          border: "2px solid #ff0000",
          padding: `${Math.max(8, Math.min(windowSize.width, windowSize.height) / 100)}px ${Math.max(16, Math.min(windowSize.width, windowSize.height) / 50)}px`,
          font: `${Math.max(14, Math.min(windowSize.width, windowSize.height) / 50)}px ui-monospace, monospace`,
          color: "#ff6666",
          zIndex: 100,
          display: "flex",
          gap: `${Math.max(8, Math.min(windowSize.width, windowSize.height) / 100)}px`,
          alignItems: "center",
        }}>
          {breadcrumbs.map((crumb, index) => (
            <span key={index} style={{ display: "flex", alignItems: "center", gap: `${Math.max(8, Math.min(windowSize.width, windowSize.height) / 100)}px` }}>
              {index > 0 && <span style={{ color: "#ff4444", fontSize: `${Math.max(16, Math.min(windowSize.width, windowSize.height) / 40)}px` }}>›</span>}
              <span
                style={{
                  cursor: index < breadcrumbs.length - 1 ? "pointer" : "default",
                  color: index < breadcrumbs.length - 1 ? "#ff8888" : "#ff6666",
                  textDecoration: index < breadcrumbs.length - 1 ? "underline" : "none",
                }}
                onClick={() => {
                  if (index < breadcrumbs.length - 1) {
                    if (crumb.path === "") {
                      // Navigate to Computer view (disks)
                      navigateToComputer();
                    } else if (loadDirectoryRef.current) {
                      loadDirectoryRef.current(crumb.path);
                    }
                  }
                }}
                onMouseEnter={(e) => {
                  if (index < breadcrumbs.length - 1) {
                    e.currentTarget.style.color = "#ffffff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (index < breadcrumbs.length - 1) {
                    e.currentTarget.style.color = "#ff8888";
                  }
                }}
              >
                {crumb.name}
              </span>
            </span>
          ))}
        </div>
      )}
      {(canGoBack || currentPath !== "") && (
        <button
          onClick={() => {
            if (canGoBack) {
              handleBack();
            } else if (currentPath !== "") {
              // Go back to Computer level
              navigateToComputer();
            }
          }}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(0, 0, 0, 0.7)",
            border: "2px solid #ff0000",
            padding: `${Math.max(8, Math.min(windowSize.width, windowSize.height) / 100)}px ${Math.max(16, Math.min(windowSize.width, windowSize.height) / 50)}px`,
            font: `${Math.max(14, Math.min(windowSize.width, windowSize.height) / 50)}px ui-monospace, monospace`,
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
