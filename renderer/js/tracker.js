// Initiative tracker — the screen that's open during combat. Everything is one click or one keystroke.
import { html, useState, useRef, useEffect, S, byId, label, toast, num, call, notify, pins, togglePin, sign, mod, go } from './lib.js';
import { Picker, Empty, useHotkey } from './components.js';
import { tracker, touch, order, isDown, step, removeCombatant, withUndo, rollAll, resetCombat, damage, addMonster, addNpc, addAdhoc, addEncounter, addParty, saveOutcome, pushPublic } from './combat.js';
import { StatBlock } from './monsters.js';
import { EntryView } from './lookup.js';
import { roll, LastRoll } from './dice.js';
import { TimerChips, timersFor, fmt, expired } from './timers.js';

const KEYS = '1234567890abcdefghijklm';
const condLabel = (name, v) => (S.conditions.find((x) => x.name === name)?.leveled ? `${name} ${v}` : name);
function toggleCond(c, k) {
  if (k.leveled) { const v = ((c.cond[k.name] || 0) + 1) % 7; if (v) c.cond[k.name] = v; else delete c.cond[k.name]; }
  else if (c.cond[k.name]) delete c.cond[k.name]; else c.cond[k.name] = 1;
  touch();
}
// Constitution save bonus, if this combatant has a stat block to read it from.
const conSave = (c) => { const m = byId('monster', c.monsterId); return m ? (m.data?.saves?.con ?? mod(m.data?.abilities?.con)) : 0; };

// Per-combatant menu: conditions (number keys work while it's open), quick saves, and player-view visibility.
function RowMenu({ c, close }) {
  return html`<div class="condmenu" onClick=${(e) => e.stopPropagation()}>
    <div class="cmhead">Conditions <small>press the key shown, Esc to close</small></div>
    ${S.conditions.map((k, n) => html`<button class=${c.cond[k.name] ? 'on' : ''} title=${k.description} onClick=${() => toggleCond(c, k)}>
      <kbd>${KEYS[n] || ''}</kbd> ${k.name}${k.leveled ? ` ${c.cond[k.name] || 0}` : ''}</button>`)}
    <div class="cmhead">Roll</div>
    <button onClick=${() => roll('1d20', { label: 'Death save', combatant: c.name })}>Death save</button>
    <button onClick=${() => roll('1d20' + sign(conSave(c)), { label: 'Concentration save', combatant: c.name })}>Concentration save</button>
    <div class="cmhead">Player view</div>
    <label class="check"><input type="checkbox" checked=${!!c.hidden} onChange=${(e) => { c.hidden = e.target.checked; touch(); }} /> Hidden from players</label>
    <button class="ghost" onClick=${close}>Done</button>
  </div>`;
}

function Row({ c, active, selected, onSelect, menuOpen, setMenu, heal, endHeal }) {
  const [amt, setAmt] = useState('');
  const down = isDown(c);
  const apply = (forceHeal) => {
    const raw = amt.trim(); if (!raw) return;
    const n = Math.abs(parseInt(raw.replace(/[^\d-]/g, ''), 10)); if (!n) return;
    damage(c, (forceHeal ?? (heal || raw.startsWith('+'))) ? -n : n);
    setAmt('');
  };
  const pct = c.maxHp ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
  const descOf = (name) => S.conditions.find((k) => k.name === name)?.description || '';
  return html`<div class="crow ${active ? 'active' : ''} ${down ? 'down' : ''} ${selected ? 'sel' : ''} ${c.hidden ? 'hiddenrow' : ''} ${c.kind}" onClick=${onSelect}>
    <div class="turn">${active ? '▶' : ''}</div>
    <input class="init" type="number" value=${c.init ?? ''} placeholder="—" title="Initiative" onClick=${(e) => e.stopPropagation()}
      onInput=${(e) => { c.init = num(e.target.value); touch(); }} />
    <div class="who">
      <input class="cname" value=${c.name} onClick=${(e) => e.stopPropagation()} onInput=${(e) => { c.name = e.target.value; touch(); }} />
      <div class="chips">
        ${c.kind === 'pc' ? html`<span class="chip pc">PC</span>` : ''}
        ${c.hidden ? html`<span class="chip hid" title="Only you can see this combatant. It is left out of the player view.">Hidden from players</span>` : ''}
        ${down ? html`<span class="chip dead">0 HP</span>` : c.maxHp && c.hp <= c.maxHp / 2 ? html`<span class="chip blood">Bloodied</span>` : ''}
        ${c.conc ? html`<span class="chip conc" title="Concentrating — click to end" onClick=${(e) => { e.stopPropagation(); c.conc = false; touch(); }}>Concentrating</span>` : ''}
        ${Object.entries(c.cond).map(([k, v]) => html`<span class="chip cond" title="${descOf(k)}\n\nClick to remove"
          onClick=${(e) => { e.stopPropagation(); delete c.cond[k]; touch(); }}>${condLabel(k, v)}</span>`)}
        <${TimerChips} combatantId=${c.id} />
      </div>
    </div>
    <label class="ac" title="Armor Class" onClick=${(e) => e.stopPropagation()}><small>AC</small>
      <input type="number" value=${c.ac ?? ''} placeholder="—" onInput=${(e) => { c.ac = num(e.target.value); touch(); }} /></label>
    <div class="hp" onClick=${(e) => e.stopPropagation()}>
      <div class="hpnums"><input type="number" value=${c.maxHp ? c.hp : ''} placeholder="—" title="Current HP"
          onInput=${(e) => { c.hp = Math.max(0, num(e.target.value) ?? 0); if (!c.maxHp) c.maxHp = c.hp; touch(); }} />
        <span>/</span><input type="number" value=${c.maxHp || ''} placeholder="HP" title="Max HP"
          onInput=${(e) => { const had = c.maxHp; c.maxHp = Math.max(0, num(e.target.value) ?? 0); if (!had) c.hp = c.maxHp; touch(); }} /></div>
      <div class="bar"><i style="width:${pct}%" class=${pct <= 50 ? (pct <= 25 ? 'low' : 'mid') : ''}></i></div>
    </div>
    <div class="dmg ${heal ? 'healing' : ''}" onClick=${(e) => e.stopPropagation()}>
      <input value=${amt} placeholder=${heal ? 'heal' : 'dmg'} title="Type an amount and press Enter to apply damage. +5 or the + button heals. Keys: D = damage, H = heal for the selected combatant." disabled=${!c.maxHp}
        onInput=${(e) => setAmt(e.target.value)} onBlur=${endHeal}
        onKeyDown=${(e) => { if (e.key === 'Enter') { apply(); e.target.blur(); } else if (e.key === 'Escape') { setAmt(''); e.target.blur(); } }} />
      <button title="Apply damage" disabled=${!c.maxHp} onClick=${() => apply(false)}>−</button>
      <button title="Heal" disabled=${!c.maxHp} onClick=${() => apply(true)}>+</button>
    </div>
    <div class="btns" onClick=${(e) => e.stopPropagation()}>
      <button class="tog ${c.conc ? 'on' : ''}" title="Concentration" onClick=${() => { c.conc = !c.conc; touch(); }}>C</button>
      <button class="tog ${c.hidden ? 'on' : ''}" title=${c.hidden ? 'Hidden from the player view — click to show' : 'Visible in the player view — click to hide'} onClick=${() => { c.hidden = !c.hidden; touch(); }}>${c.hidden ? '🚫' : '👁'}</button>
      <span class="condwrap"><button title="Conditions, saves and visibility (C)" onClick=${() => setMenu(menuOpen ? null : c.id)}>☰</button>${menuOpen ? html`<${RowMenu} c=${c} close=${() => setMenu(null)} />` : ''}</span>
      <button class="x" title="Remove from combat" onClick=${() => withUndo(`Removed ${c.name} from combat.`, () => removeCombatant(c.id))}>×</button>
    </div>
  </div>`;
}

function Adhoc() {
  const blank = { name: '', init: '', hp: '', ac: '', pc: true };
  const [f, setF] = useState(blank);
  const first = useRef();
  const add = () => { if (!f.name.trim()) return; addAdhoc({ name: f.name.trim(), init: num(f.init), hp: num(f.hp), ac: num(f.ac), pc: f.pc }); setF({ ...blank, pc: f.pc }); first.current?.focus(); };
  const inp = (k, ph, type = 'number', ref) => html`<input ref=${ref} class=${'a' + k} type=${type} placeholder=${ph} value=${f[k]}
    onInput=${(e) => setF({ ...f, [k]: e.target.value })} onKeyDown=${(e) => { if (e.key === 'Enter') add(); }} />`;
  return html`<div class="adhoc">${inp('name', 'Quick add: name', 'text', first)}${inp('init', 'Init')}${inp('hp', 'HP')}${inp('ac', 'AC')}
    <label class="check" title="Player characters stay when combat ends"><input type="checkbox" checked=${f.pc} onChange=${(e) => setF({ ...f, pc: e.target.checked })} /> PC</label>
    <button onClick=${add}>Add</button></div>`;
}

// ---------------------------------------------------------------- player view controls
export async function popOutPlayer(displayId) { pushPublic(); await call('playerOpen', displayId ?? null); }
function PlayerMenu() {
  const [open, setOpen] = useState(false);
  const [displays, setDisplays] = useState([]);
  const t = tracker();
  const p = S.player || { open: false, theme: 'auto' };
  useEffect(() => { if (open) call('displays').then(setDisplays); }, [open]);
  return html`<span class="condwrap">
    <button class=${p.open ? 'on' : ''} onClick=${() => setOpen(!open)} title="Player-facing window for a second monitor, projector or shared screen">🖥 Player view</button>
    ${open ? html`<div class="pvmenu" onMouseLeave=${() => setOpen(false)}>
      ${p.open ? html`<button class="block" onClick=${() => call('playerClose')}>Close player view</button>`
        : html`<button class="primary block" onClick=${() => popOutPlayer()}>Pop out player view</button>`}
      ${displays.length > 1 ? html`<div class="cmhead">Send to display…</div>${displays.map((d) => html`<button class="block" onClick=${() => popOutPlayer(d.id)}>${d.label}</button>`)}` : ''}
      <div class="cmhead">What players see</div>
      <label class="check"><input type="checkbox" checked=${t.showHealth} onChange=${(e) => { t.showHealth = e.target.checked; touch(); }} /> Health as Healthy / Bloodied / Near death</label>
      <div class="muted small">Never shown: HP numbers, stat blocks, your notes, or anyone marked Hidden.</div>
      <div class="cmhead">Theme</div>
      <div class="seg">${[['auto', 'System'], ['dark', 'Dark'], ['light', 'Light']].map(([k, l]) => html`<button class=${p.theme === k ? 'on' : ''} onClick=${() => call('playerTheme', k)}>${l}</button>`)}</div>
    </div>` : ''}
  </span>`;
}

// ---------------------------------------------------------------- end of combat
function EndCombat({ close }) {
  const [notes, setNotes] = useState(''); const [save, setSave] = useState(true); const [clear, setClear] = useState(true);
  const box = useRef();
  useEffect(() => { box.current?.focus(); }, []);
  const done = async () => {
    if (save) { await saveOutcome(notes); toast('Outcome saved to the session log.'); }
    if (clear) resetCombat(true);
    close();
  };
  return html`<div class="overlay" onMouseDown=${(e) => { if (e.target === e.currentTarget) close(); }}>
    <div class="modal"><h3>End combat</h3>
      <textarea ref=${box} rows="3" placeholder="Anything worth remembering? (optional)" value=${notes} onInput=${(e) => setNotes(e.target.value)}></textarea>
      <label class="check"><input type="checkbox" checked=${save} onChange=${(e) => setSave(e.target.checked)} /> Save who's standing, who's down and these notes to the session log</label>
      <label class="check"><input type="checkbox" checked=${clear} onChange=${(e) => setClear(e.target.checked)} /> Clear monsters and NPCs from the tracker (the party stays)</label>
      <div class="mbtns"><button onClick=${close}>Cancel</button><button class="primary" onClick=${done}>End combat</button></div>
    </div></div>`;
}

// ---------------------------------------------------------------- screen
export function TrackerScreen() {
  const t = tracker();
  const list = order(t);
  const [sel, setSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [menu, setMenu] = useState(null);
  const [heal, setHeal] = useState(false);
  const [ending, setEnding] = useState(false);
  const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  const plain = (e) => !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey && !ending && !document.querySelector('.overlay');

  const shown = list.find((c) => c.id === sel) || list.find((c) => c.id === t.turn) || null;
  const menuFor = list.find((c) => c.id === menu);
  const focusDmg = (isHeal) => { if (!shown?.maxHp) return toast(shown ? `${shown.name} has no HP to track.` : 'Select a combatant first.'); setHeal(isHeal); setTimeout(() => document.querySelector('.crow.sel .dmg input')?.focus(), 0); };
  const moveSel = (dn) => { const i = list.findIndex((c) => c.id === shown?.id); const n = list[Math.max(0, Math.min(list.length - 1, i + dn))]; if (n) setSel(n.id); };

  // While a conditions menu is open, its keys take priority.
  useHotkey((e) => plain(e) && menuFor && (e.key === 'Escape' || KEYS.includes(e.key.toLowerCase())), (e) => {
    if (e.key === 'Escape') return setMenu(null);
    const k = S.conditions[KEYS.indexOf(e.key.toLowerCase())]; if (k) toggleCond(menuFor, k);
  });
  useHotkey((e) => plain(e) && !menuFor && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'n'), () => { step(1); setSel(null); });
  useHotkey((e) => plain(e) && !menuFor && (e.key === 'ArrowLeft' || e.key === 'p'), () => { step(-1); setSel(null); });
  useHotkey((e) => plain(e) && !menuFor && e.key === 'ArrowDown', () => moveSel(1));
  useHotkey((e) => plain(e) && !menuFor && e.key === 'ArrowUp', () => moveSel(-1));
  useHotkey((e) => plain(e) && !menuFor && e.key === 'd', () => focusDmg(false));
  useHotkey((e) => plain(e) && !menuFor && e.key === 'h', () => focusDmg(true));
  useHotkey((e) => plain(e) && !menuFor && e.key === 'c', () => shown && setMenu(shown.id));
  useHotkey((e) => plain(e) && !menuFor && e.key === 'v', () => { if (shown) { shown.hidden = !shown.hidden; touch(); } });

  const block = shown && byId('monster', shown.monsterId);
  const npc = shown && byId('npc', shown.npcId);
  const options = [
    ...S.c.encounter.map((e) => ({ kind: 'encounter', id: e.id, label: e.name || '(unnamed encounter)', sub: 'Encounter' })),
    ...S.c.npc.map((n) => ({ kind: 'npc', id: n.id, label: label(n), sub: 'NPC' })),
    ...S.monsters.map((m) => ({ kind: 'monster', id: m.id, label: m.name, sub: `CR ${m.cr || '—'} · ${m.source === 'SRD' ? 'SRD' : 'Mine'}` })),
  ];
  const pick = (o) => {
    if (o.kind === 'monster') addMonster(byId('monster', o.id), qty);
    else if (o.kind === 'npc') addNpc(byId('npc', o.id));
    else addEncounter(byId('encounter', o.id));
    setQty(1);
  };

  // Turn reminder: only appears when the active combatant has something to remember.
  const act = list.find((c) => c.id === t.turn);
  const actTimers = act ? timersFor(act.id) : [];
  const remind = act && !t.reminderOff && (Object.keys(act.cond).length || act.conc || actTimers.length);
  const cp = t.concPrompt;

  return html`<div class="tracker">
    <div class="tmain">
      <div class="tbar">
        <div class="round">Round <b>${t.round}</b></div>
        <button onClick=${() => { step(-1); setSel(null); }} title="Previous turn (← or P)">◀</button>
        <button class="primary big" onClick=${() => { step(1); setSel(null); }} title="Next turn (Space, → or N)">Next turn ▶</button>
        <span class="spacer"></span>
        <button onClick=${rollAll} title="Roll initiative for every monster and NPC (PCs keep what you typed)">🎲 Roll init</button>
        <button onClick=${() => addParty()} title="Load this campaign's saved party">+ Party</button>
        <${PlayerMenu} />
        <button onClick=${() => setEnding(true)} disabled=${!list.length} title="Save the outcome to the session log and clear the monsters">End combat…</button>
        <button class="danger ghost" onClick=${() => { withUndo('Cleared the tracker.', () => resetCombat(false)); setSel(null); }} disabled=${!list.length} title="Remove everyone from the tracker">Clear</button>
      </div>
      <div class="addbar">
        <input class="qtyin" type="number" min="1" max="50" value=${qty} title="How many (monsters)" onInput=${(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
        <${Picker} cls="grow" keepOpen options=${options} placeholder="Add from library: monster, NPC or prepped encounter…" onPick=${pick} />
        <${Adhoc} />
      </div>
      ${remind ? html`<div class="banner turnb"><b>${act.name}'s turn</b>
        ${Object.entries(act.cond).map(([k, v]) => html`<span class="chip cond" title=${S.conditions.find((x) => x.name === k)?.description || ''}>${condLabel(k, v)}</span>`)}
        ${act.conc ? html`<span class="chip conc">Concentrating</span>` : ''}
        ${actTimers.map((x) => html`<span class="chip timerchip ${expired(x) ? 'expired' : ''}">⏳ ${x.label}: ${expired(x) ? 'EXPIRED' : fmt(x)}</span>`)}
        <span class="spacer"></span><button class="x" title="Dismiss" onClick=${() => { t.reminderOff = true; touch(); }}>×</button></div>` : ''}
      ${cp ? html`<div class="banner concb"><b>${cp.name}</b> ${cp.dropped ? 'dropped to 0 HP while concentrating — concentration ends.' : html`took damage while concentrating — Constitution save <b>DC ${cp.dc}</b>.`}
        <span class="spacer"></span>
        ${cp.dropped ? '' : html`<button onClick=${() => { const c = list.find((x) => x.id === cp.id); roll('1d20' + sign(c ? conSave(c) : 0), { label: `Concentration save (DC ${cp.dc})`, combatant: cp.name }); }}>Roll save</button>`}
        <button class="x" title="Dismiss" onClick=${() => { t.concPrompt = null; touch(); }}>×</button></div>` : ''}
      ${S.c.timer.some((x) => x.combatant_id == null) ? html`<div class="chipstrip">${S.c.timer.filter((x) => x.combatant_id == null).length ? html`<${TimerChips} combatantId=${null} />` : ''}</div>` : ''}
      <${LastRoll} />
      <div class="clist" onClick=${() => setMenu(null)}>
        ${list.map((c) => html`<${Row} key=${c.id} c=${c} active=${c.id === t.turn} selected=${shown?.id === c.id} onSelect=${() => setSel(c.id)}
          menuOpen=${menu === c.id} setMenu=${setMenu} heal=${heal && shown?.id === c.id} endHeal=${() => setHeal(false)} />`)}
        ${!list.length ? html`<${Empty}>No combatants yet. Add monsters, NPCs or a prepped encounter from the library, load your party, or quick-add by name.<//>` : ''}
      </div>
      <div class="keyhint">Space next · ← prev · ↑↓ select · D damage · H heal · C conditions · V hide · ? all shortcuts</div>
    </div>
    <div class="tside">
      ${block ? html`<${StatBlock} m=${block} who=${shown.name} />`
        : shown ? html`<div class="statblock"><div class="sbname">${shown.name}</div>
            <div class="sbsub">${npc ? [npc.description, npc.personality].filter(Boolean).join(' — ') || 'NPC — no stat block linked.' : shown.kind === 'pc' ? 'Player character' : 'No stat block.'}</div></div>`
        : html`<${Empty}>The selected combatant's stat block shows here. Pin spells, rules and stat blocks from the lookup to keep them below.<//>`}
      ${pins().map((p) => { const e = byId(p.t, p.id); return html`<details class="pin" open key=${p.t + p.id}>
        <summary>📌 ${e.name}<button class="x" title="Unpin" onClick=${(ev) => { ev.preventDefault(); togglePin(p.t, p.id); }}>×</button></summary>
        ${p.t === 'monster' ? html`<${StatBlock} m=${e} />` : html`<${EntryView} t=${p.t} e=${e} q="" compact />`}</details>`; })}
    </div>
    ${ending ? html`<${EndCombat} close=${() => setEnding(false)} />` : ''}
  </div>`;
}
