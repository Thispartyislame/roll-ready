const { contextBridge, ipcRenderer } = require('electron');

// The soundboard pop-out is a remote control. It can read the button list, press a button, stop
// everything, and ask the GM window to open the editor. It has no access to the data API or to files.
contextBridge.exposeInMainWorld('deck', {
  get: () => ipcRenderer.invoke('board:get'),
  onState: (cb) => ipcRenderer.on('board:state', (_e, state) => cb(state)),
  fire: (id) => ipcRenderer.send('board:cmd', { type: 'fire', id }),
  stopAll: () => ipcRenderer.send('board:cmd', { type: 'stop' }),
  edit: () => ipcRenderer.send('board:cmd', { type: 'edit' }),
});
