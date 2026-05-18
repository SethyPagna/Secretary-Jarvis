type JarvisTrayActionType =
  | "open-hud"
  | "open-dashboard"
  | "open-voice"
  | "open-text"
  | "open-workflows"
  | "open-devices"
  | "open-settings"
  | "mute-mic"
  | "pause-agents"
  | "emergency-stop"
  | "stop-services"
  | "restart-services"
  | "live-test";

interface JarvisTrayAction {
  type: JarvisTrayActionType;
  label: string;
  state: "wake" | "listening" | "planning" | "approval" | "error";
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
    showOrb(): Promise<void>;
    hideOrb(): Promise<void>;
  };
}
