const { contextBridge, ipcRenderer } = require('electron');

// The GM window gets two capabilities: calling named data-layer methods in the main process,
// and hearing whether the player window is open.
contextBridge.exposeInMainWorld('dm', {
  call: (method, ...args) => ipcRenderer.invoke('api', method, args),
  onPlayerStatus: (cb) => ipcRenderer.on('player:status', (_e, status) => cb(status)),
});
