import { create } from "zustand";

// File entry from Rust backend
export type FileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
};

// History entry includes path, entries, and camera/scene state
export type HistoryEntry = {
  path: string;
  entries: FileEntry[];
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
  objectStates?: Array<{
    id: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  }>;
};

type SceneState = {
  // Current path being displayed
  currentPath: string;
  currentEntries: FileEntry[];

  // History stack for back navigation
  history: HistoryEntry[];
  canGoBack: boolean;

  // Actions
  navigateTo: (path: string, entries: FileEntry[], state?: {
    cameraPosition?: { x: number; y: number; z: number };
    cameraTarget?: { x: number; y: number; z: number };
    objectStates?: Array<{
      id: string;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number; w: number };
    }>;
  }) => void;
  goBack: () => HistoryEntry | null;
  clearHistory: () => void;
};

export const useSceneStore = create<SceneState>((set, get) => ({
  currentPath: "",
  currentEntries: [],
  history: [],
  canGoBack: false,

  navigateTo: (path, entries, state) => {
    const { currentPath, currentEntries } = get();

    // Only push to history if we have a current path (not initial load)
    const newHistory = currentPath
      ? [...get().history, {
          path: currentPath,
          entries: currentEntries,
          cameraPosition: state?.cameraPosition,
          cameraTarget: state?.cameraTarget,
          objectStates: state?.objectStates,
        }]
      : get().history;

    set({
      currentPath: path,
      currentEntries: entries,
      history: newHistory,
      canGoBack: newHistory.length > 0,
    });
  },

  goBack: () => {
    const { history } = get();
    if (history.length === 0) return null;

    const previous = history[history.length - 1];
    set({
      currentPath: previous.path,
      currentEntries: previous.entries,
      history: history.slice(0, -1),
      canGoBack: history.length > 1,
    });
    return previous;
  },

  clearHistory: () => {
    set({ currentPath: "", currentEntries: [], history: [], canGoBack: false });
  },
}));
