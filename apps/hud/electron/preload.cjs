const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jarvisDesktop", {
  onTrayAction(callback) {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("jarvis:tray-action", listener);
    return () => ipcRenderer.removeListener("jarvis:tray-action", listener);
  },
  runTrayCommand(type) {
    return ipcRenderer.invoke("jarvis:tray-command", type);
  },
  showApp() {
    return ipcRenderer.invoke("app:show");
  },
  hideApp() {
    return ipcRenderer.invoke("app:hide");
  },
  focusExisting() {
    return ipcRenderer.invoke("app:focus-existing");
  },
  quitApp() {
    return ipcRenderer.invoke("app:quit");
  },
  showOrb() {
    return ipcRenderer.invoke("orb:show");
  },
  hideOrb() {
    return ipcRenderer.invoke("orb:hide");
  },
});
