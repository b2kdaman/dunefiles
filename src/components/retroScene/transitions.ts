import { exitCurrentObjects } from "../../animations/exit-animation";
import type { ExitAnim, SceneObject } from "../../animations/types";
import type { MutableRef } from "./types";

type ExitTransitionOptions = {
  sceneObjects: SceneObject[];
  exitAnimsRef: MutableRef<ExitAnim[]>;
  delayMs: number;
  exitAnimDurationMs?: number;
  onComplete: () => void;
};

export function runExitTransition({
  sceneObjects,
  exitAnimsRef,
  delayMs,
  exitAnimDurationMs,
  onComplete,
}: ExitTransitionOptions) {
  exitCurrentObjects(sceneObjects, exitAnimsRef.current, exitAnimDurationMs);
  window.setTimeout(onComplete, delayMs);
}
