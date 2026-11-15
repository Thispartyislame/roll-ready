// Always-available tools: stopwatch, command palette, shortcut reference, and the settings screen.
import { html, useState, useEffect, useLayoutEffect, useRef, S, notify, call, create, edit, del, open, go, openCampaign, label, tagsOf, nameScore, toast, TIERS, themeChoice, setTheme } from './lib.js';
import { Bound, Field } from './components.js';
import { roll, isDice, toggleDice } from './dice.js';
import { toggleTimers } from './timers.js';
import { step, tracker, order, addEncounter } from './combat.js';
import { popOutPlayer } from './tracker.js';
import { toggleEmergency } from './npcgen.js';
import { startSession, activeSession } from './sessions.js';

// Things the shell (app.js) knows how to do, for the command palette: focus the quick-note or quick-roll field.
export const hooks = { note: () => {}, quickRoll: () => {} };

// ---------------------------------------------------------------- stopwatch
// Lives outside any screen, so it keeps counting while you flip around.
const tm = { running: false, since: 0, banked: 0 };
const elapsed = () => tm.banked + (tm.running ? Date.now() - tm.since : 0);
export function toggleTimer() { if (tm.running) { tm.banked = elapsed(); tm.running = false; } else { tm.since = Date.now(); tm.running = true; } notify(); }
export function Timer() {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tm.running && tick((n) => n + 1), 250); return () => clearInterval(i); }, []);
  const s = Math.floor(elapsed() / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0'); const ss = String(s % 60).padStart(2, '0');
  return html`<div class="timer ${tm.running ? 'run' : ''}" title="Stopwatch (Ctrl+T starts and pauses). For countdowns, use ⏳ Timers.">
    <span class="tdisp">${mm}:${ss}</span>
    <button onClick=${toggleTimer} title=${tm.running ? 'Pause' : 'Start'}>${tm.running ? '❚❚' : '▶'}</button>
    <button onClick=${() => { tm.running = false; tm.banked = 0; notify(); }} title="Reset">↺</button>
  </div>`;
}

// ---------------------------------------------------------------- command palette (Ctrl+K)
const pal = { open: false };
export function togglePalette() { pal.open = !pal.open; notify(); }
const KIND = { npc: 'NPC', location: 'Location', faction: 'Faction', quest: 'Quest', encounter: 'Encounter', session: 'Session', monster: 'Monster', spell: 'Spell', item: 'Item', rule: 'Rule' };

const whoseTurn = () => { const t = tracker(); const c = order(t).find((x) => x.id === t.turn); return c ? `Round ${t.round} — ${c.name}'s turn.` : 'No one is in the initiative tracker.'; };
// Actions the palette can run. `words` are extra search terms.
function actions() {
  return [
    { name: 'Next turn', hint: 'Space, in the tracker', words: 'initiative advance', run: () => { step(1); toast(whoseTurn()); } },
    { name: 'Previous turn', hint: '←, in the tracker', words: 'initiative back', run: () => { step(-1); toast(whoseTurn()); } },
    { name: 'Roll dice', hint: 'Ctrl+E — or type a roll here, like 2d6+3', words: 'quick roll', run: () => hooks.quickRoll() },
    { name: 'Open the dice roller and history', hint: 'Ctrl+D', words: 'roll log', run: () => toggleDice(true) },
    { name: 'Start a timer', hint: 'countdown in rounds or minutes', words: 'countdown new timer', run: () => toggleTimers(true) },
    { name: 'Start or pause the stopwatch', hint: 'Ctrl+T', words: 'timer', run: toggleTimer },
    { name: 'New note', hint: 'Ctrl+J', words: 'write session log', run: async () => { if (!activeSession()) await startSession(); hooks.note(); } },
    { name: 'Emergency NPC', hint: 'Ctrl+N', words: 'generate random character name', run: () => toggleEmergency(true) },
    { name: 'Pop out player view', hint: 'Ctrl+Shift+P', words: 'second monitor screen window display', run: () => popOutPlayer() },
    ...(S.player?.open ? [{ name: 'Close player view', hint: '', words: 'window', run: () => call('playerClose') }] : []),
    { name: 'Start a new session', hint: '', words: 'begin', run: startSession },
    { name: 'Switch theme: ' + (window.rrTheme.resolved() === 'light' ? 'dark' : 'light'), hint: '', words: 'appearance mode night day', run: () => setTheme(window.rrTheme.resolved() === 'light' ? 'dark' : 'light') },
    { name: 'Keyboard shortcuts', hint: '?', words: 'help keys reference', run: () => toggleShortcuts(true) },
    ...[['tracker', 'Initiative tracker'], ['lookup', 'Rules & spells'], ['party', 'Party'], ['generators', 'Generators'], ['monster', 'Monsters'], ['settings', 'Settings & about']]
      .map(([k, l]) => ({ name: 'Go to ' + l, hint: '', words: '', run: () => go(k) })),
    ...S.c.encounter.map((e) => ({ name: 'Run encounter: ' + (e.name || '(unnamed)'), hint: 'load it into the tracker', words: 'start fight combat', run: () => { addEncounter(e); go('tracker'); } })),
  ];
}

export function Palette() {
  const [q, setQ] = useState(''); const [hi, setHi] = useState(0);
  const ref = useRef();
  // Layout effect: focus lands before the next keystroke, so typing straight after Ctrl+K is never lost.
  useLayoutEffect(() => { if (pal.open) { setQ(''); setHi(0); ref.current?.focus(); } }, [pal.open]);
  if (!pal.open) return '';
  const raw = q.trim();
  const ql = raw.toLowerCase().replace(/^[#>]/, '').trim();
  const hits = [];
  const acts = actions();
  if (!ql) acts.slice(0, 12).forEach((a) => hits.push({ a, s: 1 }));
  else {
    if (isDice(raw)) hits.push({ a: { name: 'Roll ' + raw, hint: 'Enter', run: () => roll(raw) }, s: 200 });
    for (const a of acts) {
      const n = a.name.toLowerCase();
      const s = Math.max(nameScore(n, ql), ql.split(/\s+/).every((w) => (n + ' ' + a.words).includes(w)) ? 45 : 0);
      if (s) hits.push({ a, s: s + (raw.startsWith('>') ? 100 : 0) });
    }
    for (const t of ['npc', 'location', 'faction', 'quest', 'encounter', 'session']) for (const e of S.c[t]) {
      const s = Math.max(nameScore(label(e).toLowerCase(), ql), tagsOf(e).some((x) => x.toLowerCase().startsWith(ql)) ? 50 : 0);
      if (s) hits.push({ t, e, s: s + 5 });
    }
    for (const [t, k] of [['monster', 'monsters'], ['spell', 'spells'], ['item', 'items'], ['rule', 'rules']]) for (const e of S[k]) {
      const s = nameScore(e._n, ql); if (s) hits.push({ t, e, s });
    }
    hits.sort((a, b) => b.s - a.s || (a.a ? a.a.name : label(a.e)).localeCompare(b.a ? b.a.name : label(b.e)));
    hits.length = Math.min(hits.length, 14);
  }
  const pick = (h) => { if (!h) return; pal.open = false; notify(); if (h.a) h.a.run(); else open(h.t, h.e.id); };
  return html`<div class="overlay" onMouseDown=${(e) => { if (e.target === e.currentTarget) togglePalette(); }}>
    <div class="palette">
      <input ref=${ref} value=${q} placeholder="Jump to anything by name or tag, run an action (next turn, start timer…), or type a roll like 2d6+3"
        onInput=${(e) => { setQ(e.target.value); setHi(0); }}
        onKeyDown=${(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hits.length - 1, hi + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, hi - 1)); } else if (e.key === 'Enter') pick(hits[hi]); else if (e.key === 'Escape') togglePalette(); }} />
      ${hits.map((h, n) => (h.a
        ? html`<div class="mi act ${n === hi ? 'hi' : ''}" onMouseDown=${(e) => { e.preventDefault(); pick(h); }}><span>▸ ${h.a.name}</span><small>${h.a.hint}</small></div>`
        : html`<div class="mi ${n === hi ? 'hi' : ''}" onMouseDown=${(e) => { e.preventDefault(); pick(h); }}><span>${label(h.e)}</span><small>${KIND[h.t]}${tagsOf(h.e).length ? ' · ' + tagsOf(h.e).join(', ') : ''}</small></div>`))}
      ${ql && !hits.length ? html`<div class="mi muted">Nothing found.</div>` : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- shortcut reference (?)
const SHORTCUTS = [
  ['Anywhere', [
    ['Ctrl K', 'Command palette: jump to anything, run an action, or type a roll'],
    ['Ctrl E', 'Quick roll: type 2d6+3, Enter'],
    ['Ctrl D', 'Dice roller and roll history'],
    ['Ctrl N', 'Emergency NPC'],
    ['Ctrl J', 'Write a note in the live session'],
    ['Ctrl I', 'Initiative tracker'],
    ['Ctrl L', 'Rules and spell lookup'],
    ['Ctrl T', 'Start or pause the stopwatch'],
    ['Ctrl Shift P', 'Pop out (or close) the player view'],
    ['?', 'This list'],
  ]],
  ['Initiative tracker', [
    ['Space / → / N', 'Next turn'],
    ['← / P', 'Previous turn'],
    ['↑ / ↓', 'Select a combatant'],
    ['D', 'Damage the selected combatant: type the amount, Enter'],
    ['H', 'Heal the selected combatant'],
    ['C', 'Conditions menu, then the key shown beside each condition'],
    ['V', 'Hide or show the selected combatant in the player view'],
  ]],
  ['Elsewhere', [
    ['R', 'Reroll (Generators screen and the Emergency NPC panel)'],
    ['F11 / Esc', 'Player view: enter or leave full screen'],
    ['F12', 'Developer tools, for diagnosing problems'],
  ]],
];
const Keys = ({ k }) => k.split(' / ').map((alt, n) => html`${n ? ' / ' : ''}${alt.split(' ').map((p, i) => html`${i ? '+' : ''}<kbd>${p}</kbd>`)}`);
const ShortcutTable = () => html`<div class="keycols">${SHORTCUTS.map(([title, rows]) => html`<div><h4>${title}</h4>
  <table class="plain keys">${rows.map(([k, what]) => html`<tr><td><${Keys} k=${k} /></td><td>${what}</td></tr>`)}</table></div>`)}</div>
  <p class="muted">On macOS use ⌘ in place of Ctrl.</p>`;

const sc = { open: false };
export function toggleShortcuts(force) { sc.open = typeof force === 'boolean' ? force : !sc.open; notify(); }
export function Shortcuts() {
  useEffect(() => {
    if (!sc.open) return undefined;
    const h = (e) => { if (e.key === 'Escape') { e.preventDefault(); toggleShortcuts(false); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [sc.open]);
  if (!sc.open) return '';
  return html`<div class="overlay" onMouseDown=${(e) => { if (e.target === e.currentTarget) toggleShortcuts(false); }}>
    <div class="modal wide"><h3>Keyboard shortcuts <button class="x" title="Close (Esc)" onClick=${() => toggleShortcuts(false)}>×</button></h3><${ShortcutTable} /></div></div>`;
}

// ---------------------------------------------------------------- settings
export async function newCampaign(name) {
  const c = await call('save', 'campaign', { name, system: '5E (2024 rules)' });
  S.campaigns.push(c);
  await openCampaign(c.id);
  go('npc');
}

// XP budget per character, by party level and tier. Used by the encounter builder; every cell is editable
// so a GM can match their own books or house rules.
function Thresholds() {
  const ref = useRef();
  useEffect(() => { if (S.route.section === 'thresholds') ref.current?.scrollIntoView({ block: 'start' }); }, [S.route.section]);
  const cell = (level, tier) => S.thresholds.find((t) => t.level === level && t.tier === tier);
  const set = (level, tier, v) => {
    const xp = Math.max(0, parseInt(v, 10) || 0);
    const t = cell(level, tier);
    if (t) t.xp = xp; else S.thresholds.push({ level, tier, xp });
    notify();
    call('setThreshold', level, tier, xp);
  };
  return html`<section ref=${ref}><h2>Encounter difficulty <small>XP budget per character — the encounter builder multiplies it by your party size</small></h2>
    <p class="muted">The defaults are the “XP Budget per Character” table from SRD 5.2. Change any number to match your own books or house rules; changes save as you type.</p>
    <table class="plain thresholds">
      <tr class="th"><td>Party level</td>${TIERS.map(([, l]) => html`<td>${l}</td>`)}</tr>
      ${Array.from({ length: 20 }, (_, i) => i + 1).map((level) => html`<tr><td>${level}</td>
        ${TIERS.map(([k]) => html`<td><input type="number" min="0" value=${cell(level, k)?.xp ?? ''} onInput=${(e) => set(level, k, e.target.value)} /></td>`)}</tr>`)}
    </table>
  </section>`;
}

export function SettingsScreen() {
  const c = S.campaigns.find((x) => x.id === S.cid);
  const [openCond, setOpenCond] = useState(null);
  const addCond = async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    await create('condition', { name: e.target.value.trim(), description: '', leveled: 0, sort_order: (S.conditions.at(-1)?.sort_order ?? 0) + 1 });
    e.target.value = '';
  };
  return html`<div class="settings">
    <section><h2>Campaign</h2>
      ${c ? html`<div class="grid">
        <${Field} label="Name"><${Bound} type="campaign" obj=${c} k="name" /><//>
        <${Field} label="Rules system" hint="free text"><input list="systems" value=${c.system} onInput=${(e) => edit('campaign', c, { system: e.target.value })} />
          <datalist id="systems"><option value="5E (2024 rules)" /><option value="5E (2014 rules)" /></datalist><//>
        <${Field} label="Campaign notes" wide><${Bound} type="campaign" obj=${c} k="notes" area rows=${5} placeholder="Premise, house rules, things to remember" /><//>
      </div>
      <div class="rowbtns">
        <input placeholder="+ New campaign — type a name, press Enter" onKeyDown=${(e) => { if (e.key === 'Enter' && e.target.value.trim()) { newCampaign(e.target.value.trim()); e.target.value = ''; } }} />
        <button class="danger ghost" onClick=${() => del('campaign', c)}>Delete this campaign…</button>
      </div>` : ''}
    </section>
    <section><h2>Appearance</h2>
      <div class="seg">${[['auto', 'Follow system'], ['dark', 'Dark'], ['light', 'Light']].map(([k, l]) => html`<button class=${themeChoice() === k ? 'on' : ''} onClick=${() => setTheme(k)}>${l}</button>`)}</div>
      <p class="muted">The player view has its own theme: set it from Player view in the initiative tracker, or in the player window itself.</p>
    </section>
    <section><h2>Conditions <small>shown in the initiative tracker — edit freely if your table runs different rules</small></h2>
      <div class="conds">
        ${S.conditions.map((k) => html`<div class="condrow">
          <${Bound} type="condition" obj=${k} k="name" />
          <label class="check" title="Tracks a level, like Exhaustion"><input type="checkbox" checked=${!!k.leveled} onChange=${(e) => edit('condition', k, { leveled: e.target.checked ? 1 : 0 })} /> has levels</label>
          <button class="ghost" onClick=${() => setOpenCond(openCond === k.id ? null : k.id)}>${openCond === k.id ? 'Hide text' : 'Rule text'}</button>
          <button class="x" title="Remove" onClick=${() => del('condition', k)}>×</button>
          ${openCond === k.id ? html`<${Bound} type="condition" obj=${k} k="description" area rows=${5} cls="wide" />` : ''}
        </div>`)}
        <input placeholder="+ Add a condition — type a name, press Enter" onKeyDown=${addCond} />
      </div>
    </section>
    <${Thresholds} />
    <section><h2>Keyboard shortcuts <small>press ? on any screen to see this list</small></h2><${ShortcutTable} /></section>
    <section><h2>Your data</h2>
      <p>Everything is stored in one file on this computer. Back it up by copying it.</p>
      <p><code>${S.dbFile}</code> <button onClick=${() => call('showDataFile')}>Show in folder</button></p>
    </section>
    <section><h2>About & credits</h2>
      <p>Roll Ready 2.0 — a local-first helper for game masters. 5E compatible (2024 rules).</p>
      <p class="attrib">${S.attribution}</p>
      <p class="muted">Built-in rules, spells, items and monsters are SRD 5.2 content only. Anything marked “Mine” is your own. The generator tables (names, taverns, rumors, treasure, emergency NPCs) are original content written for Roll Ready.</p>
    </section>
  </div>`;
}
