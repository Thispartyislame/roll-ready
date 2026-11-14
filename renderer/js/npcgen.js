// Emergency NPC: a named, playable character in one keystroke, for when a player does something
// unexpected. Opens as an overlay with a complete result already rolled; everything else is optional.
//
// The result is a plain object of named fields (see FIELDS). A different source — Phase 3 may add
// an AI-written one — only has to return the same shape from generateNpc().
import { html, useState, useEffect, S, notify, setKv, create, go, toast, label } from './lib.js';
import { Select } from './components.js';
import { rollTable, appendNote } from './generators.js';

export const FIELDS = [['name', 'Name'], ['species', 'Species'], ['occupation', 'Who they are'], ['appearance', 'Looks'],
  ['mannerism', 'Voice'], ['want', 'Wants'], ['secret', 'Secret'], ['hook', 'Hook']];

// Filters are read from the tables themselves, so a table the GM adds with the right key prefix
// (enpc_occupation_…, enpc_hook_…, npc_name_…) shows up as a new option.
const optionsFor = (prefix) => S.genTables.filter((t) => t.key.startsWith(prefix) && t.entries.length)
  .map((t) => ({ id: t.key.slice(prefix.length), label: t.name.includes(':') ? t.name.split(':').slice(1).join(':').trim() : t.name }));
export const settings = () => optionsFor('enpc_occupation_');
export const attitudes = () => optionsFor('enpc_hook_');
export const styles = () => optionsFor('npc_name_');
const any = (list) => list[Math.floor(Math.random() * list.length)]?.id;

const prefs = () => ({ setting: '', attitude: '', style: '', species: true, ...(S.kv.enpcPrefs || {}) });

// Roll one field. `ctx` carries the setting/attitude/style actually used, so "surprise me" picks stay consistent.
function rollField(k, ctx, avoid) {
  if (k === 'name') return rollTable('npc_name_' + ctx.style, avoid);
  if (k === 'species') return prefs().species ? rollTable('enpc_species', avoid) : '';
  if (k === 'occupation') return rollTable('enpc_occupation_' + ctx.setting, avoid);
  if (k === 'hook') return rollTable('enpc_hook_' + ctx.attitude, avoid);
  return rollTable('enpc_' + k, avoid);
}

// Build an NPC. Locked fields are carried over from `prev`.
export function generateNpc(prev = null, locks = {}) {
  const p = prefs();
  const ctx = { setting: p.setting || any(settings()), attitude: p.attitude || any(attitudes()), style: p.style || any(styles()) };
  const npc = { id: Date.now() + Math.random(), ...ctx };
  for (const [k] of FIELDS) npc[k] = prev && locks[k] ? prev[k] : rollField(k, ctx, prev?.[k]);
  if (prev) for (const [k, dep] of [['occupation', 'setting'], ['hook', 'attitude'], ['name', 'style']]) if (locks[k]) npc[dep] = prev[dep];
  return npc;
}

const nameOf = (list, id) => list.find((x) => x.id === id)?.label || '';
export function npcText(n) {
  const who = [n.species, n.occupation].filter(Boolean).join(' — ');
  return [n.name + (who ? ` (${who})` : ''), n.appearance && 'Looks: ' + n.appearance, n.mannerism && 'Voice: ' + n.mannerism,
    n.want && 'Wants: ' + n.want, n.secret && 'Secret: ' + n.secret, n.hook && 'Hook: ' + n.hook].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- state
const ui = { open: false, locks: {}, saved: {} };       // saved: result id -> NPC id
const history = () => S.kv.enpcHistory || [];
const setHistory = (list) => setKv('enpcHistory', list.slice(0, 20));
const current = () => history()[0] || null;

export function rerollAll() { setHistory([generateNpc(current(), ui.locks), ...history()]); notify(); }
export function toggleEmergency(force) {
  ui.open = typeof force === 'boolean' ? force : !ui.open;
  if (ui.open) { ui.locks = {}; rerollAll(); }        // a complete result is on screen the moment it opens
  else notify();
}
function rerollField(k) {
  const cur = current(); if (!cur) return;
  const p = prefs();
  const ctx = { setting: p.setting || cur.setting, attitude: p.attitude || cur.attitude, style: p.style || cur.style };
  if (k === 'occupation' && !p.setting) ctx.setting = any(settings());
  if (k === 'hook' && !p.attitude) ctx.attitude = any(attitudes());
  if (k === 'name' && !p.style) ctx.style = any(styles());
  setHistory([{ ...cur, ...ctx, [k]: rollField(k, ctx, cur[k]) }, ...history().slice(1)]); notify();
}
// Changing a filter rerolls just the field it governs (unless that field is locked).
function setPref(k, v) {
  setKv('enpcPrefs', { ...prefs(), [k]: v });
  const field = { setting: 'occupation', attitude: 'hook', style: 'name', species: 'species' }[k];
  if (!ui.locks[field]) rerollField(field); else notify();
}

async function saveNpc(n, locationId, factionId) {
  const row = await create('npc', {
    name: n.name,
    description: [[n.species, n.occupation].filter(Boolean).join(' — '), n.appearance, n.want && 'Wants: ' + n.want, n.secret && 'Secret: ' + n.secret, n.hook && 'Hook: ' + n.hook]
      .filter(Boolean).map((s) => (/[.!?]$/.test(s) ? s : s + '.')).join('\n'),
    personality: [n.mannerism, nameOf(attitudes(), n.attitude) && 'Attitude: ' + nameOf(attitudes(), n.attitude).toLowerCase()].filter(Boolean).join('. ') + '.',
    tags: 'emergency', location_id: locationId || null, faction_ids: factionId ? [factionId] : [],
  });
  ui.saved[n.id] = row.id;
  toast(`${n.name} saved as an NPC, tagged “emergency”.`);
  notify();
  return row;
}

// ---------------------------------------------------------------- overlay
const Chips = ({ value, options, onPick }) => html`<span class="chipsel">
  <button class=${!value ? 'on' : ''} onClick=${() => onPick('')}>Surprise me</button>
  ${options.map((o) => html`<button class=${value === o.id ? 'on' : ''} onClick=${() => onPick(value === o.id ? '' : o.id)}>${o.label}</button>`)}</span>`;

export function EmergencyNpc() {
  const [loc, setLoc] = useState(''); const [fac, setFac] = useState('');
  useEffect(() => {
    if (!ui.open) return undefined;
    const h = (e) => {
      const typing = /TEXTAREA|SELECT/.test(e.target.tagName) || (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox');
      if (e.key === 'Escape') { e.preventDefault(); toggleEmergency(false); }
      else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); rerollAll(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [ui.open]);
  if (!ui.open) return '';
  const n = current(); const p = prefs();
  if (!n) return '';
  const savedId = ui.saved[n.id];
  const fields = FIELDS.filter(([k]) => k !== 'species' || p.species);
  const copy = () => navigator.clipboard.writeText(npcText(n)).then(() => toast('Copied.'));
  const toNotes = async () => {
    const body = savedId ? `⚡ Met @[${n.name}](npc:${savedId}): ${npcText(n).split('\n').slice(1).join(' · ')}` : `⚡ NPC — ${npcText(n).replace(/\n/g, ' · ')}`;
    await appendNote(body, savedId ? [savedId] : []);
    toast('Added to the live session\'s notes.');
  };
  const opts = (type) => [...S.c[type]].sort((a, b) => label(a).localeCompare(label(b))).map((e) => ({ id: e.id, label: label(e) }));
  return html`<div class="overlay" onMouseDown=${(e) => { if (e.target === e.currentTarget) toggleEmergency(false); }}>
    <div class="enpc">
      <div class="enpchead"><b>⚡ Emergency NPC</b><span class="muted">R rerolls everything unlocked · Esc closes</span>
        <button class="x" title="Close (Esc)" onClick=${() => toggleEmergency(false)}>×</button></div>
      <div class="enpcbody">
        <div class="enpcfields">
          ${fields.map(([k, l]) => html`<div class="ef ${k} ${ui.locks[k] ? 'locked' : ''}">
            <small>${l}</small><div class="eftext">${n[k] || '—'}</div>
            <button class="tog ${ui.locks[k] ? 'on' : ''}" title=${ui.locks[k] ? 'Locked — click to unlock' : 'Lock: keep this when rerolling'} onClick=${() => { ui.locks[k] = !ui.locks[k]; notify(); }}>${ui.locks[k] ? '🔒' : '🔓'}</button>
            <button title="Reroll just this" onClick=${() => rerollField(k)}>↻</button>
          </div>`)}
        </div>
        <div class="enpcacts">
          <button class="primary" onClick=${rerollAll} title="Reroll everything that isn't locked (R)">🎲 Reroll unlocked</button>
          <span class="spacer"></span>
          <button onClick=${copy}>Copy as text</button>
          <button onClick=${toNotes} title="Append to the live session's notes">→ Notes</button>
        </div>
        <div class="enpcsave">
          ${savedId ? html`<span>✓ Saved.</span><button onClick=${() => { toggleEmergency(false); go('npc', savedId); }}>Open ${n.name}</button>`
            : html`<button class="primary" onClick=${() => saveNpc(n, Number(loc) || null, Number(fac) || null)}>Save as NPC</button>
              <${Select} value=${loc} empty="No location" options=${opts('location')} onChange=${setLoc} />
              <${Select} value=${fac} empty="No faction" options=${opts('faction')} onChange=${setFac} />`}
        </div>
        <div class="enpcfilters">
          <div><small>Setting</small><${Chips} value=${p.setting} options=${settings()} onPick=${(v) => setPref('setting', v)} /></div>
          <div><small>Attitude</small><${Chips} value=${p.attitude} options=${attitudes()} onPick=${(v) => setPref('attitude', v)} /></div>
          <div><small>Names</small><${Chips} value=${p.style} options=${styles()} onPick=${(v) => setPref('style', v)} /></div>
          <div><small>Species</small><label class="check"><input type="checkbox" checked=${p.species} onChange=${(e) => setPref('species', e.target.checked)} /> Include a species (SRD 5.2 list; edit it under Generators)</label>
            <span class="spacer"></span><a onClick=${() => { toggleEmergency(false); go('generators', S.genTables.find((t) => t.key === 'enpc_occupation_city')?.id ?? null); }}>Edit the tables…</a></div>
        </div>
        ${history().length > 1 ? html`<div class="enpchist"><small>Recent</small>
          ${history().slice(1).map((h) => html`<div class="eh" title="Bring this one back" onClick=${() => { ui.locks = {}; setHistory([h, ...history().filter((x) => x !== h)]); notify(); }}>
            <b>${h.name}</b> <span class="muted">${h.occupation}</span>${ui.saved[h.id] ? html` <span class="tag">saved</span>` : ''}</div>`)}</div>` : ''}
      </div>
    </div>
  </div>`;
}
