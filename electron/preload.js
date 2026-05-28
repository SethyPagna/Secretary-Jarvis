const { contextBridge, ipcRenderer } = require('electron')

const validWindowActions = new Set(['minimize', 'maximize', 'toggle-maximize', 'close'])

contextBridge.exposeInMainWorld('jarvisDesktop', {
  getBackendStatus: () => ipcRenderer.invoke('jarvis:backend-status'),
  windowControl: (action) => {
    if (!validWindowActions.has(action)) {
      return Promise.resolve({
        ok: false,
        error: `Unsupported window action: ${action}`
      })
    }

    return ipcRenderer.invoke('jarvis:window-control', action)
  }
})
