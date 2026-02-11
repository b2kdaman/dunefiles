import type { CSSProperties } from "react";

type Breadcrumb = {
  name: string;
  path: string;
};

type WindowSize = {
  width: number;
  height: number;
};

type RetroSceneOverlaysProps = {
  breadcrumbs: Breadcrumb[];
  windowSize: WindowSize;
  canGoBack: boolean;
  currentPath: string;
  onNavigateBack: () => void;
  onNavigateToComputer: () => void;
  onLoadDirectory: (path: string) => void;
  onLoadMecha: () => void;
  showMechaButton: boolean;
  showControls: boolean;
};

export default function RetroSceneOverlays({
  breadcrumbs,
  windowSize,
  canGoBack,
  currentPath,
  onNavigateBack,
  onNavigateToComputer,
  onLoadDirectory,
  onLoadMecha,
  showMechaButton,
  showControls,
}: RetroSceneOverlaysProps) {
  const minSide = Math.min(windowSize.width, windowSize.height);
  const padY = Math.max(8, minSide / 100);
  const padX = Math.max(16, minSide / 50);
  const fontSize = Math.max(14, minSide / 50);
  const gap = Math.max(8, minSide / 100);
  const chevronSize = Math.max(16, minSide / 40);

  const breadcrumbStyle: CSSProperties = {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0, 0, 0, 0.7)",
    border: "2px solid var(--theme-primary)",
    padding: `${padY}px ${padX}px`,
    font: `${fontSize}px 'VCR OSD Mono', ui-monospace, monospace`,
    color: "var(--theme-dim)",
    zIndex: 100,
    display: "flex",
    gap: `${gap}px`,
    alignItems: "center",
    letterSpacing: "1px",
  };

  const breadcrumbItemStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: `${gap}px`,
  };

  const backButtonStyle: CSSProperties = {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(0, 0, 0, 0.7)",
    border: "2px solid var(--theme-primary)",
    padding: `${padY}px ${padX}px`,
    font: `${fontSize}px 'VCR OSD Mono', ui-monospace, monospace`,
    color: "var(--theme-dim)",
    cursor: "pointer",
    zIndex: 100,
    letterSpacing: "1px",
  };

  const controlsPanelStyle: CSSProperties = {
    position: "absolute",
    bottom: Math.max(24, padY * 3),
    right: 12,
    background: "#000000",
    border: "2px solid var(--theme-primary)",
    padding: `${Math.max(8, padY)}px ${Math.max(10, padX * 0.6)}px`,
    font: `${Math.max(12, fontSize * 0.85)}px 'VCR OSD Mono', ui-monospace, monospace`,
    color: "var(--theme-dim)",
    zIndex: 100,
    letterSpacing: "1px",
    textTransform: "uppercase",
    boxShadow: "0 0 18px rgba(0, 0, 0, 0.6)",
  };

  const controlsTitleStyle: CSSProperties = {
    marginBottom: Math.max(6, gap),
    color: "var(--theme-primary)",
    fontSize: `${Math.max(12, fontSize * 0.9)}px`,
    letterSpacing: "2px",
  };

  const controlsListStyle: CSSProperties = {
    display: "grid",
    gap: `${Math.max(6, gap * 0.6)}px`,
  };

  const keyRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: `${Math.max(6, gap * 0.7)}px`,
    flexWrap: "wrap",
  };

  const keyStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: Math.max(22, fontSize * 1.4),
    height: Math.max(22, fontSize * 1.4),
    padding: "2px 6px",
    border: "2px solid var(--theme-primary)",
    color: "var(--theme-dim)",
    background: "color-mix(in srgb, var(--theme-primary) 10%, transparent)",
    boxShadow: "inset 0 0 6px var(--theme-glow)",
    font: `${Math.max(12, fontSize * 0.85)}px 'VCR OSD Mono', ui-monospace, monospace`,
    letterSpacing: "1px",
  };

  const keyLabelStyle: CSSProperties = {
    color: "var(--theme-dim)",
  };

  const bigButtonSize = Math.max(80, minSide / 8);
  const bigButtonStyle: CSSProperties = {
    position: "absolute",
    bottom: Math.max(20, minSide / 30),
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0, 0, 0, 0.8)",
    border: "4px solid var(--theme-primary)",
    borderRadius: "0",
    width: bigButtonSize,
    height: bigButtonSize,
    font: `bold ${Math.max(48, minSide / 12)}px 'VCR OSD Mono', ui-monospace, monospace`,
    color: "var(--theme-primary)",
    cursor: "pointer",
    zIndex: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "none",
    boxShadow: "0 0 20px var(--theme-glow)",
    imageRendering: "pixelated",
    letterSpacing: "0",
    textShadow: "2px 2px 0 #000000",
  };

  return (
    <>
      {breadcrumbs.length > 0 && (
        <div style={breadcrumbStyle}>
          {breadcrumbs.map((crumb, index) => (
            <span key={index} style={breadcrumbItemStyle}>
              {index > 0 && <span style={{ color: "var(--theme-primary)", fontSize: `${chevronSize}px` }}>›</span>}
              <span
                style={{
                  cursor: index < breadcrumbs.length - 1 ? "pointer" : "default",
                  color: index < breadcrumbs.length - 1 ? "var(--theme-soft)" : "var(--theme-dim)",
                  textDecoration: index < breadcrumbs.length - 1 ? "underline" : "none",
                }}
                onClick={() => {
                  if (index < breadcrumbs.length - 1) {
                    if (crumb.path === "") {
                      onNavigateToComputer();
                    } else {
                      onLoadDirectory(crumb.path);
                    }
                  }
                }}
                onMouseEnter={(e) => {
                  if (index < breadcrumbs.length - 1) {
                    e.currentTarget.style.color = "#ffffff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (index < breadcrumbs.length - 1) {
                    e.currentTarget.style.color = "var(--theme-soft)";
                  }
                }}
              >
                {crumb.name}
              </span>
            </span>
          ))}
        </div>
      )}
      {(canGoBack || currentPath !== "") && (
        <button
          onClick={() => {
            if (canGoBack) {
              onNavigateBack();
            } else if (currentPath !== "") {
              onNavigateToComputer();
            }
          }}
          style={backButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "color-mix(in srgb, var(--theme-primary) 20%, transparent)";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 0, 0, 0.7)";
            e.currentTarget.style.color = "var(--theme-dim)";
          }}
        >
          ← Back
        </button>
      )}

      {showControls && (
        <div style={controlsPanelStyle}>
          <div style={controlsTitleStyle}>Controls</div>
          <div style={controlsListStyle}>
            <div style={keyRowStyle}>
              <span style={keyStyle}>W</span>
              <span style={keyStyle}>S</span>
              <span style={keyLabelStyle}>Speed</span>
            </div>
            <div style={keyRowStyle}>
              <span style={keyStyle}>A</span>
              <span style={keyStyle}>D</span>
              <span style={keyLabelStyle}>Strafe</span>
            </div>
            <div style={keyRowStyle}>
              <span style={keyStyle}>Q</span>
              <span style={keyStyle}>E</span>
              <span style={keyLabelStyle}>Roll</span>
            </div>
            <div style={keyRowStyle}>
              <span style={keyStyle}>Mouse</span>
              <span style={keyLabelStyle}>Aim</span>
            </div>
            <div style={keyRowStyle}>
              <span style={keyStyle}>ESC</span>
              <span style={keyLabelStyle}>Exit</span>
            </div>
          </div>
        </div>
      )}

      {/* Big X Button - Only show when in folders, not at computer/disks level */}
      {currentPath !== "" && showMechaButton && (
        <button
          onClick={onLoadMecha}
          style={bigButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "color-mix(in srgb, var(--theme-primary) 30%, transparent)";
            e.currentTarget.style.color = "#ffffff";
            e.currentTarget.style.transform = "translateX(-50%)";
            e.currentTarget.style.boxShadow = "0 0 30px var(--theme-glow)";
            e.currentTarget.style.textShadow = "2px 2px 0 var(--theme-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 0, 0, 0.8)";
            e.currentTarget.style.color = "var(--theme-primary)";
            e.currentTarget.style.transform = "translateX(-50%)";
            e.currentTarget.style.boxShadow = "0 0 20px var(--theme-glow)";
            e.currentTarget.style.textShadow = "2px 2px 0 #000000";
          }}
        >
          ×
        </button>
      )}
    </>
  );
}
