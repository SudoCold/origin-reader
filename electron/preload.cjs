const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  openDocument: () => ipcRenderer.invoke('document:open'),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
});
