import * as THREE from "three";
import type { FlightState } from "./types";

export type RadarTarget = {
  mesh: THREE.Mesh;
  type: "circle" | "diamond";
};

type FlightRadar = {
  element: HTMLDivElement;
  update: (camera: THREE.PerspectiveCamera, flightState: FlightState) => void;
  dispose: () => void;
};

export function createFlightRadar(targets: RadarTarget[]): FlightRadar {
  const navigator = document.createElement("div");
  navigator.style.cssText = `
    position: absolute;
    top: 64px;
    right: 64px;
    width: 140px;
    height: 140px;
    border: 2px solid #ff0000;
    background: radial-gradient(circle, rgba(80, 0, 0, 0.55) 0%, rgba(10, 0, 0, 0.6) 70%);
    box-shadow: 0 0 16px rgba(255, 0, 0, 0.3);
    border-radius: 12px;
    pointer-events: none;
  `;

  const navigatorCenter = document.createElement("div");
  navigatorCenter.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    width: 6px;
    height: 6px;
    background: #ff4444;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  `;
  navigator.appendChild(navigatorCenter);


  const navigatorText = document.createElement("div");
  navigatorText.style.cssText = `
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    font: 11px 'VCR OSD Mono', ui-monospace, monospace;
    color: #ff6666;
    letter-spacing: 1px;
    text-shadow: 0 0 6px rgba(255, 0, 0, 0.4);
  `;
  navigator.appendChild(navigatorText);

  const markers = targets.map((target) => {
    const marker = document.createElement("div");
    if (target.type === "diamond") {
      marker.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background: rgba(255, 110, 110, 0.85);
        transform: translate(-50%, -50%) rotate(45deg);
      `;
    } else {
      marker.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background: rgba(255, 80, 80, 0.85);
        border-radius: 50%;
        transform: translate(-50%, -50%);
      `;
    }
    navigator.appendChild(marker);
    return marker;
  });

  const update = (camera: THREE.PerspectiveCamera, flightState: FlightState) => {
    const rect = navigator.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) * 0.42;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const headingAngle = Math.atan2(forward.x, -forward.z) + Math.PI;
    const cosYaw = Math.cos(-headingAngle);
    const sinYaw = Math.sin(-headingAngle);

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const marker = markers[i];
      const targetPos = target.mesh.position;
      const dx = targetPos.x - flightState.position.x;
      const dz = targetPos.z - flightState.position.z;

      const rx = dx * cosYaw - dz * sinYaw;
      const rz = dx * sinYaw + dz * cosYaw;
      const dist = Math.hypot(rx, rz) || 1;
      const scaled = Math.min(radius, dist * 0.15);
      const nx = (rx / dist) * scaled;
      const ny = (rz / dist) * scaled;

      marker.style.left = `${centerX + nx}px`;
      marker.style.top = `${centerY - ny}px`;
      marker.style.opacity = dist > radius / 0.15 ? "0.5" : "0.9";
    }

    navigatorText.textContent = `X ${flightState.position.x.toFixed(1)}  Z ${flightState.position.z.toFixed(1)}`;
  };

  const dispose = () => {
    navigator.remove();
  };

  return { element: navigator, update, dispose };
}
