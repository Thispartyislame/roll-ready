const { contextBridge, ipcRenderer } = require('electron');

// The player window has no access to the database or the GM's data API. It can only read the
// sanitized public tracker state, toggle full screen, and switch its own theme.
contextBridge.exposeInMainWorld('table', {
  get: () => ipcRenderer.invoke('player:get'),
  onState: (cb) => ipcRenderer.on('player:state', (_e, state) => cb(state)),
  toggleFullscreen: () => ipcRenderer.invoke('player:fullscreen'),
  setTheme: (theme) => ipcRenderer.invoke('player:theme', theme),
});
