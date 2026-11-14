// Dice: expression parser, roller, roll history, the quick-roll bar and the draggable roller panel.
import { html, useState, useEffect, useRef, S, notify, call, setKv, create, toast, d, clock, byId } from './lib.js';

// ---------------------------------------------------------------- parsing
// Grammar:  term (("+" | "-") term)*      term = [count] "d" sides [("kh"|"kl"|"dh"|"dl") n]  |  number
// Examples: 2d6+3   d20   4d6kh3   2d20kl1 + 5   1d12 + 2d4 - 1   d%
export function parseDice(input) {
  const src = String(input || '').toLowerCase().replace(/\s+/g, '').replace(/−/g, '-');
  if (!src) throw new Error('Type a roll, like 2d6+3.');
  const terms = [];
  const re = /([+-]?)(?:(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d+))?|(\d+))/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m || (pos > 0 && !m[1])) throw new Error(`Couldn't read “${src.slice(pos, pos + 8)}” — try something like 2d6+3 or 4d6kh3.`);
    const sign = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) terms.push({ sign, value: Number(m[6]) });
    else {
      const count = m[2] === '' ? 1 : Number(m[2]);
      const sides = m[3] === '%' ? 100 : Number(m[3]);
      if (count < 1 || count > 200) throw new Error('Roll between 1 and 200 dice at a time.');
      if (sides < 2 || sides > 1000) throw new Error(`A d${sides} isn't a die this can roll (use d2 to d1000).`);
      let keep = count;
      if (m[4]) {
        const n = Number(m[5]);
        keep = m[4][0] === 'k' ? n : count - n;
        if (keep < 1 || keep > count) throw new Error(`“${m[4]}${m[5]}” doesn't work with ${count} ${count === 1 ? 'die' : 'dice'}.`);
      }
      // highest = keep the highest dice (kh, or drop lowest); otherwise keep the lowest
      terms.push({ sign, count, sides, keep, highest: !m[4] || m[4] === 'kh' || m[4] === 'dl', text: `${count}d${sides}${m[4] ? m[4] + m[5] : ''}` });
    }
    pos = re.lastIndex;
  }
  return terms;
}
export const isDice = (s) => { try { return /d/i.test(s) && !!parseDice(s); } catch { return false; } };

// Roll parsed terms. Returns the total and a readable breakdown with every die shown;
// dropped dice appear in parentheses.
export function rollTerms(terms) {
  let total = 0;
  const parts = terms.map((t, n) => {
    const lead = n === 0 ? (t.sign < 0 ? '−' : '') : (t.sign < 0 ? ' − ' : ' + ');
    if (t.value !== undefined) { total += t.sign * t.value; return lead + t.value; }
    const rolls = Array.from({ length: t.count }, () => d(t.sides));
    const order = rolls.map((v, i) => i).sort((a, b) => (t.highest ? rolls[b] - rolls[a] : rolls[a] - rolls[b]));
    const kept = new Set(order.slice(0, t.keep));
    total += t.sign * rolls.reduce((sum, v, i) => sum + (kept.has(i) ? v : 0), 0);
    return `${lead}${t.text} [${rolls.map((v, i) => (kept.has(i) ? v : `(${v})`)).join(', ')}]`;
  });
  return { total, detail: `${parts.join('')} = ${total}` };
}

// ---------------------------------------------------------------- rolling + history
const liveSessionId = () => S.kv['activeSession:' + S.cid] ?? null;

// Roll an expression, record it, and show it. `label` says what it was for ("Scimitar attack");
// `combatant` links it to whoever rolled. Returns the log entry, or null if the expression was invalid.
export function roll(expr, { label = '', combatant = '', times = 1 } = {}) {
  let terms;
  try { terms = parseDice(expr); } catch (e) { toast(e.message); return null; }
  const lines = []; let grand = 0;
  for (let r = 1; r <= times; r++) { const res = rollTerms(terms); lines.push((times > 1 ? `Roll ${r}:  ` : '') + res.detail); grand += res.total; }
  if (times > 1) lines.push(`Grand total: ${grand}`);
  const text = terms.map((t, n) => (n === 0 ? (t.sign < 0 ? '−' : '') : (t.sign < 0 ? ' − ' : ' + ')) + (t.text ?? t.value)).join('');
  const entry = {
    created_at: new Date().toISOString(),
    expression: (label ? label + ': ' : '') + text + (times > 1 ? `  × ${times}` : ''),
    detail: lines.join('\n'), total: grand, session_id: byId('session', liveSessionId()) ? liveSessionId() : null, combatant,
  };
  S.lastRoll = entry;
  S.diceLog.unshift(entry); if (S.diceLog.length > 200) S.diceLog.length = 200;
  notify();
  call('diceAdd', entry).then((saved) => { entry.id = saved.id; });
  return entry;
}

export const rollLine = (e) => `${e.combatant ? e.combatant + ' — ' : ''}${e.expression} → ${e.total}`;

// Copy a roll into the live session's notes.
export async function logToNotes(entry) {
  const sid = liveSessionId();
  if (!byId('session', sid)) return toast('Start a session first — rolls are logged to the live session\'s notes.');
  await create('note', { session_id: sid, created_at: new Date().toISOString(), body: `🎲 ${rollLine(entry)}   (${entry.detail.replace(/\n/g, '; ')})`, npc_ids: [], quest_ids: [] });
  toast('Roll added to the session notes.');
}

// ---------------------------------------------------------------- quick-roll bar (top of every screen)
export function QuickRoll({ inputRef }) {
  const [text, setText] = useState('');
  const last = S.lastRoll;
  return html`<div class="quickroll" title="Type a roll and press Enter (Ctrl+E from anywhere). Examples: 2d6+3, d20, 4d6kh3, 2d20kh1+5">
    <input ref=${inputRef} value=${text} placeholder="🎲 2d6+3" onInput=${(e) => setText(e.target.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' && text.trim()) { if (roll(text)) e.target.select(); } else if (e.key === 'Escape') { setText(''); e.target.blur(); } }} />
    ${last ? html`<button class="lastroll" title=${rollLine(last) + '\n' + last.detail + '\n\nClick to open the dice roller and history'} onClick=${toggleDice}><b>${last.total}</b></button>` : ''}
  </div>`;
}

// One-line result strip, used in the tracker so a roll made from a stat block is visible where you're looking.
export function LastRoll() {
  const e = S.lastRoll;
  if (!e) return '';
  return html`<div class="rollstrip"><span class="rs-total">${e.total}</span>
    <span class="rs-what">${e.combatant ? html`<b>${e.combatant}</b> — ` : ''}${e.expression}</span>
    <span class="rs-detail">${e.detail.split('\n')[0]}</span>
    <button class="ghost" title="Add this roll to the live session's notes" onClick=${() => logToNotes(e)}>→ notes</button></div>`;
}

// ---------------------------------------------------------------- roller panel
const SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100];
const ui = { open: false, expr: '', groups: [{ qty: 1, sides: 20 }], mod: 0, reps: 1, mode: 'normal' };
export function toggleDice(force) { ui.open = typeof force === 'boolean' ? force : !ui.open; notify(); }

// The builder just writes an expression: advantage on a d20 is 2d20kh1, disadvantage 2d20kl1.
function builtExpression() {
  const parts = [];
  for (const g of ui.groups) {
    if (g.qty < 1) continue;
    if (g.sides === 20 && ui.mode !== 'normal') for (let i = 0; i < g.qty; i++) parts.push(ui.mode === 'adv' ? '2d20kh1' : '2d20kl1');
    else parts.push(`${g.qty}d${g.sides}`);
  }
  let s = parts.join(' + ');
  if (ui.mod) s += (ui.mod > 0 ? ' + ' : ' - ') + Math.abs(ui.mod);
  return s;
}

export function Dice() {
  const [pos, setPos] = useState(S.kv.dicePos || { x: window.innerWidth - 450, y: 70 });
  const drag = useRef(null); const box = useRef();
  useEffect(() => {
    const mv = (e) => { if (drag.current) setPos({ x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy)) }); };
    const up = () => { if (drag.current) { drag.current = null; setPos((p) => { setKv('dicePos', p); return p; }); } };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  useEffect(() => { if (ui.open) box.current?.focus(); }, [ui.open]);
  if (!ui.open) return '';
  const upd = (fn) => { fn(); notify(); };
  const n = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));
  const hasD20 = ui.groups.some((g) => g.sides === 20);
  const last = S.diceLog[0];
  return html`<div class="dice" style="left:${pos.x}px;top:${pos.y}px">
    <div class="dhandle" onMouseDown=${(e) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault(); }}>
      <b>🎲 Dice roller</b><span class="muted">drag to move</span><button class="x" onClick=${() => toggleDice(false)} title="Close (Ctrl+D)">×</button></div>
    <div class="dbody">
      <div class="dexprrow"><input ref=${box} value=${ui.expr} placeholder="Type a roll: 2d6+3, 4d6kh3, 2d20kl1…" onInput=${(e) => upd(() => { ui.expr = e.target.value; })}
        onKeyDown=${(e) => { if (e.key === 'Enter' && ui.expr.trim()) { roll(ui.expr); e.target.select(); } }} />
        <button class="primary" onClick=${() => ui.expr.trim() && roll(ui.expr)}>Roll</button></div>
      <details class="dbuild" open=${S.kv.diceBuilder !== false} onToggle=${(e) => { if (e.target.open !== (S.kv.diceBuilder !== false)) setKv('diceBuilder', e.target.open); }}>
        <summary>Build a roll</summary>
        ${ui.groups.map((g, i) => html`<div class="dgroup">
          <input type="number" min="1" max="100" value=${g.qty} onInput=${(e) => upd(() => { g.qty = n(e.target.value, 0, 100); })} />
          <select value=${g.sides} onChange=${(e) => upd(() => { g.sides = Number(e.target.value); })}>${SIDES.map((s) => html`<option value=${s}>d${s}</option>`)}</select>
          ${ui.groups.length > 1 ? html`<button class="x" title="Remove this die group" onClick=${() => upd(() => ui.groups.splice(i, 1))}>×</button>` : ''}
        </div>`)}
        <button class="ghost" onClick=${() => upd(() => ui.groups.push({ qty: 1, sides: 6 }))}>+ Add another die type</button>
        <div class="drow">
          <label>Modifier <input type="number" value=${ui.mod} onInput=${(e) => upd(() => { ui.mod = n(e.target.value, -999, 999); })} /></label>
          <label>Repeat <input type="number" min="1" max="50" value=${ui.reps} onInput=${(e) => upd(() => { ui.reps = n(e.target.value, 1, 50); })} /> ×</label>
        </div>
        <div class="seg" title=${hasD20 ? 'Each d20 is rolled twice; the higher (advantage) or lower (disadvantage) counts' : 'Advantage and disadvantage apply to d20s — add a d20 to use them'}>
          ${[['normal', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']].map(([k, l]) => html`<button class=${ui.mode === k ? 'on' : ''} disabled=${!hasD20 && k !== 'normal'} onClick=${() => upd(() => { ui.mode = k; })}>${l}</button>`)}
        </div>
        <button class="primary block" onClick=${() => { const x = builtExpression(); if (x) roll(x, { times: ui.reps }); }}>Roll ${builtExpression()}${ui.reps > 1 ? ` × ${ui.reps}` : ''}</button>
      </details>
      ${last ? html`<div class="dresult"><div class="dexpr">${rollLine(last).replace(/ → -?\d+$/, '')}</div><pre>${last.detail}</pre><div class="dtotal">${last.total}</div></div>` : ''}
      <div class="dloghead"><b>History</b><button class="ghost" onClick=${() => { S.diceLog = []; S.lastRoll = null; notify(); call('diceClear'); }}>Clear</button></div>
      <div class="dlog">
        ${S.diceLog.map((l) => html`<div class="dl"><small>${clock(l.created_at)} · ${l.combatant ? l.combatant + ' — ' : ''}${l.expression}</small>
          <button class="ghost tonotes" title="Add this roll to the live session's notes" onClick=${() => logToNotes(l)}>→ notes</button><pre>${l.detail}</pre></div>`)}
        ${!S.diceLog.length ? html`<div class="muted">Rolls are kept here between sessions.</div>` : ''}
      </div>
    </div>
  </div>`;
}
