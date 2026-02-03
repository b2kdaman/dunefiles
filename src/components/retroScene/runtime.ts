import * as THREE from "three";
import { BLOOM_LAYER } from "./constants";
import { createLoadingOverlay, createFpsCounter } from "./dom";
import { createSceneContext } from "./createSceneContext";
import { createPhysicsWorld } from "./createPhysicsWorld";
import { buildWorld } from "./buildWorld";
import { createSpawnFactory } from "./spawn";
import { createNavigationHandlers } from "./navigation";
import { registerInteractionHandlers } from "./interaction";
import { createRenderPipeline } from "./renderPipeline";
import { startAnimationLoop } from "./animate";
import { registerResizeHandler } from "./resize";
import { disposeScene } from "./dispose";
import type { SceneObject } from "../../animations/types";
import { loadMechaAnimation } from "../../animations/mecha-animation";
import { isFlightModeActive } from "../../animations/flight-mode";
import type { SceneDeps, SceneMutableState, SceneRuntime } from "./types";
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
} from "../../animations/sound-effects";

let objectIdCounter = 0;

function generateId() {
  return `obj_${objectIdCounter++}`;
}

export function createSceneRuntime({
  container,
  onRendererReady,
  onWindowSizeChange,
  onShowMechaButtonChange,
}: SceneDeps): SceneRuntime {
  const mutableState: SceneMutableState = {
    exitAnimsRef: { current: [] },
    scaleAnimsRef: { current: [] },
    particlesRef: { current: [] },
    bloomActiveRef: { current: false },
  };

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

  initSoundSystem();
  startIdleMusic();

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

  const sceneObjects: SceneObject[] = [];
  const { createDisk, removeObject, spawnEntries, updateWalls } = createSpawnFactory({
    scene,
    world,
    defaultMaterial,
    sceneObjects,
    generateId,
  });

  updateWalls(5, 1.0);

  const navigation = createNavigationHandlers({
    sceneObjects,
    exitAnimsRef: mutableState.exitAnimsRef,
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

  function loadMecha() {
    ensureAudio();
    onShowMechaButtonChange(false);
    switchToActionMusic(27, 800);
    loadMechaAnimation(scene, camera, controls, renderer, BLOOM_LAYER, () => {
      onShowMechaButtonChange(true);
    });
  }

  navigation.loadInitialDisks();

  const cleanupInteraction = registerInteractionHandlers({
    rendererDom: renderer.domElement,
    window,
    scene,
    world,
    camera,
    controls,
    sceneObjects,
    scaleAnimsRef: mutableState.scaleAnimsRef,
    particlesRef: mutableState.particlesRef,
    onNavigateIntoFolder: navigation.navigateIntoFolder,
    onNavigateBack: navigation.navigateBack,
    isFlightModeActive,
    BLOOM_LAYER,
    onPickup: playPickup,
    onDrop: playDrop,
    onBloomStart: () => {
      mutableState.bloomActiveRef.current = true;
    },
    onBloomEnd: () => {
      mutableState.bloomActiveRef.current = false;
    },
  });

  const renderPipeline = createRenderPipeline(renderer, scene, camera, BLOOM_LAYER);

  const stopAnimation = startAnimationLoop({
    clock,
    fpsDiv,
    fogLayers,
    exitAnimsRef: mutableState.exitAnimsRef,
    scaleAnimsRef: mutableState.scaleAnimsRef,
    particlesRef: mutableState.particlesRef,
    sceneObjects,
    removeObject,
    world,
    scene,
    camera,
    controls,
    labelRenderer,
    renderPipeline,
    isFlightModeActive,
    bloomActiveRef: mutableState.bloomActiveRef,
  });

  const cleanupResize = registerResizeHandler({
    window,
    renderer,
    labelRenderer,
    camera,
    renderPipeline,
    sceneObjects,
    onResize: onWindowSizeChange,
  });

  return {
    ditherPass: renderPipeline.ditherPass,
    navigateBack: navigation.navigateBack,
    loadDirectory: navigation.loadDirectory,
    returnToComputer: navigation.returnToComputer,
    loadMecha,
    dispose: () => {
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
    },
  };
}
