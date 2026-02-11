import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RetroScene from "./components/RetroScene";
import SplashScreen from "./components/SplashScreen";
import MainMenu from "./components/MainMenu";
// import ControlPanel from "./components/ControlPanel";
import { DEFAULT_SETTINGS, type Settings } from "./types";
import { setMusicEnabled as applyMusicEnabled, setSoundEnabled as applySoundEnabled } from "./animations/sound-effects";
import { setCurrentTheme, type ThemeName } from "./theme";
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
  const [showSplash, setShowSplash] = useState(true);
  const [showMenu, setShowMenu] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [theme, setTheme] = useState<ThemeName>("red");
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (isTauri) {
      invokeCommand<Settings>("load_settings")
        .then(setSettings)
        .catch(console.error);
    }
  }, []);

  useEffect(() => {
    applySoundEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    applyMusicEnabled(musicEnabled);
  }, [musicEnabled]);

  useEffect(() => {
    setCurrentTheme(theme);
  }, [theme]);

  /* const handleSave = useCallback(async () => {
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
  }, []); */

  const handleRendererReady = useCallback((renderer: THREE.WebGLRenderer) => {
    rendererRef.current = renderer;
  }, []);

  const handleExit = useCallback(async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
        return;
      } catch (err) {
        console.error("Failed to close Tauri window:", err);
      }
    }
    window.close();
  }, []);

  return (
    <div className={`app theme-${theme}`}>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <RetroScene key={theme} settings={settings} onRendererReady={handleRendererReady} />
      <MainMenu
        isOpen={!showSplash && showMenu}
        showOptions={showOptions}
        soundEnabled={soundEnabled}
        musicEnabled={musicEnabled}
        theme={theme}
        onStart={() => {
          setShowMenu(false);
          setShowOptions(false);
        }}
        onOpenOptions={() => setShowOptions(true)}
        onCloseOptions={() => setShowOptions(false)}
        onExit={handleExit}
        onSoundChange={setSoundEnabled}
        onMusicChange={setMusicEnabled}
        onThemeChange={setTheme}
      />
{/* <ControlPanel
        settings={settings}
        onChange={setSettings}
        onSave={handleSave}
        onLoad={handleLoad}
        onReset={handleReset}
        onScreenshot={handleScreenshot}
      /> */}
      {!showMenu && <div className="hint">Drag to orbit. Wheel to zoom.</div>}
    </div>
  );
}

export default App;
