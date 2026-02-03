import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Settings } from "../types";
import RetroSceneOverlays from "./retroScene/Overlays";
import { useSceneNavigationState } from "./retroScene/navigation";
import { createSceneRuntime } from "./retroScene/runtime";
import type { SceneRuntime } from "./retroScene/types";
import { useRetroSceneViewModel } from "./retroScene/useRetroSceneViewModel";
import { isFlightModeActive, subscribeFlightMode } from "../animations/flight-mode";

interface RetroSceneProps {
  settings: Settings;
  onRendererReady?: (renderer: THREE.WebGLRenderer) => void;
}

export default function RetroScene({ settings, onRendererReady }: RetroSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ditherPassRef = useRef<ShaderPass | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);

  const { canGoBack, currentPath } = useSceneNavigationState();
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [showMechaButton, setShowMechaButton] = useState(true);
  const [isFlightMode, setIsFlightMode] = useState(() => isFlightModeActive());
  const { breadcrumbs, handleBack, navigateToComputer, loadDirectory, loadMecha } = useRetroSceneViewModel({
    canGoBack,
    currentPath,
    runtimeRef,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const runtime = createSceneRuntime({
      container: containerRef.current,
      onRendererReady,
      onWindowSizeChange: setWindowSize,
      onShowMechaButtonChange: setShowMechaButton,
    });
    runtimeRef.current = runtime;
    ditherPassRef.current = runtime.ditherPass;

    return () => {
      runtimeRef.current = null;
      ditherPassRef.current = null;
      runtime.dispose();
    };
  }, [onRendererReady]);

  // Update shader uniforms
  useEffect(() => {
    const ditherPass = ditherPassRef.current;
    if (ditherPass) {
      ditherPass.uniforms.pixelSize.value = settings.pixel_size;
      ditherPass.uniforms.ditherStrength.value = settings.dither_strength;
      ditherPass.uniforms.gloom.value = settings.gloom;
      ditherPass.uniforms.contrast.value = settings.contrast;
    }
  }, [settings]);

  useEffect(() => {
    return subscribeFlightMode(setIsFlightMode);
  }, []);

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
        onLoadDirectory={loadDirectory}
        onLoadMecha={loadMecha}
        showMechaButton={showMechaButton}
        showControls={isFlightMode}
      />
    </>
  );
}
