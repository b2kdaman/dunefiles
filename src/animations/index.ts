// Animation types
export type {
  SceneObject,
  ExitAnim,
  ScaleAnim,
  Particle,
  PixelParticle,
  Bullet,
  FlightState,
} from "./types";

// Easing functions
export {
  easeOutCubic,
  easeInCubic,
  easeInOutCubic,
  easeOutBounce,
  linear,
} from "./easing";

// Particle systems
export {
  spawnClickParticles,
  updateClickParticles,
  createPixelParticleSystem,
} from "./particles";

// Scale animations
export { startScaleAnim, updateScaleAnimations } from "./scale-animation";

// Sound effects
export {
  initSoundSystem,
  ensureAudio,
  playPickup,
  playDrop,
  playNavigateIn,
  playNavigateBack,
  playSpawn,
  playLand,
  playShoot,
  getSynths,
} from "./sound-effects";

// Exit animations
export { exitCurrentObjects, updateExitAnimations } from "./exit-animation";

// Camera animations
export {
  focusCameraOnTarget,
  orbitCamera,
  transitionToCockpit,
  resetCameraToDefault,
} from "./camera-animation";

// Flight mode
export { enterFlightMode, isFlightModeActive, subscribeFlightMode } from "./flight-mode";

// Mecha animation
export { loadMechaAnimation } from "./mecha-animation";
