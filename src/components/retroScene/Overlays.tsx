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
    border: "2px solid #ff0000",
    padding: `${padY}px ${padX}px`,
    font: `${fontSize}px 'VCR OSD Mono', ui-monospace, monospace`,
    color: "#ff6666",
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
    border: "2px solid #ff0000",
    padding: `${padY}px ${padX}px`,
    font: `${fontSize}px 'VCR OSD Mono', ui-monospace, monospace`,
    color: "#ff6666",
    cursor: "pointer",
    zIndex: 100,
    letterSpacing: "1px",
  };

  const bigButtonSize = Math.max(80, minSide / 8);
  const bigButtonStyle: CSSProperties = {
    position: "absolute",
    bottom: Math.max(20, minSide / 30),
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0, 0, 0, 0.8)",
    border: "4px solid #ff0000",
    borderRadius: "0",
    width: bigButtonSize,
    height: bigButtonSize,
    font: `bold ${Math.max(48, minSide / 12)}px 'VCR OSD Mono', ui-monospace, monospace`,
    color: "#ff0000",
    cursor: "pointer",
    zIndex: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "none",
    boxShadow: "0 0 20px rgba(255, 0, 0, 0.5)",
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
              {index > 0 && <span style={{ color: "#ff4444", fontSize: `${chevronSize}px` }}>›</span>}
              <span
                style={{
                  cursor: index < breadcrumbs.length - 1 ? "pointer" : "default",
                  color: index < breadcrumbs.length - 1 ? "#ff8888" : "#ff6666",
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
                    e.currentTarget.style.color = "#ff8888";
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
            e.currentTarget.style.background = "rgba(255, 0, 0, 0.2)";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 0, 0, 0.7)";
            e.currentTarget.style.color = "#ff6666";
          }}
        >
          ← Back
        </button>
      )}

      {/* Big X Button - Only show when in folders, not at computer/disks level */}
      {currentPath !== "" && showMechaButton && (
        <button
          onClick={onLoadMecha}
          style={bigButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 0, 0, 0.3)";
            e.currentTarget.style.color = "#ffffff";
            e.currentTarget.style.transform = "translateX(-50%)";
            e.currentTarget.style.boxShadow = "0 0 30px rgba(255, 0, 0, 0.8)";
            e.currentTarget.style.textShadow = "2px 2px 0 #ff0000";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 0, 0, 0.8)";
            e.currentTarget.style.color = "#ff0000";
            e.currentTarget.style.transform = "translateX(-50%)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(255, 0, 0, 0.5)";
            e.currentTarget.style.textShadow = "2px 2px 0 #000000";
          }}
        >
          ×
        </button>
      )}
    </>
  );
}
