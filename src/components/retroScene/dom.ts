import { getCurrentThemePalette, hexToCss, rgbaFromHex } from "../../theme";

type LoadingOverlay = {
  overlay: HTMLDivElement;
  show: () => void;
  hide: () => void;
  dispose: () => void;
};

export function createFpsCounter(container: HTMLElement): HTMLDivElement {
  const palette = getCurrentThemePalette();
  const fpsDiv = document.createElement("div");
  fpsDiv.style.cssText = `
    position: absolute;
    top: 12px;
    left: 12px;
    color: ${hexToCss(palette.dimHex)};
    font: 14px 'VCR OSD Mono', ui-monospace, monospace;
    z-index: 100;
    pointer-events: none;
    letter-spacing: 1px;
  `;
  container.appendChild(fpsDiv);
  return fpsDiv;
}

export function createLoadingOverlay(container: HTMLElement): LoadingOverlay {
  const palette = getCurrentThemePalette();
  const loadingOverlay = document.createElement("div");
  loadingOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 200;
  `;
  const spinner = document.createElement("div");
  spinner.style.cssText = `
    width: 50px;
    height: 50px;
    border: 4px solid #333;
    border-top: 4px solid ${rgbaFromHex(palette.primaryHex, 0.95)};
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;
  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: 'VCR OSD Mono';
      src: url('/src/assets/VCR_OSD_MONO_1.001.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
  loadingOverlay.appendChild(spinner);
  container.appendChild(loadingOverlay);

  return {
    overlay: loadingOverlay,
    show: () => {
      loadingOverlay.style.display = "flex";
    },
    hide: () => {
      loadingOverlay.style.display = "none";
    },
    dispose: () => {
      if (loadingOverlay.parentNode) loadingOverlay.parentNode.removeChild(loadingOverlay);
      if (style.parentNode) style.parentNode.removeChild(style);
    },
  };
}
