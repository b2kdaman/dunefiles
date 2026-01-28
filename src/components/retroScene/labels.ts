import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SceneObject } from "../../animations/types";
import { MAX_SCALE, MIN_SCALE } from "./constants";

export function createLabel(name: string, size: string, scale: number, objectHeight: number = 1.1): CSS2DObject {
  // Trim long names
  const maxLen = 16;
  const displayName = name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
  const isTrimmed = name.length > maxLen;

  // Scale font size based on screen size and object scale (1.5x larger)
  const screenScale = Math.min(window.innerWidth, window.innerHeight) / 1000;
  const baseFontSize = 18 * screenScale;  // 1.2x minimum
  const fontSize = Math.round(baseFontSize + (scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) * 10.8 * screenScale);
  const padding = Math.round(5.4 + scale * 3.6);

  const div = document.createElement("div");
  div.style.cssText = `
    background: rgba(0, 0, 0, 0.7);
    border: 3px solid #ff0000;
    padding: ${padding}px ${padding * 2}px;
    font: ${fontSize}px 'VCR OSD Mono', ui-monospace, monospace;
    color: #ffffff;
    white-space: nowrap;
    pointer-events: auto;
    text-align: center;
    transform: translate(-50%, -50%);
    cursor: default;
    transition: background 0.15s;
    user-select: none;
    -webkit-user-select: none;
    letter-spacing: 1.5px;
  `;

  const nameDiv = document.createElement("div");
  nameDiv.style.color = "#ff6666";
  nameDiv.textContent = displayName;
  div.appendChild(nameDiv);

  if (size) {
    const sizeDiv = document.createElement("div");
    sizeDiv.style.color = "#888";
    sizeDiv.textContent = size;
    div.appendChild(sizeDiv);
  }

  // Show full name on hover if trimmed
  if (isTrimmed) {
    div.addEventListener("mouseenter", () => {
      nameDiv.textContent = name;
      div.style.background = "rgba(0, 0, 0, 0.9)";
      div.style.zIndex = "1000";
    });
    div.addEventListener("mouseleave", () => {
      nameDiv.textContent = displayName;
      div.style.background = "rgba(0, 0, 0, 0.7)";
      div.style.zIndex = "";
    });
  }

  // Pass through click/drag events to the scene
  const passThrough = (e: MouseEvent) => {
    div.style.pointerEvents = "none";
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    div.style.pointerEvents = "auto";
    if (elementBelow && elementBelow !== div) {
      elementBelow.dispatchEvent(new MouseEvent(e.type, e));
    }
  };

  // Pass through wheel events
  const passThroughWheel = (e: WheelEvent) => {
    div.style.pointerEvents = "none";
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    div.style.pointerEvents = "auto";
    if (elementBelow && elementBelow !== div) {
      elementBelow.dispatchEvent(new WheelEvent(e.type, e));
    }
  };

  div.addEventListener("mousedown", passThrough);
  div.addEventListener("mouseup", passThrough);
  div.addEventListener("mousemove", passThrough);
  div.addEventListener("dblclick", passThrough);
  div.addEventListener("wheel", passThroughWheel);

  const label = new CSS2DObject(div);
  // Position based on base geometry height (not scaled)
  label.position.set(0, objectHeight + 0.2, 0);
  label.center.set(0.5, 1);
  return label;
}

export function updateLabelFontSizes(sceneObjects: SceneObject[], screenScale: number): void {
  for (const obj of sceneObjects) {
    obj.mesh.traverse((child) => {
      if (child instanceof CSS2DObject) {
        const label = child as CSS2DObject;
        const div = label.element;

        // Recalculate font size based on new screen size and object scale
        const baseFontSize = 18 * screenScale;
        const fontSize = Math.round(baseFontSize + (obj.scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) * 10.8 * screenScale);
        const padding = Math.round(5.4 + obj.scale * 3.6);

        // Update font size in the style
        const currentFont = div.style.font;
        div.style.font = currentFont.replace(/\d+px/, `${fontSize}px`);
        div.style.padding = `${padding}px ${padding * 2}px`;
      }
    });
  }
}
