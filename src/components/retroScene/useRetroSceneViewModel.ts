import { useCallback, useMemo } from "react";
import type { MutableRefObject } from "react";
import type { SceneRuntime } from "./types";

type Breadcrumb = {
  name: string;
  path: string;
};

type UseRetroSceneViewModelOptions = {
  canGoBack: boolean;
  currentPath: string;
  runtimeRef: MutableRefObject<SceneRuntime | null>;
};

type RetroSceneViewModel = {
  breadcrumbs: Breadcrumb[];
  handleBack: () => void;
  navigateToComputer: () => Promise<void>;
  loadDirectory: (path: string) => void;
  loadMecha: () => void;
};

const ROOT_BREADCRUMB: Breadcrumb = { name: "Computer", path: "" };

export function useRetroSceneViewModel({
  canGoBack,
  currentPath,
  runtimeRef,
}: UseRetroSceneViewModelOptions): RetroSceneViewModel {
  const breadcrumbs = useMemo(() => {
    const result: Breadcrumb[] = [ROOT_BREADCRUMB];
    if (!currentPath) return result;

    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    let accumulated = "";
    for (const part of parts) {
      accumulated += (accumulated ? "/" : "") + part;
      result.push({ name: part, path: accumulated });
    }
    return result;
  }, [currentPath]);

  const handleBack = useCallback(() => {
    if (runtimeRef.current && canGoBack) {
      runtimeRef.current.navigateBack();
    }
  }, [canGoBack, runtimeRef]);

  const navigateToComputer = useCallback(async () => {
    if (runtimeRef.current) {
      await runtimeRef.current.returnToComputer();
    }
  }, [runtimeRef]);

  const loadDirectory = useCallback((path: string) => {
    void runtimeRef.current?.loadDirectory(path);
  }, [runtimeRef]);

  const loadMecha = useCallback(() => {
    runtimeRef.current?.loadMecha();
  }, [runtimeRef]);

  return {
    breadcrumbs,
    handleBack,
    navigateToComputer,
    loadDirectory,
    loadMecha,
  };
}
