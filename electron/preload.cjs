// Exposes a tiny, safe bridge to Dementa OS (see src/os/desktopBridge.ts).
// Websites shown in the browser app never get this script.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dementa", {
  isDesktop: true,
  onNavigationBlocked(callback) {
    const listener = (_event, webContentsId, host) => callback(webContentsId, host);
    ipcRenderer.on("dementa:navigation-blocked", listener);
    return () => ipcRenderer.removeListener("dementa:navigation-blocked", listener);
  },
});
