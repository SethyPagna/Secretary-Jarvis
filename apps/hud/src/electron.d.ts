type JarvisTrayActionType = "open-hud" | "open-dashboard" | "mute-mic" | "pause-agents" | "emergency-stop";

interface JarvisTrayAction {
  type: JarvisTrayActionType;
  label: string;
  state: "wake" | "approval" | "error";
  message: string;
}

interface Window {
  jarvisDesktop?: {
    onTrayAction(callback: (action: JarvisTrayAction) => void): () => void;
    runTrayCommand(type: JarvisTrayActionType): Promise<void>;
  };
}
