// Always-available tools: stopwatch, dice roller overlay, quick-jump palette, and the settings screen.
import { html, useState, useEffect, useRef, S, notify, call, setKv, create, edit, del, open, go, openCampaign, label, tagsOf, nameScore, d, clock } from './lib.js';
import { Bound, Field, useHotkey } from './components.js';

// ---------------------------------------------------------------- timer
// Lives outside any screen, so it keeps counting while you flip around.
const tm = { running: false, since: 0, banked: 0 };
const elapsed = () => tm.banked + (tm.running ? Date.now() - tm.since : 0);
export function toggleTimer() { if (tm.running) { tm.banked = elapsed(); tm.running = false; } else { tm.since = Date.now(); tm.running = true; } notify(); }
export function Timer() {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tm.running && tick((n) => n + 1), 250); return () => clearInterval(i); }, []);
  const s = Math.floor(elapsed() / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0'); const ss = String(s % 60).padStart(2, '0');
  return html`<div class="timer ${tm.running ? 'run' : ''}" title="Stopwatch (Ctrl+T starts and pauses)">
    <span class="tdisp">${mm}:${ss}</span>
    <button onClick=${toggleTimer} title=${tm.running ? 'Pause' : 'Start'}>${tm.running ? '❚❚' : '▶'}</button>
    <button onClick=${() => { tm.running = false; tm.banked = 0; notify(); }} title="Reset">↺</button>
  </div>`;
}

// ---------------------------------------------------------------- dice roller
const SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100];
const dice = { open: false, groups: [{ qty: 1, sides: 20 }], mod: 0, reps: 1, mode: 'normal', last: null };
export function toggleDice() { dice.open = !dice.open; notify(); }

function roll() {
  const groups = dice.groups.filter((g) => g.qty > 0);
  if (!groups.length) return;
  const adv = dice.mode !== 'normal' && groups.some((g) => g.sides === 20);
  const lines = []; let grand = 0;
  for (let r = 1; r <= dice.reps; r++) {
    let total = dice.mod;
    const parts = groups.map((g) => {
      const shown = [];
      for (let i = 0; i < g.qty; i++) {
        if (adv && g.sides === 20) {
          const a = d(20), b = d(20); const keep = dice.mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
          total += keep; shown.push(`${keep} (of ${a}, ${b})`);
        } else { const v = d(g.sides); total += v; shown.push(v); }
      }
      return `${g.qty}d${g.sides} [${shown.join(', ')}]`;
    });
    if (dice.mod) parts.push(String(Math.abs(dice.mod)));
    const expr = parts.reduce((acc, p, n) => acc + (n ? (n === parts.length - 1 && dice.mod < 0 ? ' − ' : ' + ') : '') + p, '');
    lines.push(`${dice.reps > 1 ? `Roll ${r}:  ` : ''}${expr} = ${total}`);
    grand += total;
  }
  if (dice.reps > 1) lines.push(`Grand total: ${grand}`);
  const expression = groups.map((g) => `${g.qty}d${g.sides}`).join(' + ') + (dice.mod ? ` ${dice.mod > 0 ? '+' : '−'} ${Math.abs(dice.mod)}` : '')
    + (dice.reps > 1 ? `  × ${dice.reps}` : '') + (adv ? (dice.mode === 'adv' ? '  (advantage)' : '  (disadvantage)') : '');
  const entry = { created_at: new Date().toISOString(), expression, detail: lines.join('\n'), total: grand };
  dice.last = entry; S.diceLog.unshift(entry); if (S.diceLog.length > 200) S.diceLog.length = 200;
  notify();
  call('diceAdd', entry);
}

export function Dice() {
  const [pos, setPos] = useState(S.kv.dicePos || { x: window.innerWidth - 440, y: 70 });
  const drag = useRef(null);
  useEffect(() => {
    const mv = (e) => { if (drag.current) setPos({ x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy)) }); };
    const up = () => { if (drag.current) { drag.current = null; setPos((p) => { setKv('dicePos', p); return p; }); } };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  if (!dice.open) return '';
  const upd = (fn) => { fn(); notify(); };
  const n = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));
  const hasD20 = dice.groups.some((g) => g.sides === 20);
  return html`<div class="dice" style="left:${pos.x}px;top:${pos.y}px">
    <div class="dhandle" onMouseDown=${(e) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault(); }}>
      <b>🎲 Dice roller</b><span class="muted">drag to move</span><button class="x" onClick=${toggleDice} title="Close (Ctrl+D)">×</button></div>
    <div class="dbody">
      ${dice.groups.map((g, i) => html`<div class="dgroup">
        <input type="number" min="1" max="100" value=${g.qty} onInput=${(e) => upd(() => { g.qty = n(e.target.value, 0, 100); })} />
        <select value=${g.sides} onChange=${(e) => upd(() => { g.sides = Number(e.target.value); })}>${SIDES.map((s) => html`<option value=${s}>d${s}</option>`)}</select>
        ${dice.groups.length > 1 ? html`<button class="x" title="Remove this die group" onClick=${() => upd(() => dice.groups.splice(i, 1))}>×</button>` : ''}
      </div>`)}
      <button class="ghost" onClick=${() => upd(() => dice.groups.push({ qty: 1, sides: 6 }))}>+ Add another die type</button>
      <div class="drow">
        <label>Modifier <input type="number" value=${dice.mod} onInput=${(e) => upd(() => { dice.mod = n(e.target.value, -999, 999); })} /></label>
        <label>Repeat <input type="number" min="1" max="50" value=${dice.reps} onInput=${(e) => upd(() => { dice.reps = n(e.target.value, 1, 50); })} /> ×</label>
      </div>
      <div class="seg" title=${hasD20 ? 'Each d20 is rolled twice; the higher (advantage) or lower (disadvantage) counts' : 'Advantage and disadvantage apply to d20s — add a d20 to use them'}>
        ${[['normal', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']].map(([k, l]) => html`<button class=${dice.mode === k ? 'on' : ''} disabled=${!hasD20 && k !== 'normal'} onClick=${() => upd(() => { dice.mode = k; })}>${l}</button>`)}
      </div>
      <button class="primary block" onClick=${roll}>Roll</button>
      ${dice.last ? html`<div class="dresult"><div class="dexpr">${dice.last.expression}</div><pre>${dice.last.detail}</pre><div class="dtotal">${dice.last.total}</div></div>` : ''}
      <div class="dloghead"><b>Log</b><button class="ghost" onClick=${() => { S.diceLog = []; dice.last = null; notify(); call('diceClear'); }}>Clear</button></div>
      <div class="dlog">
        ${S.diceLog.map((l) => html`<div class="dl"><small>${clock(l.created_at)} · ${l.expression}</small><pre>${l.detail}</pre></div>`)}
        ${!S.diceLog.length ? html`<div class="muted">Rolls are kept here between sessions.</div>` : ''}
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- quick jump (Ctrl+K)
const pal = { open: false };
export function togglePalette() { pal.open = !pal.open; notify(); }
const KIND = { npc: 'NPC', location: 'Location', faction: 'Faction', quest: 'Quest', encounter: 'Encounter', session: 'Session', monster: 'Monster', spell: 'Spell', item: 'Item', rule: 'Rule' };
export function Palette() {
  const [q, setQ] = useState(''); const [hi, setHi] = useState(0);
  const ref = useRef();
  useEffect(() => { if (pal.open) { setQ(''); setHi(0); ref.current?.focus(); } }, [pal.open]);
  if (!pal.open) return '';
  const ql = q.trim().toLowerCase().replace(/^#/, '');
  const hits = [];
  if (ql) {
    for (const t of ['npc', 'location', 'faction', 'quest', 'encounter', 'session']) for (const e of S.c[t]) {
      const s = Math.max(nameScore(label(e).toLowerCase(), ql), tagsOf(e).some((x) => x.toLowerCase().startsWith(ql)) ? 50 : 0);
      if (s) hits.push({ t, e, s: s + 5 });
    }
    for (const [t, k] of [['monster', 'monsters'], ['spell', 'spells'], ['item', 'items'], ['rule', 'rules']]) for (const e of S[k]) {
      const s = nameScore(e._n, ql); if (s) hits.push({ t, e, s });
    }
    hits.sort((a, b) => b.s - a.s || label(a.e).localeCompare(label(b.e)));
    hits.length = Math.min(hits.length, 14);
  }
  const pick = (h) => { if (!h) return; pal.open = false; open(h.t, h.e.id); };
  return html`<div class="overlay" onMouseDown=${(e) => { if (e.target === e.currentTarget) togglePalette(); }}>
    <div class="palette">
      <input ref=${ref} value=${q} placeholder="Jump to an NPC, place, faction, quest, session, monster, spell… (name or tag)"
        onInput=${(e) => { setQ(e.target.value); setHi(0); }}
        onKeyDown=${(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hits.length - 1, hi + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, hi - 1)); } else if (e.key === 'Enter') pick(hits[hi]); else if (e.key === 'Escape') togglePalette(); }} />
      ${hits.map((h, n) => html`<div class="mi ${n === hi ? 'hi' : ''}" onMouseDown=${() => pick(h)}><span>${label(h.e)}</span><small>${KIND[h.t]}${tagsOf(h.e).length ? ' · ' + tagsOf(h.e).join(', ') : ''}</small></div>`)}
      ${ql && !hits.length ? html`<div class="mi muted">Nothing found.</div>` : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- settings
export async function newCampaign(name) {
  const c = await call('save', 'campaign', { name });
  S.campaigns.push(c);
  await openCampaign(c.id);
  go('npc');
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
          <datalist id="systems"><option value="D&D 2024 (5.5e)" /><option value="D&D 2014 (5e)" /></datalist><//>
        <${Field} label="Campaign notes" wide><${Bound} type="campaign" obj=${c} k="notes" area rows=${5} placeholder="Premise, house rules, things to remember" /><//>
      </div>
      <div class="rowbtns">
        <input placeholder="+ New campaign — type a name, press Enter" onKeyDown=${(e) => { if (e.key === 'Enter' && e.target.value.trim()) { newCampaign(e.target.value.trim()); e.target.value = ''; } }} />
        <button class="danger ghost" onClick=${() => del('campaign', c)}>Delete this campaign…</button>
      </div>` : ''}
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
    <section><h2>Keyboard shortcuts</h2>
      <table class="plain keys">
        <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Jump to anything by name or tag</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>L</kbd></td><td>Rules and spell lookup</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>I</kbd></td><td>Initiative tracker</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>J</kbd></td><td>Write a note in the live session</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Show or hide the dice roller</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>T</kbd></td><td>Start or pause the timer</td></tr>
        <tr><td><kbd>Space</kbd> / <kbd>→</kbd> / <kbd>←</kbd></td><td>Next / previous turn (in the tracker)</td></tr>
      </table>
      <p class="muted">On macOS use ⌘ in place of Ctrl.</p>
    </section>
    <section><h2>Your data</h2>
      <p>Everything is stored in one file on this computer. Back it up by copying it.</p>
      <p><code>${S.dbFile}</code> <button onClick=${() => call('showDataFile')}>Show in folder</button></p>
    </section>
    <section><h2>About & credits</h2>
      <p>DM Helper 1.0 — built for the D&D 2024 revised rules.</p>
      <p class="attrib">${S.attribution}</p>
      <p class="muted">Built-in rules, spells, items and monsters are SRD 5.2 content only. Anything marked “Mine” is your own.</p>
    </section>
  </div>`;
}
