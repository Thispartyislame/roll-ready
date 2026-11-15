const { contextBridge, ipcRenderer } = require('electron');

// The player window has no access to the database or the GM's data API. It can only read the
// sanitized public tracker state, toggle full screen, and switch its own theme.
contextBridge.exposeInMainWorld('table', {
  get: () => ipcRenderer.invoke('player:get'),
  onState: (cb) => ipcRenderer.on('player:state', (_e, state) => cb(state)),
  toggleFullscreen: () => ipcRenderer.invoke('player:fullscreen'),
  setTheme: (theme) => ipcRenderer.invoke('player:theme', theme),
  // A picture or clip the GM is showing the table, and telling the GM when a clip has finished.
  onMedia: (cb) => ipcRenderer.on('player:media', (_e, media) => cb(media)),
  mediaEnded: (token) => ipcRenderer.send('player:mediaEnded', token),
});
