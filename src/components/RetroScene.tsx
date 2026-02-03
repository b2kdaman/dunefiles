import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Settings } from "../types";
import RetroSceneOverlays from "./retroScene/Overlays";
import { useSceneNavigationState } from "./retroScene/navigation";
import { createSceneRuntime } from "./retroScene/runtime";
import type { SceneRuntime } from "./retroScene/types";
import { isFlightModeActive } from "../animations/flight-mode";

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
    let last = isFlightModeActive();
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
    if (runtimeRef.current && canGoBack) {
      runtimeRef.current.navigateBack();
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
    if (runtimeRef.current) {
      await runtimeRef.current.returnToComputer();
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
        onLoadDirectory={(path) => runtimeRef.current?.loadDirectory(path)}
        onLoadMecha={() => runtimeRef.current?.loadMecha()}
        showMechaButton={showMechaButton}
        showControls={isFlightMode}
      />
    </>
  );
}
