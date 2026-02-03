import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Line2 } from "three/examples/jsm/lines/Line2.js";
// easing functions are used by camera-animation.ts which is called from here
import { createPixelParticleSystem } from "./particles";
import { focusCameraOnTarget, orbitCamera, transitionToCockpit } from "./camera-animation";
import { enterFlightMode } from "./flight-mode";
import { playMechaAppear } from "./sound-effects";

// Beam shader definition
const beamShader = {
  uniforms: {
    color: { value: new THREE.Color(0xff0000) },
    opacity: { value: 0.0 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying float vY;
    void main() {
      vUv = uv;
      vY = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float opacity;
    uniform float time;
    varying vec2 vUv;
    varying float vY;

    void main() {
      // Vertical gradient - brighter at center
      float centerGlow = 1.0 - abs(vUv.x - 0.5) * 2.0;
      centerGlow = pow(centerGlow, 0.5);

      // Pulsing effect
      float pulse = 0.8 + 0.2 * sin(time * 10.0 + vY * 0.5);

      // Edge glow
      float edgeGlow = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);

      vec3 finalColor = color * (0.5 + centerGlow * 0.5) * pulse;
      float finalOpacity = opacity * edgeGlow * centerGlow;

      gl_FragColor = vec4(finalColor, finalOpacity);
    }
  `,
};

/**
 * Load and animate the mecha model with beam effect.
 */
export function loadMechaAnimation(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  renderer: THREE.WebGLRenderer,
  BLOOM_LAYER: number,
  onComplete?: () => void,
  onCinematicStart?: () => void,
  onCinematicEnd?: () => void
): void {
  const loader = new GLTFLoader();

  // Set up Draco loader for compressed geometries
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
  loader.setDRACOLoader(dracoLoader);

  loader.load(
    "/src/assets/mesh_blend.glb",
    (gltf) => {
      const mecha = gltf.scene;

      // Mecha position settings
      const mechaStartY = 20;
      const mechaEndY = 8;
      mecha.position.set(0, mechaStartY, 0);
      mecha.scale.set(2, 2, 2);

      // Store all mecha materials for opacity animation
      const mechaMaterials: THREE.MeshStandardMaterial[] = [];

      // Add red edges to all meshes
      const edgeLines: Line2[] = [];
      mecha.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;

          // Fix broken geometry - recompute normals
          if (mesh.geometry) {
            mesh.geometry.deleteAttribute("normal");
            mesh.geometry.computeVertexNormals();
          }

          // Apply red material tint and make transparent
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat.color) {
              mat.color.setHex(0x660000);
            }
            mat.emissive = new THREE.Color(0xff0000);
            mat.emissiveIntensity = 1.2;
            mat.transparent = true;
            mat.opacity = 0;
            mat.flatShading = true;
            mat.needsUpdate = true;
            mechaMaterials.push(mat);
          }

          // Edges disabled for this mesh; use material glow instead
        }
      });

      scene.add(mecha);

      // Disable controls
      controls.enabled = false;

      // Calculate where the mecha center will be
      const targetCenter = new THREE.Vector3(0, mechaEndY, 0);
      const focusPos = new THREE.Vector3(0, mechaEndY - 1, 12);

      // First: Focus camera on where mecha will appear
      focusCameraOnTarget(camera, controls, targetCenter, focusPos, 1000, () => {
        // Camera is focused, now start the beam animation
        startBeamAnimation(
          scene,
          camera,
          controls,
          renderer,
          mecha,
          mechaMaterials,
          edgeLines,
          mechaStartY,
          mechaEndY,
          BLOOM_LAYER,
          onComplete,
          onCinematicStart,
          onCinematicEnd
        );
      });
    },
    (progress) => {
      console.log("Loading mecha:", ((progress.loaded / progress.total) * 100).toFixed(2) + "%");
    },
    (error) => {
      console.error("Error loading mecha:", error);
    }
  );
}

/**
 * Start the beam animation sequence after camera is focused.
 */
function startBeamAnimation(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  renderer: THREE.WebGLRenderer,
  mecha: THREE.Group,
  mechaMaterials: THREE.MeshStandardMaterial[],
  edgeLines: Line2[],
  mechaStartY: number,
  mechaEndY: number,
  BLOOM_LAYER: number,
  onComplete?: () => void,
  onCinematicStart?: () => void,
  onCinematicEnd?: () => void
): void {
  const cinematicBars = createCinematicBars(onCinematicEnd);
  onCinematicStart?.();
  playMechaAppear();
  // Pixel particle system
  const particleSystem = createPixelParticleSystem();

  // Create red beam effect
  const beamHeight = 40;
  const beamStartScaleX = 6;
  const beamStartScaleZ = 6;
  const beamGeometry = new THREE.CylinderGeometry(1, 1, beamHeight, 16, 1, true);
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xff0000) },
      opacity: { value: 0.0 },
      time: { value: 0 },
    },
    vertexShader: beamShader.vertexShader,
    fragmentShader: beamShader.fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.set(0, beamHeight / 2, 0);
  beam.scale.set(beamStartScaleX, 1, beamStartScaleZ);
  scene.add(beam);

  // Add inner bright red core beam
  const coreGeometry = new THREE.CylinderGeometry(0.3, 0.3, beamHeight, 8, 1);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2222,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const coreBeam = new THREE.Mesh(coreGeometry, coreMaterial);
  coreBeam.position.set(0, beamHeight / 2, 0);
  coreBeam.scale.set(beamStartScaleX * 0.3, 1, beamStartScaleZ * 0.3);
  scene.add(coreBeam);

  // Animation phases
  const beamAppearDuration = 300; // Beam fades in
  const beamShrinkDuration = 1000; // Beam shrinks, mecha fades in and descends
  const totalBeamDuration = beamAppearDuration + beamShrinkDuration;
  const particleFadeOutDuration = 800; // Extra time for particles to fade
  const beamStartTime = performance.now();
  let lastFrameTime = beamStartTime;
  let beamParticleTimer = 0;
  let mechaParticleTimer = 0;

  function animateBeamAndMecha() {
    const now = performance.now();
    const elapsed = now - beamStartTime;
    const delta = now - lastFrameTime;
    lastFrameTime = now;

    // Update beam shader time
    beamMaterial.uniforms.time.value = elapsed * 0.001;

    // Update all particles
    particleSystem.updateParticles(scene, delta);

    if (elapsed < beamAppearDuration) {
      // Phase 1: Beam fades in
      const appearT = elapsed / beamAppearDuration;
      beamMaterial.uniforms.opacity.value = appearT * 0.9;
      coreMaterial.opacity = appearT * 0.8;

      // Spawn beam particles
      beamParticleTimer += delta;
      while (beamParticleTimer > 30) {
        particleSystem.spawnBeamParticle(scene);
        beamParticleTimer -= 30;
      }
    } else if (elapsed < totalBeamDuration) {
      // Phase 2: Beam shrinks on X/Z, mecha fades in and descends
      const shrinkElapsed = elapsed - beamAppearDuration;
      const shrinkT = Math.min(shrinkElapsed / beamShrinkDuration, 1);
      const easedShrink = 1 - Math.pow(1 - shrinkT, 3); // ease out cubic

      // Shrink beam on X and Z axes
      const currentScaleX = beamStartScaleX * (1 - easedShrink * 0.95);
      const currentScaleZ = beamStartScaleZ * (1 - easedShrink * 0.95);
      beam.scale.set(currentScaleX, 1, currentScaleZ);
      coreBeam.scale.set(currentScaleX * 0.3, 1, currentScaleZ * 0.3);

      // Fade out beam
      beamMaterial.uniforms.opacity.value = 0.9 * (1 - easedShrink);
      coreMaterial.opacity = 0.8 * (1 - easedShrink);

      // Fade in mecha and animate it down
      const mechaOpacity = easedShrink;
      mechaMaterials.forEach((mat) => {
        mat.opacity = mechaOpacity;
      });
      edgeLines.forEach((edge) => {
        (edge.material as LineMaterial).opacity = mechaOpacity;
      });

      const mechaY = mechaStartY + (mechaEndY - mechaStartY) * easedShrink;
      mecha.position.y = mechaY;

      // Spawn beam particles (less frequent as beam shrinks)
      beamParticleTimer += delta;
      const beamSpawnRate = 30 + shrinkT * 50;
      while (beamParticleTimer > beamSpawnRate) {
        particleSystem.spawnBeamParticle(scene);
        beamParticleTimer -= beamSpawnRate;
      }

      // Spawn mecha particles (more frequent as mecha appears)
      if (shrinkT > 0.2) {
        mechaParticleTimer += delta;
        const mechaSpawnRate = 60 - shrinkT * 30;
        while (mechaParticleTimer > mechaSpawnRate) {
          particleSystem.spawnMechaParticle(scene, mecha.position);
          mechaParticleTimer -= mechaSpawnRate;
        }
      }
    }

    if (elapsed < totalBeamDuration) {
      requestAnimationFrame(animateBeamAndMecha);
    } else {
      // Remove beam
      scene.remove(beam);
      scene.remove(coreBeam);
      beamGeometry.dispose();
      beamMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();

      // Ensure mecha is fully opaque
      mechaMaterials.forEach((mat) => {
        mat.opacity = 1;
        mat.transparent = false;
      });
      edgeLines.forEach((edge) => {
        (edge.material as LineMaterial).opacity = 1;
      });

      // Get the center of the mecha model at final position
      const box = new THREE.Box3().setFromObject(mecha);
      const center = box.getCenter(new THREE.Vector3());

      // Continue updating particles while they fade out, then start orbit
      fadeOutParticles(
        scene,
        camera,
        controls,
        renderer,
        mecha,
        mechaMaterials,
        edgeLines,
        center,
        particleSystem,
        beamStartTime + totalBeamDuration,
        particleFadeOutDuration,
        BLOOM_LAYER,
        cinematicBars,
        () => {
          onComplete?.();
        }
      );
    }
  }

  animateBeamAndMecha();
}

function createCinematicBars(onFadeOutComplete?: () => void) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 250;
  `;
  const topBar = document.createElement("div");
  topBar.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 12vh;
    background: rgba(0, 0, 0, 0.9);
  `;
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 12vh;
    background: rgba(0, 0, 0, 0.9);
  `;
  overlay.appendChild(topBar);
  overlay.appendChild(bottomBar);
  document.body.appendChild(overlay);

  return {
    fadeOut: () => {
      overlay.style.transition = "opacity 700ms ease";
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        onFadeOutComplete?.();
      }, 750);
    },
  };
}

/**
 * Fade out remaining particles then start orbit camera.
 */
function fadeOutParticles(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  renderer: THREE.WebGLRenderer,
  mecha: THREE.Group,
  mechaMaterials: THREE.MeshStandardMaterial[],
  edgeLines: Line2[],
  center: THREE.Vector3,
  particleSystem: ReturnType<typeof createPixelParticleSystem>,
  fadeStartTime: number,
  duration: number,
  BLOOM_LAYER: number,
  cinematicBars: { fadeOut: () => void },
  onComplete?: () => void
): void {
  let lastFrameTime = performance.now();

  function animate() {
    const fadeElapsed = performance.now() - fadeStartTime;
    const now2 = performance.now();
    const delta2 = now2 - lastFrameTime;
    lastFrameTime = now2;

    particleSystem.updateParticles(scene, delta2);

    if (fadeElapsed < duration && particleSystem.getParticles().length > 0) {
      requestAnimationFrame(animate);
    } else {
      particleSystem.cleanup(scene);
      startOrbitSequence(
        scene,
        camera,
        controls,
        renderer,
        mecha,
        mechaMaterials,
        edgeLines,
        center,
        BLOOM_LAYER,
        cinematicBars,
        onComplete
      );
    }
  }

  animate();
}

/**
 * Start the orbit camera sequence followed by cockpit transition.
 */
function startOrbitSequence(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  renderer: THREE.WebGLRenderer,
  mecha: THREE.Group,
  mechaMaterials: THREE.MeshStandardMaterial[],
  edgeLines: Line2[],
  center: THREE.Vector3,
  BLOOM_LAYER: number,
  cinematicBars: { fadeOut: () => void },
  onComplete?: () => void
): void {
  orbitCamera(camera, controls, center, 12, 1500, () => {
    transitionToCockpit(camera, controls, mecha, mechaMaterials, edgeLines, center, 1500, () => {
      cinematicBars.fadeOut();
      enterFlightMode(
        scene,
        camera,
        controls,
        renderer,
        mecha,
        mechaMaterials,
        edgeLines,
        center,
        BLOOM_LAYER,
        () => {
          onComplete?.();
        }
      );
    });
  });
}
