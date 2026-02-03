import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Line2 } from "three/examples/jsm/lines/Line2.js";
import type { FlightState, Bullet } from "./types";
import { playShoot, ensureAudio, startIdleMusic } from "./sound-effects";
import { resetCameraToDefault } from "./camera-animation";
import { createFlightRadar, type RadarTarget } from "./flight-radar";
import cockpitOverlaySvg from "../assets/cockpit-overlay.svg";

let flightModeActive = false;
const flightModeListeners = new Set<(active: boolean) => void>();

export function isFlightModeActive(): boolean {
  return flightModeActive;
}

export function subscribeFlightMode(listener: (active: boolean) => void): () => void {
  flightModeListeners.add(listener);
  return () => {
    flightModeListeners.delete(listener);
  };
}

function setFlightModeActive(active: boolean) {
  if (flightModeActive === active) return;
  flightModeActive = active;
  for (const listener of flightModeListeners) {
    listener(active);
  }
}

function createStarField() {
  const starCount = 100;
  const radius = 400;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const r = radius * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    const idx = i * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xff3333,
    size: 1.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
  });

  return new THREE.Points(geometry, material);
}

/**
 * Create the cockpit HUD overlay with all UI elements.
 */
function createCockpitOverlay(): HTMLDivElement {
  const cockpitOverlay = document.createElement("div");
  cockpitOverlay.id = "cockpit-overlay";
  cockpitOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 200;
  `;

  // Cockpit frame - top
  const frameTop = document.createElement("div");
  frameTop.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(to bottom, rgba(20, 0, 0, 0.9), transparent);
    border-bottom: 3px solid #ff0000;
  `;

  // Cockpit frame - bottom
  const frameBottom = document.createElement("div");
  frameBottom.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 80px;
    background: linear-gradient(to top, rgba(20, 0, 0, 0.95), transparent);
    border-top: 3px solid #ff0000;
  `;

  // Cockpit frame - left
  const frameLeft = document.createElement("div");
  frameLeft.style.cssText = `
    position: absolute;
    top: 60px;
    left: 0;
    bottom: 80px;
    width: 40px;
    background: linear-gradient(to right, rgba(20, 0, 0, 0.8), transparent);
    border-right: 2px solid #ff000066;
  `;

  // Cockpit frame - right
  const frameRight = document.createElement("div");
  frameRight.style.cssText = `
    position: absolute;
    top: 60px;
    right: 0;
    bottom: 80px;
    width: 40px;
    background: linear-gradient(to left, rgba(20, 0, 0, 0.8), transparent);
    border-left: 2px solid #ff000066;
  `;

  const frameSvg = document.createElement("img");
  frameSvg.src = cockpitOverlaySvg;
  frameSvg.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    mix-blend-mode: screen;
    opacity: 0.86;
    pointer-events: none;
  `;

  // Crosshair
  const crosshair = document.createElement("div");
  crosshair.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    border: 2px solid #ff0000;
    border-radius: 50%;
    opacity: 0.7;
  `;
  const crosshairDot = document.createElement("div");
  crosshairDot.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 4px;
    background: #ff0000;
    border-radius: 50%;
  `;
  crosshair.appendChild(crosshairDot);

  const crosshairOuter = document.createElement("div");
  crosshairOuter.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 180px;
    height: 180px;
    border: 2px solid rgba(255, 0, 0, 0.45);
    border-radius: 50%;
    box-shadow: 0 0 16px rgba(255, 0, 0, 0.2);
    pointer-events: none;
  `;

  const altitudeText = document.createElement("div");
  altitudeText.id = "flight-altitude-text";
  altitudeText.style.cssText = `
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    font: 12px 'VCR OSD Mono', ui-monospace, monospace;
    color: #ff6666;
    letter-spacing: 1px;
    text-shadow: 0 0 6px rgba(255, 0, 0, 0.4);
    text-align: left;
  `;

  // HUD text
  const hudText = document.createElement("div");
  hudText.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    font: 16px 'VCR OSD Mono', ui-monospace, monospace;
    color: #ff0000;
    text-align: center;
    letter-spacing: 2px;
  `;
  hudText.innerHTML =
    "FLIGHT MODE<br><span style='font-size: 12px; color: #ff6666;'>W/S: Speed | A/D: Strafe | Q/E: Roll | Mouse: Aim | Click: Fire | ESC: Exit</span>";

  const targetLabel = document.createElement("div");
  targetLabel.id = "flight-target-label";
  targetLabel.style.cssText = `
    position: absolute;
    top: -28px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    border: 3px solid #ff0000;
    padding: 8px 24px;
    font: 16px 'VCR OSD Mono', ui-monospace, monospace;
    color: #ffffff;
    letter-spacing: 1.5px;
    text-shadow: 0 0 8px rgba(255, 0, 0, 0.3);
    text-align: center;
    min-width: 220px;
    display: none;
    pointer-events: none;
  `;

  // Custom square cursor that follows mouse 1:1
  const customCursor = document.createElement("div");
  customCursor.id = "custom-cursor";
  customCursor.style.cssText = `
    position: fixed;
    width: 20px;
    height: 20px;
    border: 3px solid #ff0000;
    background: rgba(255, 0, 0, 0.3);
    pointer-events: none;
    z-index: 10000;
    transform: translate(-50%, -50%);
  `;

  cockpitOverlay.appendChild(frameTop);
  cockpitOverlay.appendChild(frameBottom);
  cockpitOverlay.appendChild(frameLeft);
  cockpitOverlay.appendChild(frameRight);
  cockpitOverlay.appendChild(frameSvg);
  cockpitOverlay.appendChild(crosshairOuter);
  cockpitOverlay.appendChild(crosshair);
  cockpitOverlay.appendChild(hudText);
  cockpitOverlay.appendChild(customCursor);
  crosshairOuter.appendChild(altitudeText);
  crosshairOuter.appendChild(targetLabel);

  return cockpitOverlay;
}

/**
 * Create initial flight state.
 */
function createFlightState(startPosition: THREE.Vector3): FlightState {
  const startSpeed = 0.015;
  return {
    active: true,
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(0, 0, 0, "YXZ"),
    position: startPosition.clone(),
    keys: { w: false, a: false, s: false, d: false, q: false, e: false },
    yaw: 0,
    pitch: 0,
    roll: 0,
    cursorX: 0,
    cursorY: 0,
    speed: startSpeed,
  };
}

/**
 * Enter flight mode with full cockpit controls.
 */
export function enterFlightMode(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  renderer: THREE.WebGLRenderer,
  mecha: THREE.Group,
  mechaMaterials: THREE.MeshStandardMaterial[],
  edgeLines: Line2[],
  center: THREE.Vector3,
  BLOOM_LAYER: number,
  onExit: () => void
): void {
  const DAMAGE_PER_HIT = 150;
  setFlightModeActive(true);
  // Create and add cockpit overlay
  const cockpitOverlay = createCockpitOverlay();
  document.body.appendChild(cockpitOverlay);

  const fogMeshes: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).userData?.isFogLayer) {
      fogMeshes.push(child);
      child.visible = false;
    }
  });
  const previousFog = scene.fog;
  scene.fog = null;
  const previousFar = camera.far;
  camera.far = 6000;
  camera.updateProjectionMatrix();

  const flightGroundGeometry = new THREE.PlaneGeometry(2000, 2000, 1, 1);
  const flightGroundMaterial = new THREE.MeshStandardMaterial({
    color: 0x140808,
    roughness: 1.0,
    metalness: 0.0,
  });
  const flightGround = new THREE.Mesh(flightGroundGeometry, flightGroundMaterial);
  flightGround.rotation.x = -Math.PI / 2;
  flightGround.position.y = -1.2;
  scene.add(flightGround);

  const starField = createStarField();
  scene.add(starField);

  // Initialize flight state
  const flightState = createFlightState(center.clone().add(new THREE.Vector3(0, 1.5, 0)));

  const altitudeTextEl = document.getElementById("flight-altitude-text");
  const targetLabelEl = document.getElementById("flight-target-label");
  type NavigatorTarget = RadarTarget & { name: string; size: string; sizeBytes?: number };
  const navigatorTargets: NavigatorTarget[] = scene.children
    .filter((child) => (child as THREE.Mesh).isMesh)
    .filter((child) => (child as THREE.Mesh).userData?.isNavigatorTarget)
    .map((child) => ({
      mesh: child as THREE.Mesh,
      type: (child as THREE.Mesh).userData?.navigatorType === "diamond" ? "diamond" : "circle",
      name: (child as THREE.Mesh).userData?.navigatorName as string,
      size: (child as THREE.Mesh).userData?.navigatorSize as string,
      sizeBytes: (child as THREE.Mesh).userData?.navigatorSizeBytes as number | undefined,
    }));

  const radar = createFlightRadar(navigatorTargets.map(({ mesh, type }) => ({ mesh, type })));
  cockpitOverlay.appendChild(radar.element);

  const farBeamHeight = 2000;
  const farBeamDistance = 35;
  const farBeamGeometry = new THREE.CylinderGeometry(0.25, 0.25, farBeamHeight, 8, 1, true);
  const farBeamMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const farBeams = new Map<THREE.Mesh, THREE.Mesh>();

  navigatorTargets.forEach((target) => {
    const beam = new THREE.Mesh(farBeamGeometry, farBeamMaterial);
    beam.position.set(target.mesh.position.x, farBeamHeight / 2 - 1.2, target.mesh.position.z);
    beam.frustumCulled = false;
    beam.visible = false;
    scene.add(beam);
    farBeams.set(target.mesh, beam);
  });

  const hiddenLabels: CSS2DObject[] = [];
  scene.traverse((child) => {
    if (child instanceof CSS2DObject) {
      hiddenLabels.push(child);
      child.element.style.display = "none";
    }
  });

  const aimRaycaster = new THREE.Raycaster();
  const aimNdc = new THREE.Vector2(0, 0);

  // Bullet system
  const bullets: Bullet[] = [];
  const bulletGeometry = new THREE.SphereGeometry(0.06, 8, 8);
  const bulletRaycaster = new THREE.Raycaster();

  function shoot() {
    if (!flightState.active) return;

    // Play sound
    ensureAudio();
    playShoot();

    // Get forward direction from camera
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 2.5,
      transparent: true,
      opacity: 1,
    });
    const bullet = new THREE.Mesh(bulletGeometry, mat);

    // Position at center of cockpit
    bullet.position.copy(flightState.position);
    bullet.position.add(forward.clone().multiplyScalar(1.2));
    bullet.position.add(new THREE.Vector3(0, -0.2, 0));

    // Add glow
    bullet.layers.enable(BLOOM_LAYER);

    scene.add(bullet);
    bullets.push({
      mesh: bullet,
      velocity: forward.clone().multiplyScalar(80),
      life: 0,
      lastPos: bullet.position.clone(),
    });
  }

  function updateBullets(delta: number) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life += delta;
      const nextPos = b.mesh.position.clone().add(b.velocity.clone().multiplyScalar(delta * 0.001));
      const travel = nextPos.clone().sub(b.mesh.position);
      const travelLen = travel.length();
      let hitMesh: THREE.Mesh | null = null;

      if (travelLen > 0) {
        bulletRaycaster.set(b.mesh.position, travel.normalize());
        const hits = bulletRaycaster.intersectObjects(navigatorTargets.map((t) => t.mesh), false);
        const hit = hits.find((h) => h.distance <= travelLen + 0.2);
        if (hit) {
          hitMesh = hit.object as THREE.Mesh;
        }
      }

      if (hitMesh) {
        const hitMat = hitMesh.material as THREE.MeshStandardMaterial;
        if (hitMat && hitMat.emissive) {
          const prevEmissive = hitMat.emissive.getHex();
          const prevIntensity = hitMat.emissiveIntensity ?? 0;
          hitMat.emissive.setHex(0xff0000);
          hitMat.emissiveIntensity = 2.0;
          setTimeout(() => {
            hitMat.emissive.setHex(prevEmissive);
            hitMat.emissiveIntensity = prevIntensity;
          }, 120);
        }
        const body = hitMesh.userData?.physicsBody as CANNON.Body | undefined;
        const impulseDir = b.velocity.clone().normalize();
        if (body) {
          body.applyImpulse(
            new CANNON.Vec3(impulseDir.x * 0.35, impulseDir.y * 0.35, impulseDir.z * 0.35),
            body.position
          );
        } else {
          hitMesh.position.add(impulseDir.multiplyScalar(0.05));
        }
        const maxHp = hitMesh.userData?.navigatorSizeBytes
          ? Math.max(10, Math.round(hitMesh.userData.navigatorSizeBytes / (1024 * 1024)))
          : 10;
        const currentHp = Math.max(0, (hitMesh.userData?.currentHp ?? maxHp) - DAMAGE_PER_HIT);
        hitMesh.userData.currentHp = currentHp;
        scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        bullets.splice(i, 1);
        continue;
      }

      b.mesh.position.copy(nextPos);
      b.lastPos.copy(nextPos);

      // Fade out
      const fadeStart = 500;
      const maxLife = 1500;
      if (b.life > fadeStart) {
        (b.mesh.material as THREE.MeshStandardMaterial).opacity =
          1 - (b.life - fadeStart) / (maxLife - fadeStart);
      }

      if (b.life > maxLife) {
        scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        bullets.splice(i, 1);
      }
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (flightState.active) {
      // Update custom cursor position
      const cursor = document.getElementById("custom-cursor");
      if (cursor) {
        cursor.style.left = e.clientX + "px";
        cursor.style.top = e.clientY + "px";
      }

      // Calculate cursor offset from center in pixels
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const offsetX = e.clientX - centerX;
      const offsetY = e.clientY - centerY;

      // Calculate distance from center
      const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
      const deadzone = 20; // 20px deadzone

      if (distance <= deadzone) {
        // Inside deadzone - no movement
        flightState.cursorX = 0;
        flightState.cursorY = 0;
      } else {
        // Outside deadzone - use actual pixel offset for direct mapping
        const maxDistance = Math.min(centerX, centerY) * 0.8;
        // Subtract deadzone from effective offset
        const effectiveX = offsetX - (offsetX / distance) * deadzone;
        const effectiveY = offsetY - (offsetY / distance) * deadzone;

        flightState.cursorX = Math.max(-1, Math.min(1, effectiveX / maxDistance));
        flightState.cursorY = Math.max(-1, Math.min(1, effectiveY / maxDistance));
      }
    }
  }

  function onMouseDown() {
    if (flightState.active) {
      shoot();
    }
  }

  function onKeyDownFlight(e: KeyboardEvent) {
    if (!flightState.active) return;

    if (e.key === "Escape") {
      exitFlightMode();
      return;
    }

    const key = e.key.toLowerCase();
    if (key === "w") flightState.keys.w = true;
    if (key === "a") flightState.keys.a = true;
    if (key === "s") flightState.keys.s = true;
    if (key === "d") flightState.keys.d = true;
    if (key === "q") flightState.keys.q = true;
    if (key === "e") flightState.keys.e = true;
  }

  function onKeyUpFlight(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (key === "w") flightState.keys.w = false;
    if (key === "a") flightState.keys.a = false;
    if (key === "s") flightState.keys.s = false;
    if (key === "d") flightState.keys.d = false;
    if (key === "q") flightState.keys.q = false;
    if (key === "e") flightState.keys.e = false;
  }

  function exitFlightMode() {
    flightState.active = false;
    setFlightModeActive(false);
    startIdleMusic();

    // Remove cockpit overlay
    const overlay = document.getElementById("cockpit-overlay");
    if (overlay) overlay.remove();

    // Cleanup bullets
    bullets.forEach((b) => {
      scene.remove(b.mesh);
      (b.mesh.material as THREE.Material).dispose();
    });
    bullets.length = 0;

    // Remove flight event listeners
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("mousedown", onMouseDown, true);
    window.removeEventListener("keydown", onKeyDownFlight, true);
    window.removeEventListener("keyup", onKeyUpFlight, true);
    if (flightState.preventDrag) {
      renderer.domElement.removeEventListener("mousedown", flightState.preventDrag, true);
      renderer.domElement.removeEventListener("contextmenu", flightState.preventDrag, true);
    }

    // Show mecha again and reset camera
    mecha.visible = true;
    mechaMaterials.forEach((mat) => {
      mat.transparent = false;
      mat.opacity = 1;
    });
    edgeLines.forEach((edge) => {
      (edge.material as LineMaterial).opacity = 1;
    });

    // Reset camera
    resetCameraToDefault(camera, controls);
    controls.enabled = true;

    // Remove mecha from scene
    scene.remove(mecha);

    scene.fog = previousFog;
    fogMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
    camera.far = previousFar;
    camera.updateProjectionMatrix();

    hiddenLabels.forEach((label) => {
      label.element.style.display = "";
    });

    scene.remove(flightGround);
    flightGroundGeometry.dispose();
    flightGroundMaterial.dispose();

    radar.dispose();

    farBeams.forEach((beam) => {
      scene.remove(beam);
    });
    farBeams.clear();
    farBeamGeometry.dispose();
    farBeamMaterial.dispose();

    scene.remove(starField);
    starField.geometry.dispose();
    (starField.material as THREE.Material).dispose();

    onExit();
  }

  // Flight update loop
  let lastFlightTime = performance.now();
  const upAxis = new THREE.Vector3();
  const rightAxis = new THREE.Vector3();
  const forwardAxis = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const deltaQuat = new THREE.Quaternion();
  const tempEuler = new THREE.Euler(0, 0, 0, "YXZ");

  // Set camera rotation order for proper FPS controls
  camera.rotation.order = "YXZ";

  function updateFlight() {
    if (!flightState.active) return;

    const now = performance.now();
    const delta = now - lastFlightTime;
    lastFlightTime = now;
    const deltaSeconds = delta / 1000;

    // Flight sim style: cursor position = rotation RATE, not target
    // Cursor away from center = continuous rotation in that direction
    // Cursor at center (deadzone) = stop rotating, maintain orientation
    const rotationSpeed = 1.6; // radians per second at max cursor distance
    const rollSpeed = 1.2; // radians per second
    const minSpeed = 0.003;
    const maxSpeed = 0.05;
    const speedAccel = 0.025; // speed units per second

    // Accumulate rotation based on cursor offset and time using local axes.
    const yawDelta = -flightState.cursorX * rotationSpeed * deltaSeconds;
    const pitchDelta = -flightState.cursorY * rotationSpeed * deltaSeconds;
    const rollDir = (flightState.keys.e ? 1 : 0) - (flightState.keys.q ? 1 : 0);
    const rollDelta = rollDir * rollSpeed * deltaSeconds;

    orientation.copy(camera.quaternion);
    if (yawDelta !== 0) {
      upAxis.set(0, 1, 0).applyQuaternion(orientation).normalize();
      deltaQuat.setFromAxisAngle(upAxis, yawDelta);
      orientation.premultiply(deltaQuat);
    }
    if (pitchDelta !== 0) {
      rightAxis.set(1, 0, 0).applyQuaternion(orientation).normalize();
      deltaQuat.setFromAxisAngle(rightAxis, pitchDelta);
      orientation.premultiply(deltaQuat);
    }
    if (rollDelta !== 0) {
      forwardAxis.set(0, 0, -1).applyQuaternion(orientation).normalize();
      deltaQuat.setFromAxisAngle(forwardAxis, rollDelta);
      orientation.premultiply(deltaQuat);
    }

    camera.quaternion.copy(orientation);
    tempEuler.setFromQuaternion(camera.quaternion, "YXZ");
    flightState.rotation.copy(tempEuler);
    flightState.pitch = tempEuler.x;
    flightState.yaw = tempEuler.y;
    flightState.roll = tempEuler.z;

    // Calculate movement direction based on camera orientation
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    forward.applyQuaternion(camera.quaternion);
    right.applyQuaternion(camera.quaternion);

    if (flightState.keys.w) flightState.speed += speedAccel * deltaSeconds;
    if (flightState.keys.s) flightState.speed -= speedAccel * deltaSeconds;
    flightState.speed = Math.max(minSpeed, Math.min(maxSpeed, flightState.speed));

    const strafeSpeed = flightState.speed * 0.45;
    const targetVelocity = forward.clone().multiplyScalar(flightState.speed);
    if (flightState.keys.a) targetVelocity.add(right.clone().multiplyScalar(-strafeSpeed));
    if (flightState.keys.d) targetVelocity.add(right.clone().multiplyScalar(strafeSpeed));

    // Smooth velocity
    flightState.velocity.lerp(targetVelocity, 0.2);
    flightState.position.add(flightState.velocity.clone().multiplyScalar(delta));
    flightState.position.y = Math.max(flightState.position.y, -0.5);

    // Update camera position
    camera.position.copy(flightState.position);
    flightGround.position.x = flightState.position.x;
    flightGround.position.z = flightState.position.z;

    // Update bullets
    updateBullets(delta);

    radar.update(camera, flightState);

    for (const target of navigatorTargets) {
      const targetPos = target.mesh.position;
      const dx = targetPos.x - flightState.position.x;
      const dz = targetPos.z - flightState.position.z;
      const dist = Math.hypot(dx, dz);
      const beam = farBeams.get(target.mesh);
      if (beam) {
        beam.position.x = targetPos.x;
        beam.position.z = targetPos.z;
        beam.visible = dist >= farBeamDistance;
      }
    }
    if (altitudeTextEl) {
      const altitude = Math.max(0, flightState.position.y + 1.2);
      altitudeTextEl.textContent = altitude.toFixed(1);
    }

    if (targetLabelEl) {
      aimRaycaster.setFromCamera(aimNdc, camera);
      const intersects = aimRaycaster.intersectObjects(
        navigatorTargets.map((t) => t.mesh),
        false
      );
      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const target = navigatorTargets.find((t) => t.mesh === hit);
        if (target?.name) {
          const maxHp = target.sizeBytes
            ? Math.max(10, Math.round(target.sizeBytes / (1024 * 1024)))
            : 10;
          const currentHp = Math.max(0, target.mesh.userData?.currentHp ?? maxHp);
          const sizeLine = target.size ? `<div style="color:#888">${target.size}</div>` : "";
          const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, currentHp / maxHp)) : 0;
          const hpBar = `
            <div style="margin-top:6px;height:6px;background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.4);">
              <div style="height:100%;width:${(hpRatio * 100).toFixed(1)}%;background:#ff3333;"></div>
            </div>
          `;
          targetLabelEl.innerHTML = `<div style="color:#ff6666">${target.name}</div>${sizeLine}${hpBar}`;
          targetLabelEl.style.display = "block";
        } else {
          targetLabelEl.style.display = "none";
        }
      } else {
        targetLabelEl.style.display = "none";
      }
    }

    requestAnimationFrame(updateFlight);
  }

  // Disable OrbitControls and default interactions
  controls.enabled = false;

  // Prevent default drag behavior
  function preventDrag(e: MouseEvent) {
    if (flightState.active) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Add event listeners - use window and capture phase to ensure we get all events
  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("keydown", onKeyDownFlight, true);
  window.addEventListener("keyup", onKeyUpFlight, true);
  renderer.domElement.addEventListener("mousedown", preventDrag, true);
  renderer.domElement.addEventListener("contextmenu", preventDrag, true);

  // Store preventDrag for cleanup
  flightState.preventDrag = preventDrag;

  // Start flight loop
  updateFlight();
}
