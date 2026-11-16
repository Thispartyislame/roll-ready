const { app, BrowserWindow, ipcMain, shell, Menu, screen, nativeTheme, dialog, protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./src/db');
const { writeZip, openZip } = require('./src/zip');

let store;
let win;            // the GM window
let player = null;  // the player-facing window (optional, local only)
let board = null;   // the soundboard pop-out (optional): a remote control for the GM window
let boardState = { buttons: [], playing: [], theme: 'dark' };
let mediaDir;       // soundboard files and attached pictures, copied in
let recDir;         // session recordings
let dbFile;
let publicState = { round: 1, combatants: [], theme: 'auto' };   // last sanitized tracker state from the GM window

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

// ---------------------------------------------------------------- soundboard media
// Sounds, pictures and clips are copied into a folder beside the database and served to the windows
// through the rrmedia: scheme, so the pages never get general file access.
protocol.registerSchemesAsPrivileged([{ scheme: 'rrmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');   // a board button may be pressed in another window

const AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'];
const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'];
const VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
const kindOf = (file) => { const ext = path.extname(file).slice(1).toLowerCase(); return AUDIO.includes(ext) ? 'audio' : IMAGE.includes(ext) ? 'image' : VIDEO.includes(ext) ? 'video' : null; };

async function mediaPick(want) {
  const filters = want === 'audio' ? [{ name: 'Sounds', extensions: AUDIO }] : want === 'image' ? [{ name: 'Pictures', extensions: IMAGE }] : [{ name: 'Pictures and video', extensions: [...IMAGE, ...VIDEO] }];
  const r = await dialog.showOpenDialog(win, { title: want === 'audio' ? 'Choose a sound' : want === 'image' ? 'Choose a picture' : 'Choose a picture or video', properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0]; const kind = kindOf(src);
  if (!kind || (want === 'audio') !== (kind === 'audio') || (want === 'image' && kind !== 'image')) throw new Error(want === 'audio' ? 'That isn\'t a sound file this app can play.' : want === 'image' ? 'That isn\'t a picture this app can show.' : 'That isn\'t a picture or video this app can show.');
  fs.mkdirSync(mediaDir, { recursive: true });
  const safe = path.basename(src).replace(/[^\w.\- ]+/g, '_').slice(-80);
  const file = `${Date.now().toString(36)}-${safe}`;
  await fs.promises.copyFile(src, path.join(mediaDir, file));
  return { file, kind, name: path.basename(src) };
}
// Remove copied files that no button uses any more (replaced or deleted since the last launch).
function mediaSweep() {
  if (!fs.existsSync(mediaDir)) return;
  const used = store.mediaInUse();
  for (const f of fs.readdirSync(mediaDir)) if (!used.has(f)) fs.rmSync(path.join(mediaDir, f), { force: true });
}

// ---------------------------------------------------------------- session recordings
// The GM window records the microphone and sends the audio here in chunks every few seconds, so a
// crash loses at most the last chunk and a long session never sits in memory.
const rec = { fd: null, file: null };
const recName = (f) => path.basename(String(f));         // never trust a path from the page
function recStart(sessionId, label) {
  recStop();
  fs.mkdirSync(recDir, { recursive: true });
  const t = new Date(); const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} ${p2(t.getHours())}.${p2(t.getMinutes())}`;
  const safe = String(label || 'Session').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'Session';
  rec.file = `s${Number(sessionId) || 0}-${stamp} ${safe}.webm`;
  rec.fd = fs.openSync(path.join(recDir, rec.file), 'w');
  return rec.file;
}
function recAppend(bytes) { if (rec.fd == null) return false; fs.writeSync(rec.fd, Buffer.from(bytes)); return true; }
function recStop() { if (rec.fd == null) return null; fs.closeSync(rec.fd); const f = rec.file; rec.fd = null; rec.file = null; return f; }
function recList() {
  if (!fs.existsSync(recDir)) return [];
  return fs.readdirSync(recDir).filter((f) => /^s\d+-.*\.webm$/.test(f)).sort().map((f) => {
    const st = fs.statSync(path.join(recDir, f));
    return { file: f, sessionId: Number(f.match(/^s(\d+)-/)[1]), bytes: st.size, at: st.mtimeMs, live: f === rec.file };
  });
}

// ---------------------------------------------------------------- backup and restore
// A backup is one .zip holding a consistent copy of the database plus the media and recordings folders.
const filesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()) : []);
function writeBackup(dest) {
  const snap = dbFile + '.backup-tmp';
  store.snapshot(snap);
  try {
    return writeZip(dest, [
      { name: 'roll-ready.sqlite', file: snap, compress: true },
      ...filesIn(mediaDir).map((f) => ({ name: 'media/' + f, file: path.join(mediaDir, f) })),
      ...filesIn(recDir).filter((f) => f !== rec.file).map((f) => ({ name: 'recordings/' + f, file: path.join(recDir, f) })),
    ]);
  } finally { fs.rmSync(snap, { force: true }); }
}
async function backupSave() {
  const t = new Date();
  const name = `Roll Ready backup ${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}.zip`;
  const r = await dialog.showSaveDialog(win, { title: 'Save a backup', defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'Roll Ready backup', extensions: ['zip'] }] });
  if (r.canceled || !r.filePath) return null;
  const out = writeBackup(r.filePath);
  store.kvSet('lastBackup', { at: t.toISOString(), file: r.filePath });
  return { ...out, file: r.filePath };
}
async function backupRestore() {
  const r = await dialog.showOpenDialog(win, { title: 'Restore from a backup', properties: ['openFile'], filters: [{ name: 'Roll Ready backup', extensions: ['zip'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const zip = openZip(r.filePaths[0]);
  try {
    if (!zip.names.includes('roll-ready.sqlite')) throw new Error('That file isn\'t a Roll Ready backup.');
    const ok = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Restore', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Restore from a backup',
      message: 'Replace everything in Roll Ready with this backup?', detail: 'All campaigns, soundboard files and recordings will be replaced by the ones in the backup. A safety copy of what you have now is saved first.' });
    if (ok.response !== 0) return null;
    recStop();
    // Safety copy of the current data, in case the restore was a mistake.
    const safetyDir = path.join(path.dirname(dbFile), 'roll-ready-backups'); fs.mkdirSync(safetyDir, { recursive: true });
    const safety = path.join(safetyDir, `before-restore-${Date.now().toString(36)}.zip`);
    writeBackup(safety);
    // Unpack beside the data first, so a damaged backup is caught before anything is replaced.
    const stage = dbFile + '.restore-tmp'; fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(path.join(stage, 'media'), { recursive: true }); fs.mkdirSync(path.join(stage, 'recordings'), { recursive: true });
    for (const n of zip.names) {
      const m = n.match(/^(media|recordings)\/([^/\\]+)$/);
      if (n === 'roll-ready.sqlite') zip.extract(n, path.join(stage, 'db.sqlite'));
      else if (m && m[2] !== '.' && m[2] !== '..') zip.extract(n, path.join(stage, m[1], m[2]));
    }
    if (player) player.close(); if (board) board.close();
    store.close();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
    fs.renameSync(path.join(stage, 'db.sqlite'), dbFile);
    for (const [from, to] of [['media', mediaDir], ['recordings', recDir]]) { fs.rmSync(to, { recursive: true, force: true }); fs.renameSync(path.join(stage, from), to); }
    fs.rmSync(stage, { recursive: true, force: true });
    store = new Store(dbFile);
    store.seed(path.join(__dirname, 'data', 'srd.json'));
    setTimeout(() => win && win.webContents.reload(), 50);     // the page loads everything fresh from the restored file
    return { safety };
  } finally { zip.close(); }
}

// ---------------------------------------------------------------- soundboard pop-out
// A small always-on-top window of buttons. It holds no data and plays nothing itself: it shows the
// button list the GM window sends and tells the GM window which button was pressed.
function boardOpen() {
  if (board) { board.show(); board.focus(); return true; }
  const saved = store.kvGet('boardWindow');
  const home = saved && screen.getAllDisplays().find((d) => overlaps(saved, d));
  const p = screen.getPrimaryDisplay().workArea;
  const bounds = home ? saved : { width: 380, height: 440, x: p.x + p.width - 420, y: p.y + 80 };
  board = new BrowserWindow({
    ...bounds, minWidth: 200, minHeight: 140, title: 'Roll Ready — Soundboard', autoHideMenuBar: true, alwaysOnTop: true, fullscreenable: false,
    backgroundColor: boardState.theme === 'light' ? '#f6f2e8' : '#15171c',
    webPreferences: { preload: path.join(__dirname, 'preload-board.js'), contextIsolation: true, nodeIntegration: false },
  });
  board.removeMenu();
  board.loadFile(path.join(__dirname, 'renderer', 'board.html'));
  board.on('close', () => store.kvSet('boardWindow', board.getBounds()));
  board.on('closed', () => { board = null; tellGm(); });
  tellGm();
  return true;
}

// ---------------------------------------------------------------- GM window
function createWindow() {
  const bounds = store.kvGet('windowBounds') || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...bounds, minWidth: 1000, minHeight: 640, backgroundColor: nativeTheme.shouldUseDarkColors ? '#15171c' : '#f6f2e8', title: 'Roll Ready', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // F12 opens the developer tools, for diagnosing problems.
  win.webContents.on('before-input-event', (_e, input) => { if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools(); });
  win.on('close', () => { if (!win.isMaximized() && !win.isFullScreen()) store.kvSet('windowBounds', win.getBounds()); });
  win.on('closed', () => { win = null; if (player) player.close(); if (board) board.close(); });
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

function tellGm() { if (win) win.webContents.send('player:status', { open: !!player, theme: publicState.theme, board: !!board }); }

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
    backgroundColor: (publicState.theme === 'auto' ? !nativeTheme.shouldUseDarkColors : publicState.theme === 'light') ? '#f6f2e8' : '#15171c',
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
  // 'auto' follows the system setting; the player window resolves it.
  publicState = { ...publicState, theme: ['light', 'dark'].includes(theme) ? theme : 'auto' };
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
  publicState.theme = store.kvGet('playerTheme') || 'auto';
  dbFile = file;
  mediaDir = path.join(path.dirname(file), 'roll-ready-media');
  recDir = path.join(path.dirname(file), 'roll-ready-recordings');
  mediaSweep();
  protocol.handle('rrmedia', (req) => {
    const p = path.join(mediaDir, path.basename(decodeURIComponent(new URL(req.url).pathname)));   // basename: no way out of the folder
    if (!fs.existsSync(p)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(p).toString(), { headers: req.headers });
  });

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
    playerStatus: () => ({ open: !!player, theme: publicState.theme, board: !!board }),
    // A picture or clip the GM chose to show the table (or null to take it down). Like the tracker
    // state, the player window only ever receives what the GM window sends here.
    playerMedia: (media) => { if (player) player.webContents.send('player:media', media); return !!player; },
    // soundboard
    mediaPick: (want) => mediaPick(want),
    // session recordings
    recStart: (sessionId, label) => recStart(sessionId, label),
    recAppend: (bytes) => recAppend(bytes),
    recStop: () => recStop(),
    recList: () => recList(),
    recShow: (f) => { shell.showItemInFolder(path.join(recDir, recName(f))); return true; },
    recDelete: (f) => { if (recName(f) !== rec.file) fs.rmSync(path.join(recDir, recName(f)), { force: true }); return true; },
    // backup and restore
    backupSave: () => backupSave(),
    backupRestore: () => backupRestore(),
    boardOpen: () => boardOpen(),
    boardClose: () => { if (board) board.close(); return true; },
    boardPush: (state) => { boardState = state; if (board) board.webContents.send('board:state', boardState); return true; },
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
  ipcMain.on('player:mediaEnded', (e, token) => { if (player && e.sender === player.webContents && win) win.webContents.send('board:event', { type: 'ended', token }); });
  // The soundboard window's whole vocabulary: read the button list, press a button, stop everything, ask to edit.
  ipcMain.handle('board:get', () => boardState);
  ipcMain.on('board:cmd', (e, cmd) => {
    if (!board || e.sender !== board.webContents || !win) return;
    if (cmd && cmd.type === 'edit') { win.show(); win.focus(); }
    if (cmd && ['fire', 'stop', 'edit'].includes(cmd.type)) win.webContents.send('board:event', { type: cmd.type, id: Number(cmd.id) || null });
  });

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => recStop());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
