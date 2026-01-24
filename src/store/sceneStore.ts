import { create } from "zustand";

// Serializable object data for history
export type ObjectData = {
  id: string;
  type: "sphere" | "diamond";
  scale: number;
  position: [number, number, number];
  velocity: [number, number, number];
  hasLabel: boolean;
  labelName: string;
  labelSize: string;
};

type SceneState = {
  // History stack of object configurations
  history: ObjectData[][];
  currentObjects: ObjectData[];
  canGoBack: boolean;

  // Actions
  pushState: (objects: ObjectData[]) => void;
  goBack: () => ObjectData[] | null;
  clearHistory: () => void;
};

export const useSceneStore = create<SceneState>((set, get) => ({
  history: [],
  currentObjects: [],
  canGoBack: false,

  pushState: (objects) => {
    const { currentObjects } = get();
    set({
      history: currentObjects.length > 0 ? [...get().history, currentObjects] : get().history,
      currentObjects: objects,
      canGoBack: currentObjects.length > 0 || get().history.length > 0,
    });
  },

  goBack: () => {
    const { history } = get();
    if (history.length === 0) return null;

    const previousObjects = history[history.length - 1];
    set({
      history: history.slice(0, -1),
      currentObjects: previousObjects,
      canGoBack: history.length > 1,
    });
    return previousObjects;
  },

  clearHistory: () => {
    set({ history: [], currentObjects: [], canGoBack: false });
  },
}));
