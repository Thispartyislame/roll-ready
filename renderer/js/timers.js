// Named countdown timers. Any number can run at once; each counts either real seconds or combat rounds.
// Round timers tick when the initiative tracker moves to a new round. Expired timers are flagged, never removed silently.
import { html, useState, useEffect, useRef, S, notify, create, edit, del, toast } from './lib.js';

export const timeLeft = (t) => (t.unit === 'seconds' && t.running ? Math.max(0, t.remaining - (Date.now() - t.started_at) / 1000) : Math.max(0, t.remaining));
export const expired = (t) => timeLeft(t) <= 0;
export const fmt = (t) => {
  if (t.unit === 'rounds') { const n = timeLeft(t); return `${n} round${n === 1 ? '' : 's'}`; }
  const s = Math.ceil(timeLeft(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// "10" + unit, or a clock like "60:00" / "1:30" (always real time).
export function parseAmount(text, unit) {
  const s = String(text).trim();
  const clock = s.match(/^(\d+):(\d{1,2})$/);
  if (clock) return { unit: 'seconds', amount: Number(clock[1]) * 60 + Number(clock[2]) };
  const n = parseFloat(s);
  if (!(n > 0)) return null;
  if (unit === 'rounds') return { unit: 'rounds', amount: Math.round(n) };
  return { unit: 'seconds', amount: Math.round(n * (unit === 'minutes' ? 60 : 1)) };
}

export async function addTimer({ label, amount, unit, combatant }) {
  return create('timer', { label: label || 'Timer', unit, duration: amount, remaining: amount, running: 1, started_at: Date.now(),
    combatant_id: combatant?.id ?? null, combatant_name: combatant?.name ?? '' });
}
const pause = (t) => edit('timer', t, { remaining: Math.round(timeLeft(t)), running: 0 });
const resume = (t) => edit('timer', t, { running: 1, started_at: Date.now() });
const restart = (t) => edit('timer', t, { remaining: t.duration, running: 1, started_at: Date.now() });

// Called by the tracker when the round number changes (delta is +1, or -1 when stepping back).
export function tickRounds(delta) {
  for (const t of S.c.timer) {
    if (t.unit !== 'rounds' || !t.running) continue;
    const was = t.remaining;
    edit('timer', t, { remaining: Math.max(0, Math.min(t.duration, t.remaining - delta)) });
    if (was > 0 && t.remaining === 0) toast(`⏳ ${t.label}${t.combatant_name ? ' on ' + t.combatant_name : ''} has expired.`);
  }
}

// A removed combatant takes its attached effects with it — and says so.
export async function dropTimersFor(combatantId) {
  const mine = S.c.timer.filter((t) => t.combatant_id === combatantId);
  for (const t of mine) await del('timer', t, { ask: false });
  if (mine.length) toast(`Removed ${mine.length === 1 ? 'timer “' + mine[0].label + '”' : mine.length + ' timers'} attached to that combatant.`);
}
export const timersFor = (combatantId) => S.c.timer.filter((t) => t.combatant_id === combatantId);

// Re-render once a second while any real-time timer is running, and announce expiries once.
const announced = new Set();
function useTicker() {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => {
      let live = false;
      for (const t of S.c.timer) {
        if (t.unit !== 'seconds' || !t.running) continue;
        live = true;
        if (expired(t) && !announced.has(t.id)) {
          announced.add(t.id);
          edit('timer', t, { remaining: 0, running: 0 });
          toast(`⏳ ${t.label}${t.combatant_name ? ' on ' + t.combatant_name : ''} has expired.`);
        }
      }
      if (live) tick((n) => n + 1);
    }, 500);
    return () => clearInterval(i);
  }, []);
}

// Compact chips: shown in the tracker so running effects stay in view during combat.
export function TimerChips({ combatantId }) {
  useTicker();
  const list = combatantId === undefined ? S.c.timer : timersFor(combatantId);
  return list.map((t) => html`<span key=${t.id} class="chip timerchip ${expired(t) ? 'expired' : ''}" title=${expired(t) ? 'Expired — click to clear' : 'Click to open timers'}
    onClick=${(e) => { e.stopPropagation(); if (expired(t)) del('timer', t, { ask: false }); else toggleTimers(true); }}>
    ⏳ ${t.label}${combatantId === undefined && t.combatant_name ? ` (${t.combatant_name})` : ''}: ${expired(t) ? 'EXPIRED' : fmt(t)}</span>`);
}

const ui = { open: false, focus: 0 };
export function toggleTimers(force) { ui.open = typeof force === 'boolean' ? force : !ui.open; if (ui.open) ui.focus++; notify(); }

// Top-bar button with a drop-down to add and manage timers. `combatants` lets a timer be attached to one.
export function Timers({ combatants }) {
  useTicker();
  const [f, setF] = useState({ label: '', amount: '', unit: 'rounds', who: '' });
  const first = useRef();
  useEffect(() => { if (ui.open) first.current?.focus(); }, [ui.open, ui.focus]);
  const list = S.c.timer;
  const anyExpired = list.some(expired);
  const add = async () => {
    const p = parseAmount(f.amount, f.unit);
    if (!p) return toast('Enter a length, like 10 (rounds or minutes) or 60:00.');
    await addTimer({ label: f.label.trim(), amount: p.amount, unit: p.unit, combatant: combatants.find((c) => String(c.id) === f.who) });
    setF({ ...f, label: '', amount: '' }); first.current?.focus();
  };
  const onKey = (e) => { if (e.key === 'Enter') add(); else if (e.key === 'Escape') toggleTimers(false); };
  return html`<div class="timers">
    <button class=${anyExpired ? 'alert' : ''} onClick=${() => toggleTimers()} title="Countdown timers">⏳ ${list.length || 'Timers'}</button>
    ${ui.open ? html`<div class="timerpanel">
      <div class="tpadd">
        <input ref=${first} class="grow" placeholder="Label: Bless, Torch…" value=${f.label} onInput=${(e) => setF({ ...f, label: e.target.value })} onKeyDown=${onKey} />
        <input class="amt" placeholder="10 or 60:00" value=${f.amount} onInput=${(e) => setF({ ...f, amount: e.target.value })} onKeyDown=${onKey} />
        <select value=${f.unit} onChange=${(e) => setF({ ...f, unit: e.target.value })}><option value="rounds">rounds</option><option value="minutes">minutes</option><option value="seconds">seconds</option></select>
        ${combatants.length ? html`<select value=${f.who} onChange=${(e) => setF({ ...f, who: e.target.value })} title="Attach to a combatant (optional)">
          <option value="">no combatant</option>${combatants.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select>` : ''}
        <button class="primary" onClick=${add}>Start</button>
      </div>
      ${list.map((t) => html`<div key=${t.id} class="tprow ${expired(t) ? 'expired' : ''}">
        <span class="tplabel">${t.label}${t.combatant_name ? html` <small>on ${t.combatant_name}</small>` : ''}</span>
        <span class="tptime">${expired(t) ? 'EXPIRED' : fmt(t)}</span>
        ${t.unit === 'rounds'
          ? html`<button title="One round less" onClick=${() => edit('timer', t, { remaining: Math.max(0, t.remaining - 1) })}>−</button><button title="One round more" onClick=${() => edit('timer', t, { remaining: t.remaining + 1, duration: Math.max(t.duration, t.remaining + 1) })}>+</button>`
          : html`<button title=${t.running ? 'Pause' : 'Resume'} disabled=${expired(t)} onClick=${() => (t.running ? pause(t) : resume(t))}>${t.running ? '❚❚' : '▶'}</button>`}
        <button title="Restart from the full length" onClick=${() => { announced.delete(t.id); restart(t); }}>↺</button>
        <button class="x" title="Remove" onClick=${() => del('timer', t, { ask: false })}>×</button>
      </div>`)}
      ${!list.length ? html`<div class="muted pad">No timers running. Round timers tick down when the initiative tracker starts a new round.</div>` : ''}
    </div>` : ''}
  </div>`;
}
