import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";

export type HudState =
  | "idle"
  | "wake"
  | "listening"
  | "recognizing"
  | "thinking"
  | "planning"
  | "executing"
  | "speaking"
  | "approval"
  | "error";

export interface HudSnapshot {
  state: HudState;
  caption: string;
  detailOpen: boolean;
}

type HudAction =
  | { type: "set-state"; state: HudState; caption?: string }
  | { type: "toggle-details" }
  | { type: "reset" };

const initialSnapshot: HudSnapshot = {
  state: "idle",
  caption: "",
  detailOpen: false
};

const stateCaptions: Record<HudState, string> = {
  idle: "",
  wake: "Jarvis awake.",
  listening: "Say a command...",
  recognizing: "Recognizing you...",
  thinking: "Thinking...",
  planning: "Planning...",
  executing: "Executing...",
  speaking: "Speaking...",
  approval: "Approval required.",
  error: "Recovery needed."
};

function hudReducer(snapshot: HudSnapshot, action: HudAction): HudSnapshot {
  if (action.type === "reset") {
    return initialSnapshot;
  }
  if (action.type === "toggle-details") {
    return { ...snapshot, detailOpen: !snapshot.detailOpen };
  }
  return {
    state: action.state,
    caption: action.caption ?? stateCaptions[action.state],
    detailOpen: snapshot.detailOpen
  };
}

interface HudContextValue extends HudSnapshot {
  setHudState: (state: HudState, caption?: string) => void;
  toggleDetails: () => void;
  resetHud: () => void;
}

const HudContext = createContext<HudContextValue | undefined>(undefined);

export function HudStateProvider({ children }: { children: ReactNode }) {
  const [snapshot, dispatch] = useReducer(hudReducer, initialSnapshot);
  const value = useMemo<HudContextValue>(
    () => ({
      ...snapshot,
      setHudState: (state, caption) => dispatch({ type: "set-state", state, caption }),
      toggleDetails: () => dispatch({ type: "toggle-details" }),
      resetHud: () => dispatch({ type: "reset" })
    }),
    [snapshot]
  );

  return <HudContext.Provider value={value}>{children}</HudContext.Provider>;
}

export function useHudState() {
  const context = useContext(HudContext);
  if (!context) {
    throw new Error("useHudState must be used inside HudStateProvider");
  }
  return context;
}
