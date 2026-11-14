const { app, BrowserWindow, ipcMain, shell, Menu, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./src/db');

let store;
let win;            // the GM window
let player = null;  // the player-facing window (optional, local only)
let publicState = { round: 1, combatants: [], theme: 'dark' };   // last sanitized tracker state from the GM window

// ---------------------------------------------------------------- data file
// Phase 1 shipped as "DM Helper"; carry that data over on first launch under the new name.
function dataFile() {
  if (process.env.ROLLREADY_DB || process.env.DMHELPER_DB) return process.env.ROLLREADY_DB || process.env.DMHELPER_DB;
  const file = path.join(app.getPath('userData'), 'roll-ready.sqlite');
  const old = path.join(app.getPath('appData'), 'DM Helper', 'dm-helper.sqlite');
  if (!fs.existsSync(file) && fs.existsSync(old)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(old + ext)) fs.copyFileSync(old + ext, file + ext);
  }
  return file;
}

// ---------------------------------------------------------------- GM window
function createWindow() {
  const bounds = store.kvGet('windowBounds') || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...bounds, minWidth: 1000, minHeight: 640, backgroundColor: '#15171c', title: 'Roll Ready', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // F12 opens the developer tools, for diagnosing problems.
  win.webContents.on('before-input-event', (_e, input) => { if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools(); });
  win.on('close', () => { if (!win.isMaximized() && !win.isFullScreen()) store.kvSet('windowBounds', win.getBounds()); });
  win.on('closed', () => { win = null; if (player) player.close(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// ---------------------------------------------------------------- player window
const listDisplays = () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, n) => ({ id: d.id, label: `Display ${n + 1}${d.id === primary ? ' (primary)' : ''} — ${d.size.width} × ${d.size.height}` }));
};
const centeredOn = (d) => {
  const w = Math.round(d.workArea.width * 0.8), h = Math.round(d.workArea.height * 0.8);
  return { x: d.workArea.x + Math.round((d.workArea.width - w) / 2), y: d.workArea.y + Math.round((d.workArea.height - h) / 2), width: w, height: h };
};
const overlaps = (b, d) => b.x < d.bounds.x + d.bounds.width - 80 && b.x + b.width > d.bounds.x + 80 && b.y < d.bounds.y + d.bounds.height - 80 && b.y + b.height > d.bounds.y;

function tellGm() { if (win) win.webContents.send('player:status', { open: !!player, theme: publicState.theme }); }

function playerOpen(displayId) {
  const all = screen.getAllDisplays();
  const saved = store.kvGet('playerWindow');
  const chosen = displayId != null ? all.find((d) => d.id === displayId) : null;
  let bounds; let full = false;
  if (chosen) bounds = centeredOn(chosen);
  else {
    // Reopen where it was — unless that monitor is gone, then fall back to the primary display.
    const home = saved && all.find((d) => d.id === saved.displayId);
    if (home && overlaps(saved.bounds, home)) { bounds = saved.bounds; full = !!saved.fullscreen; }
    else bounds = centeredOn(home || screen.getPrimaryDisplay());
  }
  if (player) {
    if (player.isFullScreen()) player.setFullScreen(false);
    player.setBounds(bounds); player.show(); player.focus();
    return true;
  }
  player = new BrowserWindow({
    ...bounds, minWidth: 480, minHeight: 320, title: 'Roll Ready — Player View', autoHideMenuBar: true,
    backgroundColor: publicState.theme === 'light' ? '#f4f1ea' : '#0e0f13',
    webPreferences: { preload: path.join(__dirname, 'preload-player.js'), contextIsolation: true, nodeIntegration: false },
  });
  player.removeMenu();
  player.loadFile(path.join(__dirname, 'renderer', 'player.html'));
  if (full) player.once('ready-to-show', () => player && player.setFullScreen(true));
  player.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape' && player.isFullScreen()) { player.setFullScreen(false); e.preventDefault(); }
    else if (input.key === 'F11') { player.setFullScreen(!player.isFullScreen()); e.preventDefault(); }
  });
  player.on('close', () => {
    const b = player.isFullScreen() || player.isMaximized() ? player.getNormalBounds() : player.getBounds();
    store.kvSet('playerWindow', { bounds: b, displayId: screen.getDisplayMatching(player.getBounds()).id, fullscreen: player.isFullScreen() });
  });
  player.on('closed', () => { player = null; tellGm(); });   // the GM window and tracker state are untouched
  tellGm();
  return true;
}

function setTheme(theme) {
  publicState = { ...publicState, theme: theme === 'light' ? 'light' : 'dark' };
  store.kvSet('playerTheme', publicState.theme);
  if (player) player.webContents.send('player:state', publicState);
  tellGm();
  return publicState.theme;
}

// ---------------------------------------------------------------- startup
app.whenReady().then(() => {
  const file = dataFile();
  store = new Store(file);
  store.seed(path.join(__dirname, 'data', 'srd.json'));
  publicState.theme = store.kvGet('playerTheme') || 'dark';

  const api = {
    bootstrap: () => store.bootstrap(),
    loadCampaign: (id) => store.loadCampaign(id),
    save: (type, obj) => store.save(type, obj),
    remove: (type, id) => store.remove(type, id),
    kvSet: (key, value) => store.kvSet(key, value),
    diceAdd: (entry) => store.diceAdd(entry),
    diceClear: () => store.diceClear(),
    setThreshold: (level, tier, xp) => store.setThreshold(level, tier, xp),
    showDataFile: () => { shell.showItemInFolder(file); return true; },
    // player view
    displays: () => listDisplays(),
    playerOpen: (displayId) => playerOpen(displayId),
    playerClose: () => { if (player) player.close(); return true; },
    playerStatus: () => ({ open: !!player, theme: publicState.theme }),
    playerTheme: (theme) => setTheme(theme),
    // The GM window sends an already-sanitized snapshot; it is the only thing the player window ever receives.
    playerPush: (state) => { publicState = { ...state, theme: publicState.theme }; if (player) player.webContents.send('player:state', publicState); return true; },
  };
  ipcMain.handle('api', (e, method, args) => {
    if (!win || e.sender !== win.webContents) throw new Error('Not allowed from this window.');
    if (!Object.hasOwn(api, method)) throw new Error('Unknown API method: ' + method);
    return api[method](...args);
  });
  // The player window's whole vocabulary: read the public state, toggle full screen, switch theme.
  ipcMain.handle('player:get', () => publicState);
  ipcMain.handle('player:fullscreen', () => { if (player) player.setFullScreen(!player.isFullScreen()); return !!player && player.isFullScreen(); });
  ipcMain.handle('player:theme', (_e, theme) => setTheme(theme));

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
