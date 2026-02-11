import { useMemo } from "react";
import type { ThemeName } from "../theme";

interface MainMenuProps {
  isOpen: boolean;
  showOptions: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  theme: ThemeName;
  onStart: () => void;
  onExit: () => void;
  onOpenOptions: () => void;
  onCloseOptions: () => void;
  onSoundChange: (enabled: boolean) => void;
  onMusicChange: (enabled: boolean) => void;
  onThemeChange: (theme: ThemeName) => void;
}

function ToggleRow({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="menu-row">
      <span>{label}</span>
      <div className="menu-toggle-group">
        <button
          type="button"
          className={enabled ? "is-active" : ""}
          onClick={() => onChange(true)}
        >
          ON
        </button>
        <button
          type="button"
          className={!enabled ? "is-active" : ""}
          onClick={() => onChange(false)}
        >
          OFF
        </button>
      </div>
    </div>
  );
}

export default function MainMenu({
  isOpen,
  showOptions,
  soundEnabled,
  musicEnabled,
  theme,
  onStart,
  onExit,
  onOpenOptions,
  onCloseOptions,
  onSoundChange,
  onMusicChange,
  onThemeChange,
}: MainMenuProps) {
  const panelTitle = useMemo(() => (showOptions ? "OPTIONS" : "MAIN MENU"), [showOptions]);

  if (!isOpen) return null;

  return (
    <div className="main-menu-overlay">
      <section className="main-menu-panel" role="dialog" aria-label={panelTitle}>
        <h1>{panelTitle}</h1>

        {!showOptions && (
          <div className="menu-actions">
            <button type="button" onClick={onStart}>
              START
            </button>
            <button type="button" onClick={onOpenOptions}>
              OPTIONS
            </button>
            <button type="button" onClick={onExit}>
              EXIT
            </button>
          </div>
        )}

        {showOptions && (
          <div className="menu-options">
            <ToggleRow label="SOUND" enabled={soundEnabled} onChange={onSoundChange} />
            <ToggleRow label="MUSIC" enabled={musicEnabled} onChange={onMusicChange} />

            <div className="menu-row">
              <span>THEME</span>
              <div className="menu-toggle-group menu-theme-group">
                <button
                  type="button"
                  className={theme === "red" ? "is-active" : ""}
                  onClick={() => onThemeChange("red")}
                >
                  RED
                </button>
                <button
                  type="button"
                  className={theme === "green" ? "is-active" : ""}
                  onClick={() => onThemeChange("green")}
                >
                  GREEN
                </button>
                <button
                  type="button"
                  className={theme === "neon-blue" ? "is-active" : ""}
                  onClick={() => onThemeChange("neon-blue")}
                >
                  NEON BLUE
                </button>
              </div>
            </div>

            <button type="button" className="menu-back" onClick={onCloseOptions}>
              BACK
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
