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
});
