import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as THREE from "three";
import RetroScene from "./components/RetroScene";
import ControlPanel from "./components/ControlPanel";
import { DEFAULT_SETTINGS, type Settings } from "./types";
import "./App.css";

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    invoke<Settings>("load_settings")
      .then(setSettings)
      .catch(console.error);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await invoke("save_settings", { settings });
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }, [settings]);

  const handleLoad = useCallback(async () => {
    try {
      const loaded = await invoke<Settings>("load_settings");
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

    try {
      const dataUrl = rendererRef.current.domElement.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const path = await invoke<string>("save_screenshot", { pngBase64: base64 });
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
