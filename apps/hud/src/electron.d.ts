type JarvisTrayActionType =
  | "open-hud"
  | "open-dashboard"
  | "mute-mic"
  | "pause-agents"
  | "emergency-stop"
  | "stop-services"
  | "restart-services"
  | "live-test";

interface JarvisTrayAction {
  type: JarvisTrayActionType;
  label: string;
  state: "wake" | "planning" | "approval" | "error";
  message: string;
}

interface Window {
  jarvisDesktop?: {
    onTrayAction(callback: (action: JarvisTrayAction) => void): () => void;
    runTrayCommand(type: JarvisTrayActionType): Promise<void>;
    showApp(): Promise<void>;
    hideApp(): Promise<void>;
    focusExisting(): Promise<void>;
    quitApp(): Promise<void>;
  };
}
