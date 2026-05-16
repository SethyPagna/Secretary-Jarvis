import { contextBridge, ipcRenderer } from "electron";

type TrayActionType =
  | "open-hud"
  | "open-dashboard"
  | "mute-mic"
  | "pause-agents"
  | "emergency-stop"
  | "stop-services"
  | "restart-services"
  | "live-test";

interface TrayAction {
  type: TrayActionType;
  label: string;
  state: "wake" | "planning" | "approval" | "error";
  message: string;
}

contextBridge.exposeInMainWorld("jarvisDesktop", {
  onTrayAction(callback: (action: TrayAction) => void) {
    const listener = (_event: Electron.IpcRendererEvent, action: TrayAction) => callback(action);
    ipcRenderer.on("jarvis:tray-action", listener);
    return () => ipcRenderer.removeListener("jarvis:tray-action", listener);
  },
  runTrayCommand(type: TrayActionType) {
    return ipcRenderer.invoke("jarvis:tray-command", type);
  }
});
