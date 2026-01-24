import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RetroScene from "./components/RetroScene";
import ControlPanel from "./components/ControlPanel";
import { DEFAULT_SETTINGS, type Settings } from "./types";
import "./App.css";

// Check if running in Tauri
const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw new Error("Not in Tauri");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (isTauri) {
      invokeCommand<Settings>("load_settings")
        .then(setSettings)
        .catch(console.error);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!isTauri) return;
    try {
      await invokeCommand("save_settings", { settings });
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }, [settings]);

  const handleLoad = useCallback(async () => {
    if (!isTauri) return;
    try {
      const loaded = await invokeCommand<Settings>("load_settings");
      setSettings(loaded);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }, []);

  const handleReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const handleScreenshot = useCallback(async () => {
    if (!rendererRef.current) return;
    if (!isTauri) {
      // Browser fallback: download directly
      const link = document.createElement("a");
      link.download = "screenshot.png";
      link.href = rendererRef.current.domElement.toDataURL("image/png");
      link.click();
      return;
    }
    try {
      const dataUrl = rendererRef.current.domElement.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const path = await invokeCommand<string>("save_screenshot", { pngBase64: base64 });
      console.log("Screenshot saved to:", path);
    } catch (err) {
      console.error("Failed to save screenshot:", err);
    }
  }, []);

  const handleRendererReady = useCallback((renderer: THREE.WebGLRenderer) => {
    rendererRef.current = renderer;
  }, []);

  return (
    <div className="app">
      <RetroScene settings={settings} onRendererReady={handleRendererReady} />
      <ControlPanel
        settings={settings}
        onChange={setSettings}
        onSave={handleSave}
        onLoad={handleLoad}
        onReset={handleReset}
        onScreenshot={handleScreenshot}
      />
      <div className="hint">Drag to orbit. Wheel to zoom.</div>
    </div>
  );
}

export default App;
