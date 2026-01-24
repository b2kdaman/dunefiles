import type { Settings } from "../types";
import "./ControlPanel.css";

interface ControlPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onSave: () => void;
  onLoad: () => void;
  onReset: () => void;
  onScreenshot: () => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <div className="slider-row">
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="value">{value.toFixed(2)}</span>
    </div>
  );
}

export default function ControlPanel({
  settings,
  onChange,
  onSave,
  onLoad,
  onReset,
  onScreenshot,
}: ControlPanelProps) {
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="control-panel">
      <h2>Settings</h2>

      <Slider
        label="Pixel Size"
        value={settings.pixel_size}
        min={1}
        max={8}
        step={0.5}
        onChange={(v) => updateSetting("pixel_size", v)}
      />

      <Slider
        label="Dither Strength"
        value={settings.dither_strength}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => updateSetting("dither_strength", v)}
      />

      <Slider
        label="Gloom"
        value={settings.gloom}
        min={0}
        max={0.5}
        step={0.01}
        onChange={(v) => updateSetting("gloom", v)}
      />

      <Slider
        label="Contrast"
        value={settings.contrast}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(v) => updateSetting("contrast", v)}
      />

      <div className="button-row">
        <button onClick={onSave}>Save</button>
        <button onClick={onLoad}>Load</button>
        <button onClick={onReset}>Reset</button>
      </div>

      <div className="button-row">
        <button onClick={onScreenshot}>Screenshot</button>
      </div>
    </div>
  );
}
