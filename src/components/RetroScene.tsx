import { useEffect, useRef } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// Layer for selective bloom
const BLOOM_LAYER = 1;
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Settings } from "../types";

interface RetroSceneProps {
  settings: Settings;
  onRendererReady?: (renderer: THREE.WebGLRenderer) => void;
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

export default function RetroScene({ settings, onRendererReady }: RetroSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ditherPassRef = useRef<ShaderPass | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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
    containerRef.current.appendChild(renderer.domElement);
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
    containerRef.current.appendChild(fpsDiv);
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
    containerRef.current.appendChild(labelRenderer.domElement);

    // Helper to create label
    function createLabel(name: string, size: string): CSS2DObject {
      const div = document.createElement("div");
      div.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid #ff0000;
        padding: 4px 8px;
        font: 12px ui-monospace, monospace;
        color: #ffffff;
        white-space: nowrap;
        pointer-events: none;
      `;
      div.innerHTML = `<div style="color: #ff6666">${name}</div><div style="color: #888">${size}</div>`;
      const label = new CSS2DObject(div);
      label.position.set(1.2, 1.2, 0); // Offset to top-right
      return label;
    }

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050101, 0.065);
    scene.background = new THREE.Color(0x050101);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
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
    world.gravity.set(0, -25, 0); // Fast falling
    world.broadphase = new CANNON.NaiveBroadphase();

    // Physics materials
    const defaultMaterial = new CANNON.Material("default");
    const contactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
      friction: 0.3,
      restitution: 0.7, // More bouncy
    });
    world.addContactMaterial(contactMaterial);
    world.defaultContactMaterial = contactMaterial;

    // Lights (red-tinted)
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

    // Ground plane
    const planeGeo = new THREE.PlaneGeometry(30, 30, 1, 1);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x170b0b,
      roughness: 0.98,
      metalness: 0.02,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -1.2;
    plane.receiveShadow = true;
    scene.add(plane);

    // Ground physics body
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: defaultMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.y = -1.2;
    world.addBody(groundBody);

    // Grid
    const grid = new THREE.GridHelper(30, 30, 0x221010, 0x1a0a0a);
    grid.position.y = -1.19;
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Helper to create thick edges
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

    // Sphere
    const sphereRadius = 1.1;
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 24, 16);
    const sphere = new THREE.Mesh(
      sphereGeo,
      new THREE.MeshStandardMaterial({
        color: 0x442a2a,
        roughness: 0.65,
        metalness: 0.15,
      })
    );
    sphere.castShadow = true;
    sphere.scale.setScalar(0.5); // Start small
    scene.add(sphere);

    // Sphere physics
    const sphereBody = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Sphere(sphereRadius),
      material: defaultMaterial,
      linearDamping: 0.3,
      angularDamping: 0.3,
    });
    sphereBody.position.set(-3, 8, 2); // Start high
    sphereBody.velocity.set(2, 0, -2); // Parabolic trajectory
    sphereBody.angularFactor.set(0, 1, 0); // Only rotate around Y axis
    world.addBody(sphereBody);

    // Sphere edges
    const sphereEdges = createThickEdges(sphereGeo, 0xff0000, 4, 1);
    scene.add(sphereEdges);

    // Sphere label
    const sphereLabel = createLabel("Photos", "2GB");
    sphere.add(sphereLabel);

    // Diamond
    const diamondRadius = 1.0;
    const diamondGeo = new THREE.OctahedronGeometry(diamondRadius, 0);
    const diamond = new THREE.Mesh(
      diamondGeo,
      new THREE.MeshStandardMaterial({
        color: 0x4a2020,
        roughness: 0.35,
        metalness: 0.25,
        emissive: 0x200505,
        emissiveIntensity: 0.35,
      })
    );
    diamond.castShadow = true;
    diamond.scale.set(0.35, 0.5, 0.35); // Start small, narrower on X/Z
    scene.add(diamond);

    // Diamond physics (larger sphere to account for pointed bottom)
    const diamondBody = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Sphere(diamondRadius * 1.2),
      material: defaultMaterial,
      linearDamping: 0.3,
      angularDamping: 0.0, // No angular damping so it keeps spinning
    });
    diamondBody.position.set(3, 6, -3); // Start high
    diamondBody.velocity.set(-2, 2, 2); // Parabolic trajectory (upward arc)
    diamondBody.angularFactor.set(0, 1, 0); // Only rotate around Y axis
    world.addBody(diamondBody);

    // Diamond edges
    const diamondEdges = createThickEdges(diamondGeo, 0xff0000, 4, 1);
    diamondEdges.scale.set(0.35, 0.5, 0.35); // Start small like diamond
    scene.add(diamondEdges);

    // Diamond label
    const diamondLabel = createLabel("Archive.zip", "1GB");
    diamond.add(diamondLabel);

    // Draggable objects
    const draggables = [
      { mesh: sphere, body: sphereBody, edges: sphereEdges },
      { mesh: diamond, body: diamondBody, edges: diamondEdges },
    ];

    // Raycaster for mouse picking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    let draggedObject: typeof draggables[0] | null = null;
    let dragConstraint: CANNON.PointToPointConstraint | null = null;

    // Invisible body for mouse constraint
    const mouseBody = new CANNON.Body({ mass: 0 });
    world.addBody(mouseBody);

    // Store original scales for restoring after drag
    const originalScales = new Map<THREE.Mesh, THREE.Vector3>();
    originalScales.set(sphere, new THREE.Vector3(1, 1, 1));
    originalScales.set(diamond, new THREE.Vector3(0.7, 1, 0.7));

    // Scale animation state
    type ScaleAnim = {
      mesh: THREE.Mesh;
      edges: Line2;
      startScale: THREE.Vector3;
      endScale: THREE.Vector3;
      startTime: number;
      duration: number;
    };
    let scaleAnims: ScaleAnim[] = [];

    // Bounce easing function
    function easeOutBounce(x: number): number {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) {
        return n1 * x * x;
      } else if (x < 2 / d1) {
        return n1 * (x -= 1.5 / d1) * x + 0.75;
      } else if (x < 2.5 / d1) {
        return n1 * (x -= 2.25 / d1) * x + 0.9375;
      } else {
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
      }
    }

    function startScaleAnim(obj: typeof draggables[0], toScale: THREE.Vector3, duration = 300) {
      // Remove existing anim for this mesh
      scaleAnims = scaleAnims.filter(a => a.mesh !== obj.mesh);
      scaleAnims.push({
        mesh: obj.mesh,
        edges: obj.edges,
        startScale: obj.mesh.scale.clone(),
        endScale: toScale.clone(),
        startTime: performance.now(),
        duration,
      });
    }

    function onMouseDown(event: MouseEvent) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = draggables.map(d => d.mesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        controls.enabled = false;
        const hitMesh = intersects[0].object;
        draggedObject = draggables.find(d => d.mesh === hitMesh) || null;

        if (draggedObject) {
          // Animate to bigger scale with bounce
          const origScale = originalScales.get(draggedObject.mesh)!;
          const bigScale = origScale.clone().multiplyScalar(1.3);
          startScaleAnim(draggedObject, bigScale, 400);

          // Make brighter red with glow
          const mat = draggedObject.mesh.material as THREE.MeshStandardMaterial;
          mat.emissive.setHex(0xff0000);
          mat.emissiveIntensity = 2.0;

          // Add to bloom layer for selective glow
          draggedObject.mesh.layers.enable(BLOOM_LAYER);
          draggedObject.edges.layers.enable(BLOOM_LAYER);
          bloomActive = true;

          // Set drag plane at object height
          dragPlane.constant = -draggedObject.body.position.y;

          // Create constraint
          const hitPoint = intersects[0].point;
          mouseBody.position.set(hitPoint.x, hitPoint.y, hitPoint.z);

          dragConstraint = new CANNON.PointToPointConstraint(
            draggedObject.body,
            new CANNON.Vec3(0, 0, 0),
            mouseBody,
            new CANNON.Vec3(0, 0, 0),
            50 // force
          );
          world.addConstraint(dragConstraint);
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
        // Animate back to original scale with bounce
        const origScale = originalScales.get(draggedObject.mesh)!;
        startScaleAnim(draggedObject, origScale, 400);

        // Restore original emissive and disable glow
        const mat = draggedObject.mesh.material as THREE.MeshStandardMaterial;
        if (draggedObject.mesh === diamond) {
          mat.emissive.setHex(0x200505);
          mat.emissiveIntensity = 0.35;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }

        // Remove from bloom layer
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

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("mouseleave", onMouseUp);

    // Selective bloom setup
    const bloomLayer = new THREE.Layers();
    bloomLayer.set(BLOOM_LAYER);

    // Materials cache for darkening non-bloom objects
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

    // Bloom composer (renders only bloom layer objects)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5, // strength
      0.6, // radius
      0.1 // threshold (low to catch emissive)
    );
    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(renderScene);
    bloomComposer.addPass(bloomPass);

    // Shader to blend bloom with scene
    const BlendShader = {
      uniforms: {
        tDiffuse: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
        bloomIntensity: { value: 0.0 },
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

    // Final composer
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const blendPass = new ShaderPass(BlendShader);
    blendPass.needsSwap = true;
    composer.addPass(blendPass);

    const ditherPass = new ShaderPass(DitherPixelShader);
    composer.addPass(ditherPass);
    ditherPassRef.current = ditherPass;

    // Track if bloom is active
    let bloomActive = false;

    // Animation
    const clock = new THREE.Clock();
    let animationId: number;
    const introStartTime = performance.now();
    const introDuration = 1500; // 1.5 seconds for scale animation
    let introComplete = false;

    function animate() {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // FPS counter
      frameCount++;
      const now = performance.now();
      if (now - lastFpsUpdate >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
        fpsDiv.textContent = `${currentFps} FPS`;
      }

      // Intro scale animation (skip if object is being dragged)
      const elapsed = performance.now() - introStartTime;
      const sphereDragged = draggedObject?.mesh === sphere;
      const diamondDragged = draggedObject?.mesh === diamond;

      if (elapsed < introDuration) {
        const t = elapsed / introDuration;
        // Ease out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        if (!sphereDragged) {
          const sphereScale = 0.5 + 0.5 * eased;
          sphere.scale.setScalar(sphereScale);
          sphereEdges.scale.setScalar(sphereScale);
          originalScales.set(sphere, new THREE.Vector3(1, 1, 1));
        }
        if (!diamondDragged) {
          const diamondScaleXZ = 0.35 + 0.35 * eased;
          const diamondScaleY = 0.5 + 0.5 * eased;
          diamond.scale.set(diamondScaleXZ, diamondScaleY, diamondScaleXZ);
          diamondEdges.scale.set(diamondScaleXZ, diamondScaleY, diamondScaleXZ);
          originalScales.set(diamond, new THREE.Vector3(0.7, 1, 0.7));
        }
      } else if (!introComplete) {
        introComplete = true;
        originalScales.set(sphere, new THREE.Vector3(1, 1, 1));
        originalScales.set(diamond, new THREE.Vector3(0.7, 1, 0.7));
        if (!sphereDragged) {
          sphere.scale.setScalar(1);
          sphereEdges.scale.setScalar(1);
        }
        if (!diamondDragged) {
          diamond.scale.set(0.7, 1, 0.7);
          diamondEdges.scale.set(0.7, 1, 0.7);
        }
      }

      // Update scale animations
      scaleAnims = scaleAnims.filter(anim => {
        const animElapsed = now - anim.startTime;
        const t = Math.min(animElapsed / anim.duration, 1);
        const eased = easeOutBounce(t);

        const newScale = new THREE.Vector3().lerpVectors(anim.startScale, anim.endScale, eased);
        anim.mesh.scale.copy(newScale);
        anim.edges.scale.copy(newScale);

        return t < 1; // Keep animation if not done
      });

      // Step physics (more substeps for fast falling objects)
      world.step(1 / 120, delta, 10);

      // Sync Three.js with physics
      sphere.position.copy(sphereBody.position as unknown as THREE.Vector3);
      sphere.quaternion.copy(sphereBody.quaternion as unknown as THREE.Quaternion);
      sphereEdges.position.copy(sphere.position);
      sphereEdges.quaternion.copy(sphere.quaternion);

      diamond.position.copy(diamondBody.position as unknown as THREE.Vector3);
      diamond.quaternion.copy(diamondBody.quaternion as unknown as THREE.Quaternion);
      diamondEdges.position.copy(diamond.position);
      diamondEdges.quaternion.copy(diamond.quaternion);

      controls.update();

      // Selective bloom rendering
      if (bloomActive) {
        // Darken non-bloom objects and render bloom pass
        scene.traverse(darkenNonBloomed);
        bloomComposer.render();
        scene.traverse(restoreMaterial);
        blendPass.uniforms.bloomIntensity.value = 1.0;
      } else {
        blendPass.uniforms.bloomIntensity.value = 0.0;
      }

      // Render main scene with blended bloom
      composer.render();
      labelRenderer.render(scene, camera);
    }
    animate();

    // Resize handler
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
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("mouseleave", onMouseUp);
      controls.dispose();
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
      containerRef.current?.removeChild(labelRenderer.domElement);
      containerRef.current?.removeChild(fpsDiv);
    };
  }, [onRendererReady]);

  // Update shader uniforms when settings change
  useEffect(() => {
    if (ditherPassRef.current) {
      ditherPassRef.current.uniforms.pixelSize.value = settings.pixel_size;
      ditherPassRef.current.uniforms.ditherStrength.value = settings.dither_strength;
      ditherPassRef.current.uniforms.gloom.value = settings.gloom;
      ditherPassRef.current.uniforms.contrast.value = settings.contrast;
    }
  }, [settings]);

  return <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />;
}
