// Soundboard: a grid of buttons, each holding a sound, a picture or video for the player view, or both.
// Sound plays here in the GM window; pictures and video go to the player view. A button can have a time
// limit after which it stops and its picture disappears. The pop-out board (board.html) is only a remote:
// it shows these buttons and reports which one was pressed.
import { html, useState, useEffect, S, notify, call, create, edit, del, go, toast, byId } from './lib.js';
import { Field, Empty, useHotkey } from './components.js';

const KEYS = '1234567890';
const COLORS = [['', 'Plain'], ['blue', 'Blue'], ['violet', 'Violet'], ['good', 'Green'], ['orange', 'Orange'], ['bad', 'Red']];
export const mediaUrl = (file) => 'rrmedia://media/' + encodeURIComponent(file);
const nameOf = (file) => file.replace(/^[a-z0-9]+-/, '');
export const buttons = () => [...S.c.sound_button].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

// ---------------------------------------------------------------- playing
const playing = new Map();      // button id -> { audio, timer, token }
let onScreen = null;            // { id, token } of the picture or clip currently on the player view
export const isPlaying = (id) => playing.has(id);

export function stop(id) {
  const p = playing.get(id); if (!p) return;
  playing.delete(id);
  clearTimeout(p.timer);
  if (p.audio) { p.audio.pause(); p.audio.src = ''; }
  if (onScreen?.id === id) { onScreen = null; call('playerMedia', null); }
  notify();
}
export function stopAll() { for (const id of [...playing.keys()]) stop(id); }

// Press a button: start it, or stop it if it is already going.
export function fire(b) {
  if (!b) return;
  if (playing.has(b.id)) return stop(b.id);
  if (!b.audio && !b.visual) return toast(`“${b.label || 'This button'}” has nothing loaded yet — add a sound, picture or video.`);
  const p = { token: Date.now() + ':' + b.id };
  const volume = Math.max(0, Math.min(1, (b.volume ?? 100) / 100));
  if (b.visual) {
    if (S.player?.open) {
      if (onScreen) stop(onScreen.id);           // one picture or clip on the table at a time
      onScreen = { id: b.id, token: p.token };
      call('playerMedia', { token: p.token, kind: b.visual_kind, url: mediaUrl(b.visual), volume, loop: !!b.loop });
    } else if (!b.audio) return toast('Pop out the player view to show pictures and video (Ctrl+Shift+P).');
    else toast('Playing the sound. Pop out the player view to show the picture too (Ctrl+Shift+P).');
  }
  if (b.audio) {
    p.audio = new Audio(mediaUrl(b.audio));
    p.audio.volume = volume; p.audio.loop = !!b.loop;
    // A sound on its own ends the button when it finishes. With a picture, the picture stays until its
    // time limit or until the button is pressed again.
    p.audio.addEventListener('ended', () => { if (playing.get(b.id) === p && onScreen?.id !== b.id) stop(b.id); });
    p.audio.addEventListener('error', () => { if (playing.get(b.id) === p) { stop(b.id); toast(`Couldn't play the sound on “${b.label}”.`); } });
    p.audio.play().catch(() => {});
  }
  if (b.duration > 0) p.timer = setTimeout(() => stop(b.id), b.duration * 1000);
  playing.set(b.id, p);
  notify();
}

// From the pop-out board and the player view.
export function onBoardEvent(ev) {
  if (ev.type === 'fire') fire(byId('sound_button', ev.id));
  else if (ev.type === 'stop') stopAll();
  else if (ev.type === 'edit') go('soundboard', null, { editing: true });
  else if (ev.type === 'ended' && onScreen?.token === ev.token) stop(onScreen.id);      // a clip finished on the player view
}

export const toggleBoard = () => call(S.player?.board ? 'boardClose' : 'boardOpen');

// Keeps the pop-out board showing the current buttons, and takes pictures down if the player view closes.
let lastPush = '';
export function BoardSync() {
  useEffect(() => {
    if (!S.cid) return;
    if (onScreen && !S.player?.open) { const id = onScreen.id; onScreen = null; if (!playing.get(id)?.audio) stop(id); }
    const state = { theme: window.rrTheme.resolved(), playing: [...playing.keys()],
      buttons: buttons().map((b) => ({ id: b.id, label: b.label, color: b.color, audio: !!b.audio, visual: b.visual ? b.visual_kind : '', duration: b.duration })) };
    const json = JSON.stringify(state);
    if (json !== lastPush) { lastPush = json; call('boardPush', state); }
  });
  return '';
}

// ---------------------------------------------------------------- screen
const what = (b) => [b.audio ? '🔊' : '', b.visual_kind === 'image' ? '🖼' : b.visual_kind === 'video' ? '🎬' : ''].join(' ').trim();

function Editor({ b, index, count }) {
  const set = (patch) => edit('sound_button', b, patch);
  const pick = async (want) => {
    const r = await call('mediaPick', want).catch(() => null); if (!r) return;
    set(want === 'audio' ? { audio: r.file } : { visual: r.file, visual_kind: r.kind });
    if (!b.label) set({ label: r.name.replace(/\.[^.]+$/, '') });
  };
  const move = (dir) => {
    const list = buttons(); const j = index + dir; if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    list.forEach((x, n) => { if (x.sort_order !== n) edit('sound_button', x, { sort_order: n }); });
  };
  const file = (k, want, labelText, empty) => html`<${Field} label=${labelText} wide><div class="sbfile">
    ${b[k] ? html`<span class="sbname2" title=${nameOf(b[k])}>${nameOf(b[k])}</span><button class="x" title="Remove" onClick=${() => set(k === 'audio' ? { audio: '' } : { visual: '', visual_kind: '' })}>×</button>` : html`<span class="muted">${empty}</span>`}
    <button onClick=${() => pick(want)}>${b[k] ? 'Replace…' : 'Choose…'}</button></div><//>`;
  return html`<div class="sbedit">
    <div class="grid">
      <${Field} label="Label" wide><input value=${b.label} placeholder="Thunder, Tavern music, Map of the keep…" onInput=${(e) => set({ label: e.target.value })} /><//>
      ${file('audio', 'audio', 'Sound', 'No sound')}
      ${file('visual', 'visual', 'Picture or video', 'Nothing to show')}
      ${b.visual_kind === 'image' ? html`<div class="sbpreview wide"><img src=${mediaUrl(b.visual)} alt="" /></div>` : ''}
      <${Field} label="Disappear after" hint="seconds; leave empty for no limit"><input type="number" min="0" value=${b.duration || ''} placeholder="no limit"
        onInput=${(e) => set({ duration: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /><//>
      <${Field} label=${`Volume ${b.volume ?? 100}%`}><input type="range" min="0" max="100" step="5" value=${b.volume ?? 100} onInput=${(e) => set({ volume: Number(e.target.value) })} /><//>
      <${Field} label="Colour" wide><div class="seg">${COLORS.map(([k, l]) => html`<button class=${(b.color || '') === k ? 'on' : ''} onClick=${() => set({ color: k })}>${l}</button>`)}</div><//>
      <label class="check wide"><input type="checkbox" checked=${!!b.loop} onChange=${(e) => set({ loop: e.target.checked ? 1 : 0 })} /> Loop until stopped</label>
    </div>
    <p class="muted small">${b.visual ? 'The picture or video shows on the player view. ' : ''}${b.duration ? `It stops and disappears after ${b.duration} seconds.`
      : b.visual_kind === 'image' ? 'With no time limit, the picture stays until you press the button again.' : b.visual_kind === 'video' && !b.loop ? 'The video closes when it ends.' : b.loop ? 'It plays until you press the button again.' : 'The sound plays once.'}</p>
    <div class="rowbtns">
      <button onClick=${() => move(-1)} disabled=${index === 0} title="Move earlier">←</button><button onClick=${() => move(1)} disabled=${index === count - 1} title="Move later">→</button>
      <button onClick=${() => fire(b)}>${isPlaying(b.id) ? '■ Stop' : '▶ Try it'}</button>
      <span class="spacer"></span>
      <button class="danger ghost" onClick=${() => { stop(b.id); del('sound_button', b); }}>Delete button</button>
    </div>
  </div>`;
}

export function SoundboardScreen() {
  const list = buttons();
  const [editing, setEditing] = useState(!!S.route.editing);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (S.route.editing) { setEditing(true); S.route.editing = false; } });
  const cur = editing ? list.find((b) => b.id === sel) || null : null;
  const add = async () => { const b = await create('sound_button', { label: '', sort_order: list.length, volume: 100 }); setEditing(true); setSel(b.id); };
  // 1–9 and 0 press the first ten buttons; Esc stops everything.
  useHotkey((e) => !editing && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !document.querySelector('.overlay')
    && (KEYS.includes(e.key) || (e.key === 'Escape' && playing.size)), (e) => { if (e.key === 'Escape') stopAll(); else fire(list[KEYS.indexOf(e.key)]); });
  return html`<div class="soundboard">
    <div class="tbar">
      <div class="round">Soundboard</div>
      <span class="spacer"></span>
      <button onClick=${stopAll} disabled=${!playing.size} title="Stop every sound and take down the picture (Esc)">■ Stop all</button>
      <button class=${S.player?.board ? 'on' : ''} onClick=${toggleBoard} title="A small window of these buttons that stays on top of other windows (Ctrl+Shift+B)">${S.player?.board ? 'Close pop-out board' : 'Pop out board'}</button>
      <button class=${editing ? 'on' : ''} onClick=${() => { setEditing(!editing); setSel(null); }}>${editing ? '✓ Done editing' : '✎ Edit buttons'}</button>
    </div>
    <div class="sbbody">
      <div class="sbgrid">
        ${list.map((b, n) => html`<button key=${b.id} class="sbbtn ${b.color || ''} ${isPlaying(b.id) ? 'playing' : ''} ${cur?.id === b.id ? 'sel' : ''} ${!b.audio && !b.visual ? 'blank' : ''}"
          onClick=${() => (editing ? setSel(b.id) : fire(b))} title=${editing ? 'Edit this button' : isPlaying(b.id) ? 'Playing — press to stop' : 'Press to play'}>
          <span class="sbkey">${n < 10 ? html`<kbd>${KEYS[n]}</kbd>` : ''}<i>${what(b)}</i>${b.duration ? html`<small>${b.duration}s</small>` : ''}</span>
          <span class="sblabel">${b.label || 'New button'}</span>
          <span class="sbstate">${isPlaying(b.id) ? '■ Playing' : ''}</span>
        </button>`)}
        ${editing || !list.length ? html`<button class="sbbtn add" onClick=${add}><span class="sblabel">+ Add a button</span></button>` : ''}
      </div>
      ${editing ? html`<div class="sbside">${cur ? html`<${Editor} key=${cur.id} b=${cur} index=${list.indexOf(cur)} count=${list.length} />`
        : html`<${Empty}>Pick a button to change it, or add a new one.<br /><br />Each button can hold a sound, a picture or video for the player view, or a picture and a sound together. Files are copied into Roll Ready, so the originals can be moved or deleted.<//>`}</div>` : ''}
    </div>
    ${!editing ? html`<div class="keyhint">${list.length ? '1–9 and 0 press the first ten buttons · press a playing button to stop it · Esc stops everything' : 'Add a button, then load it with a sound, a picture or a video.'}${list.some((b) => b.visual) && !S.player?.open ? ' · Pictures and video need the player view open (Ctrl+Shift+P)' : ''}</div>` : ''}
  </div>`;
}
