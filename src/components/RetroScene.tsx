import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { FileEntry } from "../store/sceneStore";
import type { Settings } from "../types";
import RetroSceneOverlays from "./retroScene/Overlays";
import { createLoadingOverlay, createFpsCounter } from "./retroScene/dom";
import { BLOOM_LAYER } from "./retroScene/constants";
import { createRenderPipeline } from "./retroScene/renderPipeline";
import { createSpawnFactory } from "./retroScene/spawn";
import { createSceneContext } from "./retroScene/createSceneContext";
import { createPhysicsWorld } from "./retroScene/createPhysicsWorld";
import { buildWorld } from "./retroScene/buildWorld";
import { registerInteractionHandlers } from "./retroScene/interaction";
import { createNavigationHandlers, useSceneNavigationState } from "./retroScene/navigation";
import { startAnimationLoop } from "./retroScene/animate";
import { registerResizeHandler } from "./retroScene/resize";
import { disposeScene } from "./retroScene/dispose";

// Animation modules
import type { SceneObject, ExitAnim, ScaleAnim, Particle } from "../animations/types";
import { loadMechaAnimation } from "../animations/mecha-animation";
import { isFlightModeActive } from "../animations/flight-mode";
import {
  initSoundSystem,
  ensureAudio,
  startIdleMusic,
  switchToActionMusic,
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
  const exitAnimsRef = useRef<ExitAnim[]>([]);
  const scaleAnimsRef = useRef<ScaleAnim[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const bloomActiveRef = useRef(false);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    sceneObjects: SceneObject[];
    removeObject: (obj: SceneObject) => void;
    spawnEntries: (entries: FileEntry[]) => void;
    returnToComputer: () => Promise<void>;
  } | null>(null);

  const { canGoBack, currentPath } = useSceneNavigationState();
  const navigateBackRef = useRef<(() => void) | null>(null);
  const loadDirectoryRef = useRef<((path: string) => Promise<void>) | null>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const loadMechaRef = useRef<(() => void) | null>(null);
  const [showMechaButton, setShowMechaButton] = useState(true);
  const [isFlightMode, setIsFlightMode] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    exitAnimsRef.current = [];
    scaleAnimsRef.current = [];
    particlesRef.current = [];
    bloomActiveRef.current = false;

    const { renderer, labelRenderer, scene, camera, controls, clock } = createSceneContext({
      container,
      onRendererReady,
    });

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
    startIdleMusic();

    // Scene
    scene.fog = new THREE.FogExp2(0x050101, 0.065);
    scene.background = new THREE.Color(0x050101);

    const groundY = -1.2;
    const { world, defaultMaterial } = createPhysicsWorld({
      groundY,
      onLand: playLand,
    });

    const { fogLayers, infiniteGrid, gridGeometry, gridMaterial, planeGeometry, planeMaterial, plane } = buildWorld({
      scene,
      groundY,
    });

    // All scene objects
    const sceneObjects: SceneObject[] = [];
    const { createDisk, removeObject, spawnEntries, updateWalls } = createSpawnFactory({
      scene,
      world,
      defaultMaterial,
      sceneObjects,
      generateId,
    });

    // Initialize with default walls
    updateWalls(5, 1.0);

    // Exit animations state (uses imported functions)
    const navigation = createNavigationHandlers({
      sceneObjects,
      exitAnimsRef,
      spawnEntries,
      updateWalls,
      createDisk,
      camera,
      controls,
      showLoading,
      hideLoading,
      playSpawn,
      playNavigateIn,
      playNavigateBack,
    });

    // Load mecha model - uses extracted animation module
    function loadMecha() {
      ensureAudio();
      setShowMechaButton(false);
      switchToActionMusic(27, 800);
      loadMechaAnimation(
        scene,
        camera,
        controls,
        renderer,
        BLOOM_LAYER,
        () => {
          setShowMechaButton(true);
        }
      );
    }

    // Store ref for external access
    sceneRef.current = { scene, sceneObjects, removeObject, spawnEntries, returnToComputer: navigation.returnToComputer };
    navigateBackRef.current = navigation.navigateBack;
    loadDirectoryRef.current = navigation.loadDirectory;
    loadMechaRef.current = loadMecha;

    // Load initial disks/home directory
    navigation.loadInitialDisks();
    const cleanupInteraction = registerInteractionHandlers({
      rendererDom: renderer.domElement,
      window,
      scene,
      world,
      camera,
      controls,
      sceneObjects,
      scaleAnimsRef,
      particlesRef,
      onNavigateIntoFolder: navigation.navigateIntoFolder,
      onNavigateBack: navigation.navigateBack,
      isFlightModeActive,
      BLOOM_LAYER,
      onPickup: playPickup,
      onDrop: playDrop,
      onBloomStart: () => {
        bloomActiveRef.current = true;
      },
      onBloomEnd: () => {
        bloomActiveRef.current = false;
      },
    });

    // Bloom setup
    const renderPipeline = createRenderPipeline(renderer, scene, camera, BLOOM_LAYER);
    ditherPassRef.current = renderPipeline.ditherPass;

    // Animation loop
    const stopAnimation = startAnimationLoop({
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
    });

    const cleanupResize = registerResizeHandler({
      window,
      renderer,
      labelRenderer,
      camera,
      renderPipeline,
      sceneObjects,
      onResize: setWindowSize,
    });

    // Cleanup
    return () => {
      stopAnimation();
      cleanupResize();
      cleanupInteraction();
      disposeScene({
        scene,
        world,
        sceneObjects,
        controls,
        renderer,
        fogLayers,
        infiniteGrid,
        gridGeometry,
        gridMaterial,
        plane,
        planeGeometry,
        planeMaterial,
        container,
        labelRenderer,
        fpsDiv,
        loadingOverlay,
      });
      // Sound system cleanup is handled by the sound-effects module
    };
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

  useEffect(() => {
    let last = isFlightModeActive();
    setIsFlightMode(last);
    const interval = window.setInterval(() => {
      const next = isFlightModeActive();
      if (next !== last) {
        last = next;
        setIsFlightMode(next);
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, []);

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
        showControls={isFlightMode}
      />
    </>
  );
}
