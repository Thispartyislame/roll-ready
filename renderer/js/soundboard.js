// Soundboard: a grid of buttons, each holding a sound, a picture or video for the player view, or both.
// Sound plays here in the GM window; pictures and video go to the player view. A button can have a time
// limit after which it stops and its picture disappears. The pop-out board (board.html) is only a remote:
// it shows these buttons and reports which one was pressed.
import { html, useState, useEffect, S, notify, call, create, edit, del, go, toast, byId, setKv } from './lib.js';
import { Field, Empty, useHotkey } from './components.js';

const KEYS = '1234567890';
const COLORS = [['', 'Plain'], ['blue', 'Blue'], ['violet', 'Violet'], ['good', 'Green'], ['orange', 'Orange'], ['bad', 'Red']];
export const mediaUrl = (file) => 'rrmedia://media/' + encodeURIComponent(file);
const nameOf = (file) => file.replace(/^[a-z0-9]+-/, '');
export const buttons = () => [...S.c.sound_button].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

// ---------------------------------------------------------------- playing
const playing = new Map();      // button id -> { audio, timer, token, fading, scene }
let onScreen = null;            // { id, token }: what is on the player view — a button id, or "pic:npc:12" for a revealed picture
export const isPlaying = (id) => playing.has(id);
const isScene = (b) => b.channel === 'scene';
export const membersOf = (b) => (Array.isArray(b.members) ? b.members : []).map((id) => byId('sound_button', id)).filter((m) => m && !isScene(m));

// Two master volumes on top of each button's own: one for music, one for effects.
export const channelVolumes = () => ({ music: 100, effect: 100, ...(S.kv.sbVolume || {}) });
const level = (b) => Math.max(0, Math.min(1, ((b.volume ?? 100) / 100) * (channelVolumes()[b.channel === 'music' ? 'music' : 'effect'] / 100)));
export function setChannelVolume(channel, value) {
  setKv('sbVolume', { ...channelVolumes(), [channel]: value });
  for (const [id, p] of playing) { const b = byId('sound_button', id); if (b && p.audio && !p.fading) p.audio.volume = level(b); }
  notify();
}
// Move an audio element's volume to `to` over `seconds`, then call `done`.
function ramp(p, to, seconds, done) {
  clearInterval(p.ramp);
  const from = p.audio.volume; const steps = Math.max(1, Math.round(seconds * 20)); let n = 0;
  p.ramp = setInterval(() => { n++; p.audio.volume = Math.max(0, Math.min(1, from + (to - from) * (n / steps))); if (n >= steps) { clearInterval(p.ramp); done?.(); } }, 50);
}

function takeDown() {
  if (!onScreen) return;
  const id = onScreen.id;
  if (playing.has(id)) stop(id, true); else { onScreen = null; call('playerMedia', null); notify(); }
}
// Stop a button. A button with a fade fades out first, unless `instant` (Stop all, or pressing it again mid-fade).
export function stop(id, instant) {
  const p = playing.get(id); if (!p) return;
  const b = byId('sound_button', id);
  if (p.scene) { playing.delete(id); clearTimeout(p.timer); for (const m of b ? membersOf(b) : []) stop(m.id, instant); notify(); return; }
  if (!instant && !p.fading && p.audio && b?.fade > 0) { p.fading = true; clearTimeout(p.timer); ramp(p, 0, b.fade, () => stop(id, true)); notify(); return; }
  playing.delete(id);
  clearTimeout(p.timer); clearInterval(p.ramp);
  if (p.audio) { p.audio.pause(); p.audio.src = ''; }
  if (onScreen?.id === id) { onScreen = null; call('playerMedia', null); }
  // A scene is over once nothing it started is still going.
  for (const [sid, sp] of playing) if (sp.scene) { const sb = byId('sound_button', sid); if (!sb || !membersOf(sb).some((m) => playing.has(m.id))) { clearTimeout(sp.timer); playing.delete(sid); } }
  notify();
}
export function stopAll() { for (const id of [...playing.keys()]) stop(id, true); takeDown(); }

// Press a button: start it, or stop it if it is already going.
export function fire(b) {
  if (!b) return;
  if (playing.has(b.id)) return stop(b.id, playing.get(b.id).fading);
  const p = { token: Date.now() + ':' + b.id };
  if (isScene(b)) {
    const ms = membersOf(b);
    if (!ms.length) return toast(`“${b.label || 'This scene'}” has no buttons in it yet.`);
    p.scene = true; playing.set(b.id, p);
    for (const m of ms) if (!playing.has(m.id)) fire(m);
    if (b.duration > 0) p.timer = setTimeout(() => stop(b.id), b.duration * 1000);
    notify(); return;
  }
  if (!b.audio && !b.visual) return toast(`“${b.label || 'This button'}” has nothing loaded yet — add a sound, picture or video.`);
  if (b.visual) {
    if (S.player?.open) {
      takeDown();                                // one picture or clip on the table at a time
      onScreen = { id: b.id, token: p.token };
      call('playerMedia', { token: p.token, kind: b.visual_kind, url: mediaUrl(b.visual), volume: level(b), loop: !!b.loop });
    } else if (!b.audio) return toast('Pop out the player view to show pictures and video (Ctrl+Shift+P).');
    else toast('Playing the sound. Pop out the player view to show the picture too (Ctrl+Shift+P).');
  }
  if (b.audio) {
    p.audio = new Audio(mediaUrl(b.audio));
    p.audio.loop = !!b.loop;
    if (b.fade > 0) { p.audio.volume = 0; ramp(p, level(b), b.fade); } else p.audio.volume = level(b);
    // A sound on its own ends the button when it finishes. With a picture, the picture stays until its
    // time limit or until the button is pressed again.
    p.audio.addEventListener('ended', () => { if (playing.get(b.id) === p && onScreen?.id !== b.id) stop(b.id, true); });
    p.audio.addEventListener('error', () => { if (playing.get(b.id) === p) { stop(b.id, true); toast(`Couldn't play the sound on “${b.label}”.`); } });
    p.audio.play().catch(() => {});
  }
  if (b.duration > 0) p.timer = setTimeout(() => stop(b.id), b.duration * 1000);
  playing.set(b.id, p);
  notify();
}

// ---------------------------------------------------------------- pictures attached to NPCs, locations and monsters
// Kept in kv as "img:<type>:<id>" so they work for read-only SRD monsters too. "Show to players" puts the
// picture on the player view through the same channel as a soundboard picture.
export const pictureOf = (type, id) => S.kv[`img:${type}:${id}`] || '';
export const isRevealed = (type, id) => onScreen?.id === `pic:${type}:${id}`;
export function reveal(type, id) {
  if (isRevealed(type, id)) return takeDown();
  const file = pictureOf(type, id); if (!file) return;
  if (!S.player?.open) return toast('Pop out the player view first (Ctrl+Shift+P), then show the picture.');
  takeDown();
  onScreen = { id: `pic:${type}:${id}`, token: Date.now() + ':pic' };
  call('playerMedia', { token: onScreen.token, kind: 'image', url: mediaUrl(file) });
  notify();
}
export function Picture({ type, id, compact }) {
  const file = pictureOf(type, id); const shown = isRevealed(type, id);
  const pick = async () => { const r = await call('mediaPick', 'image').catch(() => null); if (r) { if (shown) takeDown(); await setKv(`img:${type}:${id}`, r.file); notify(); } };
  if (!file) return compact ? '' : html`<div class="picture"><button onClick=${pick}>+ Add a picture</button><span class="muted small">Something to show the players: a portrait, a map, a handout.</span></div>`;
  return html`<div class="picture ${compact ? 'compact' : ''}">
    <img src=${mediaUrl(file)} alt="" />
    <div class="picbtns">
      <button class=${shown ? 'on' : ''} onClick=${() => reveal(type, id)} title="Puts this picture on the player view until you hide it">${shown ? '■ Hide from players' : '▶ Show to players'}</button>
      ${shown ? html`<span class="chip conc">On the player view</span>` : ''}
      ${compact ? '' : html`<button onClick=${pick}>Replace…</button><button class="danger ghost" onClick=${() => { if (shown) takeDown(); setKv(`img:${type}:${id}`, ''); notify(); }}>Remove</button>`}
    </div></div>`;
}

// From the pop-out board and the player view.
export function onBoardEvent(ev) {
  if (ev.type === 'fire') fire(byId('sound_button', ev.id));
  else if (ev.type === 'stop') stopAll();
  else if (ev.type === 'edit') go('soundboard', null, { editing: true });
  else if (ev.type === 'ended' && onScreen?.token === ev.token) stop(onScreen.id, true);      // a clip finished on the player view
}

export const toggleBoard = () => call(S.player?.board ? 'boardClose' : 'boardOpen');

// Keeps the pop-out board showing the current buttons, and takes pictures down if the player view closes.
let lastPush = '';
export function BoardSync() {
  useEffect(() => {
    if (!S.cid) return;
    if (onScreen && !S.player?.open) { const id = onScreen.id; onScreen = null; if (playing.has(id) && !playing.get(id).audio) stop(id, true); else notify(); }
    const state = { theme: window.rrTheme.resolved(), playing: [...playing.keys()],
      buttons: buttons().map((b) => ({ id: b.id, label: b.label, color: b.color, audio: !!b.audio, visual: b.visual ? b.visual_kind : '', duration: b.duration, scene: isScene(b) ? membersOf(b).length : 0, music: b.channel === 'music' })) };
    const json = JSON.stringify(state);
    if (json !== lastPush) { lastPush = json; call('boardPush', state); }
  });
  return '';
}

// ---------------------------------------------------------------- screen
const what = (b) => (isScene(b) ? `▦ scene · ${membersOf(b).length}` : [b.audio ? (b.channel === 'music' ? '♫' : '🔊') : '', b.visual_kind === 'image' ? '🖼' : b.visual_kind === 'video' ? '🎬' : ''].join(' ').trim());
const empty = (b) => (isScene(b) ? !membersOf(b).length : !b.audio && !b.visual);

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
  const others = buttons().filter((x) => x.id !== b.id && !isScene(x));
  const inScene = new Set(Array.isArray(b.members) ? b.members : []);
  const toggleMember = (id) => set({ members: inScene.has(id) ? [...inScene].filter((x) => x !== id) : [...inScene, id] });
  return html`<div class="sbedit">
    <div class="grid">
      <${Field} label="Label" wide><input value=${b.label} placeholder=${isScene(b) ? 'Stormy tavern, Dungeon descent…' : 'Thunder, Tavern music, Map of the keep…'} onInput=${(e) => set({ label: e.target.value })} /><//>
      <${Field} label="Kind" wide><div class="seg">${[['effect', 'Effect'], ['music', 'Music'], ['scene', 'Scene']].map(([k, l]) => html`<button class=${(b.channel || 'effect') === k ? 'on' : ''}
        title=${k === 'scene' ? 'Starts several other buttons at once' : k === 'music' ? 'Follows the Music volume' : 'Follows the Effects volume'} onClick=${() => { stop(b.id, true); set({ channel: k }); }}>${l}</button>`)}</div><//>
      ${isScene(b) ? html`<${Field} label="Starts these buttons together" wide><div class="sbmembers">
          ${others.map((x) => html`<label class="check"><input type="checkbox" checked=${inScene.has(x.id)} onChange=${() => toggleMember(x.id)} /> ${x.label || 'New button'} <small>${what(x)}</small></label>`)}
          ${!others.length ? html`<span class="muted">Add some sound or picture buttons first, then tick them here.</span>` : ''}</div><//>` : html`
      ${file('audio', 'audio', 'Sound', 'No sound')}
      ${file('visual', 'visual', 'Picture or video', 'Nothing to show')}
      ${b.visual_kind === 'image' ? html`<div class="sbpreview wide"><img src=${mediaUrl(b.visual)} alt="" /></div>` : ''}
      <${Field} label=${`Volume ${b.volume ?? 100}%`}><input type="range" min="0" max="100" step="5" value=${b.volume ?? 100} onInput=${(e) => set({ volume: Number(e.target.value) })} /><//>
      <${Field} label="Fade in and out" hint="seconds"><input type="number" min="0" max="30" value=${b.fade || ''} placeholder="none"
        onInput=${(e) => set({ fade: Math.max(0, Math.min(30, Math.round(Number(e.target.value) || 0))) })} /><//>`}
      <${Field} label="Disappear after" hint="seconds; leave empty for no limit"><input type="number" min="0" value=${b.duration || ''} placeholder="no limit"
        onInput=${(e) => set({ duration: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /><//>
      <${Field} label="Colour" wide><div class="seg">${COLORS.map(([k, l]) => html`<button class=${(b.color || '') === k ? 'on' : ''} onClick=${() => set({ color: k })}>${l}</button>`)}</div><//>
      ${isScene(b) ? '' : html`<label class="check wide"><input type="checkbox" checked=${!!b.loop} onChange=${(e) => set({ loop: e.target.checked ? 1 : 0 })} /> Loop until stopped</label>`}
    </div>
    <p class="muted small">${isScene(b) ? `Pressing this starts every ticked button; pressing it again stops them.${b.duration ? ` It stops by itself after ${b.duration} seconds.` : ''}`
      : html`${b.visual ? 'The picture or video shows on the player view. ' : ''}${b.duration ? `It stops and disappears after ${b.duration} seconds.`
      : b.visual_kind === 'image' ? 'With no time limit, the picture stays until you press the button again.' : b.visual_kind === 'video' && !b.loop ? 'The video closes when it ends.' : b.loop ? 'It plays until you press the button again.' : 'The sound plays once.'}`}</p>
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
  const add = async (channel) => { const b = await create('sound_button', { label: '', sort_order: list.length, volume: 100, channel, members: [] }); setEditing(true); setSel(b.id); };
  const vol = channelVolumes();
  // 1–9 and 0 press the first ten buttons; Esc stops everything.
  useHotkey((e) => !editing && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !document.querySelector('.overlay')
    && (KEYS.includes(e.key) || (e.key === 'Escape' && (playing.size || onScreen))), (e) => { if (e.key === 'Escape') stopAll(); else fire(list[KEYS.indexOf(e.key)]); });
  return html`<div class="soundboard">
    <div class="tbar">
      <div class="round">Soundboard</div>
      <span class="spacer"></span>
      ${[['music', 'Music'], ['effect', 'Effects']].map(([k, l]) => html`<label class="sbvol" title=${`${l} volume, on top of each button's own`}>${l}
        <input type="range" min="0" max="100" step="5" value=${vol[k]} onInput=${(e) => setChannelVolume(k, Number(e.target.value))} /><span>${vol[k]}%</span></label>`)}
      <button onClick=${stopAll} disabled=${!playing.size && !onScreen} title="Stop every sound and take down the picture (Esc)">■ Stop all</button>
      <button class=${S.player?.board ? 'on' : ''} onClick=${toggleBoard} title="A small window of these buttons that stays on top of other windows (Ctrl+Shift+B)">${S.player?.board ? 'Close pop-out board' : 'Pop out board'}</button>
      <button class=${editing ? 'on' : ''} onClick=${() => { setEditing(!editing); setSel(null); }}>${editing ? '✓ Done editing' : '✎ Edit buttons'}</button>
    </div>
    <div class="sbbody">
      <div class="sbgrid">
        ${list.map((b, n) => html`<button key=${b.id} class="sbbtn ${b.color || ''} ${isPlaying(b.id) ? 'playing' : ''} ${cur?.id === b.id ? 'sel' : ''} ${empty(b) ? 'blank' : ''}"
          onClick=${() => (editing ? setSel(b.id) : fire(b))} title=${editing ? 'Edit this button' : isPlaying(b.id) ? 'Playing — press to stop' : 'Press to play'}>
          <span class="sbkey">${n < 10 ? html`<kbd>${KEYS[n]}</kbd>` : ''}<i>${what(b)}</i>${b.duration ? html`<small>${b.duration}s</small>` : ''}</span>
          <span class="sblabel">${b.label || 'New button'}</span>
          <span class="sbstate">${isPlaying(b.id) ? (playing.get(b.id).fading ? '■ Fading out' : '■ Playing') : ''}</span>
        </button>`)}
        ${editing || !list.length ? html`<button class="sbbtn add" onClick=${() => add('effect')}><span class="sblabel">+ Add a button</span></button>` : ''}
        ${editing && list.some((b) => !isScene(b)) ? html`<button class="sbbtn add" onClick=${() => add('scene')} title="One button that starts several others at once"><span class="sblabel">+ Add a scene</span></button>` : ''}
      </div>
      ${editing ? html`<div class="sbside">${cur ? html`<${Editor} key=${cur.id} b=${cur} index=${list.indexOf(cur)} count=${list.length} />`
        : html`<${Empty}>Pick a button to change it, or add a new one.<br /><br />Each button can hold a sound, a picture or video for the player view, or a picture and a sound together. Files are copied into Roll Ready, so the originals can be moved or deleted.<//>`}</div>` : ''}
    </div>
    ${!editing ? html`<div class="keyhint">${list.length ? '1–9 and 0 press the first ten buttons · press a playing button to stop it · Esc stops everything' : 'Add a button, then load it with a sound, a picture or a video.'}${list.some((b) => b.visual) && !S.player?.open ? ' · Pictures and video need the player view open (Ctrl+Shift+P)' : ''}</div>` : ''}
  </div>`;
}

// Current volume of each playing sound, by label (used by the automated tests).
export const __levels = () => Object.fromEntries([...playing].filter(([, p]) => p.audio).map(([id, p]) => [byId('sound_button', id)?.label, p.audio.volume]));
