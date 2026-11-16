// Monster library: 2024-format stat block, homebrew editor, and the library screen.
import { html, useState, S, byId, create, edit, del, go, sign, mod, crNum, nameScore, md, esc, XP_BY_CR, isPinned, togglePin } from './lib.js';
import { roll } from './dice.js';
import { Field, TwoPane, Empty } from './components.js';
import { addMonster } from './combat.js';
import { Picture } from './soundboard.js';

const XP = XP_BY_CR;
const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SECTIONS = [['traits', 'Traits'], ['actions', 'Actions'], ['bonus_actions', 'Bonus Actions'], ['reactions', 'Reactions'], ['legendary_actions', 'Legendary Actions']];

// Make the numbers in an action clickable: "Attack Roll: +4" rolls d20+4, "5 (1d6 + 2)" rolls the damage.
function rollable(h, name) {
  const n = esc(name);
  return h
    .replace(/(Attack Roll:\s*)([+-]\d+)/g, (_m, a, b) => `${a}<a class="roll" data-roll="1d20${b}" data-label="${n} attack" title="Roll the attack">${b}</a>`)
    .replace(/(\d+)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/g, (_m, avg, ex) => `${avg} (<a class="roll" data-roll="${ex}" data-label="${n}" title="Roll it">${ex}</a>)`);
}

// `who` is the combatant the block is being shown for, so rolls made from it are logged against them.
export function StatBlock({ m, who }) {
  const d = m.data || {};
  const cr = m.cr || d.cr || '';
  const pb = 2 + Math.max(0, Math.floor((crNum(cr) - 1) / 4));
  const init = m.init_bonus ?? 0;
  const line = (k, v) => (v ? html`<div class="sbl"><b>${k}</b> ${v}</div>` : '');
  const R = (expr, label, text) => html`<a class="roll" data-roll=${expr} data-label=${label} title="Roll ${label}">${text}</a>`;
  const onClick = (e) => { const a = e.target.closest('[data-roll]'); if (a) roll(a.dataset.roll, { label: a.dataset.label, combatant: who || m.name }); };
  return html`<div class="statblock" onClick=${onClick}>
    <div class="sbname">${m.name} <span class="src ${m.source === 'SRD' ? 'srd' : 'mine'}">${m.source === 'SRD' ? 'SRD' : 'Mine'}</span></div>
    <div class="sbsub">${[d.size, m.type || d.type].filter(Boolean).join(' ')}${d.alignment ? ', ' + d.alignment : ''}</div>
    <div class="sbcore">
      <span><b>AC</b> ${m.ac ?? '—'}</span><span><b>Initiative</b> ${R('1d20' + sign(init), 'Initiative', sign(init))} (${10 + init})</span>
      <span><b>HP</b> ${m.hp ?? '—'}${d.hit_dice ? html` (${R(d.hit_dice, 'Hit points', d.hit_dice)})` : ''}</span><span><b>Speed</b> ${d.speed || '—'}</span>
    </div>
    <table class="abil"><tr>${AB.map((a) => html`<th>${a.toUpperCase()}</th>`)}</tr>
      <tr>${AB.map((a) => html`<td>${d.abilities?.[a] ?? 10}</td>`)}</tr>
      <tr class="lbl">${AB.map((a) => html`<td>${R('1d20' + sign(mod(d.abilities?.[a])), a.toUpperCase() + ' check', 'mod ' + sign(mod(d.abilities?.[a])))}</td>`)}</tr>
      ${d.saves ? html`<tr class="lbl">${AB.map((a) => html`<td class=${d.saves[a] !== mod(d.abilities?.[a]) ? 'prof' : ''}>${R('1d20' + sign(d.saves[a] ?? mod(d.abilities?.[a])), a.toUpperCase() + ' save', 'save ' + sign(d.saves[a] ?? mod(d.abilities?.[a])))}</td>`)}</tr>` : ''}
    </table>
    ${line('Saving Throws', d.saves_text)}${line('Skills', d.skills)}${line('Vulnerabilities', d.vulnerabilities)}${line('Resistances', d.resistances)}
    ${line('Immunities', d.immunities)}${line('Senses', d.senses)}${line('Languages', d.languages)}
    ${line('CR', cr !== '' ? `${cr} (XP ${(XP[cr] ?? 0).toLocaleString()}; PB ${sign(pb)})` : '')}
    ${SECTIONS.map(([k, title]) => (d[k]?.length ? html`<div class="sbsec"><h4>${title}</h4>
      ${d[k].map((a) => html`<div class="sba md" dangerouslySetInnerHTML=${{ __html: rollable(md(`***${a.name}.*** ${a.desc}`), a.name) }} />`)}</div>` : ''))}
  </div>`;
}

export const Pin = ({ t, id }) => html`<button class=${isPinned(t, id) ? 'on' : ''} title="Keep this visible beside the initiative tracker" onClick=${() => togglePin(t, id)}>📌 ${isPinned(t, id) ? 'Pinned' : 'Pin'}</button>`;

export async function newHomebrew(name) {
  const m = await create('monster', { name, cr: '', type: '', ac: 10, hp: 10, init_bonus: 0, data: { name, size: 'Medium', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, traits: [], actions: [], bonus_actions: [], reactions: [], legendary_actions: [] } });
  go('monster', m.id, { editing: true });
  return m;
}

// Stat block sections are edited as plain text: one entry per paragraph, "Name. Description".
const toText = (arr) => (arr || []).map((a) => `${a.name}. ${a.desc}`).join('\n\n');
function fromText(text) {
  const out = [];
  for (const chunk of text.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean)) {
    const m = chunk.match(/^([A-Z0-9][^.\n]{0,70}?(?:\([^)]*\))?)\.\s+([\s\S]+)$/);
    if (m) out.push({ name: m[1], desc: m[2] });
    else if (out.length) out[out.length - 1].desc += '\n\n' + chunk;
    else out.push({ name: chunk.replace(/\.$/, ''), desc: '' });
  }
  return out;
}
const savesText = (d) => d.saves_text ?? (d.saves ? AB.filter((a) => d.saves[a] !== mod(d.abilities?.[a])).map((a) => `${a[0].toUpperCase() + a.slice(1)} ${sign(d.saves[a])}`).join(', ') : '');

function MonsterEditor({ m }) {
  const d = m.data || {};
  const [drafts, setDrafts] = useState(() => Object.fromEntries(SECTIONS.map(([k]) => [k, toText(d[k])])));
  const top = ['name', 'cr', 'type', 'ac', 'hp', 'init_bonus'];
  const set = (k, v) => edit('monster', m, { data: { ...m.data, [k]: v }, ...(top.includes(k) ? { [k]: v } : {}) });
  const T = (k, ph) => html`<input value=${(top.includes(k) ? m[k] : d[k]) ?? ''} placeholder=${ph} onInput=${(e) => set(k, e.target.value)} />`;
  const N = (k) => html`<input type="number" value=${m[k] ?? ''} onInput=${(e) => set(k, e.target.value === '' ? null : Number(e.target.value))} />`;
  return html`<div class="form">
    <div class="grid four">
      <${Field} label="Name" wide>${T('name')}<//>
      <${Field} label="Size">${T('size', 'Medium')}<//><${Field} label="Type">${T('type', 'Humanoid')}<//>
      <${Field} label="Alignment">${T('alignment', 'Neutral')}<//><${Field} label="CR">${T('cr', '1/2')}<//>
      <${Field} label="AC">${N('ac')}<//><${Field} label="HP">${N('hp')}<//>
      <${Field} label="Hit dice">${T('hit_dice', '4d8 + 4')}<//><${Field} label="Initiative bonus">${N('init_bonus')}<//>
      <${Field} label="Speed" wide>${T('speed', '30 ft., Fly 60 ft.')}<//>
    </div>
    <div class="grid six">${AB.map((a) => html`<${Field} label=${a.toUpperCase()}><input type="number" value=${d.abilities?.[a] ?? 10}
      onInput=${(e) => set('abilities', { ...(d.abilities || {}), [a]: Number(e.target.value) || 10 })} /><//>`)}</div>
    <div class="grid">
      <${Field} label="Saving throws" hint="only the proficient ones"><input value=${savesText(d)} placeholder="Dex +5, Wis +3"
        onInput=${(e) => edit('monster', m, { data: { ...m.data, saves: undefined, saves_text: e.target.value } })} /><//>
      <${Field} label="Skills">${T('skills', 'Perception +4, Stealth +6')}<//>
      <${Field} label="Vulnerabilities">${T('vulnerabilities')}<//><${Field} label="Resistances">${T('resistances')}<//>
      <${Field} label="Immunities">${T('immunities', 'Poison; Poisoned')}<//><${Field} label="Senses">${T('senses', 'Darkvision 60 ft.; Passive Perception 12')}<//>
      <${Field} label="Languages" wide>${T('languages', 'Common')}<//>
      ${SECTIONS.map(([k, title]) => html`<${Field} label=${title} hint="one per paragraph: Name. What it does." wide>
        <textarea rows=${k === 'actions' ? 6 : 3} value=${drafts[k]} placeholder="Bite. Melee Attack Roll: +5, reach 5 ft. 7 (1d8 + 3) Piercing damage."
          onInput=${(e) => { setDrafts({ ...drafts, [k]: e.target.value }); set(k, fromText(e.target.value)); }}></textarea><//>`)}
    </div>
  </div>`;
}

export async function duplicateMonster(m) {
  const copy = await create('monster', { name: m.name + ' (copy)', cr: m.cr, type: m.type, ac: m.ac, hp: m.hp, init_bonus: m.init_bonus, data: { ...m.data, name: m.name + ' (copy)' } });
  go('monster', copy.id, { editing: true });
}

export function MonsterActions({ m }) {
  const [qty, setQty] = useState(1);
  return html`<span class="mact">
    <input class="qtyin" type="number" min="1" max="50" value=${qty} onInput=${(e) => setQty(Math.max(1, Number(e.target.value) || 1))} title="How many" />
    <button class="primary" onClick=${() => addMonster(m, qty)}>⚔ Add to initiative</button>
  </span>`;
}

const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

export function MonsterScreen() {
  const [q, setQ] = useState(''); const [src, setSrc] = useState('all');
  const [type, setType] = useState(''); const [lo, setLo] = useState(''); const [hi, setHi] = useState('');
  const cur = byId('monster', S.route.id);
  const editing = cur && cur.source !== 'SRD' && S.route.editing;
  const ql = q.trim().toLowerCase();
  const types = [...new Set(S.monsters.map((m) => m.type).filter(Boolean))].sort();
  const rows = S.monsters.filter((m) => (src === 'all' || (src === 'srd') === (m.source === 'SRD'))
      && (!type || m.type === type) && (lo === '' || crNum(m.cr) >= crNum(lo)) && (hi === '' || crNum(m.cr) <= crNum(hi)))
    .map((m) => ({ m, s: !ql ? 1 : Math.max(nameScore(m._n, ql), (m.type || '').toLowerCase().includes(ql) ? 20 : 0) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.m.name.localeCompare(b.m.name)).slice(0, 400).map((x) => x.m);
  const add = (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const name = e.target.value.trim(); e.target.value = '';
    newHomebrew(name);
  };
  const crSel = (v, set, any) => html`<select value=${v} onChange=${(e) => set(e.target.value)}><option value="">${any}</option>${CRS.map((c) => html`<option value=${c}>CR ${c}</option>`)}</select>`;
  return html`<${TwoPane}
    list=${html`
      <input class="quickadd" placeholder="+ New homebrew monster — name, Enter" onKeyDown=${add} />
      <input class="filter" placeholder="Search by name or type" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="pair filters">${crSel(lo, setLo, 'CR from')}${crSel(hi, setHi, 'CR to')}</div>
      <div class="pair filters">
        <select value=${type} onChange=${(e) => setType(e.target.value)}><option value="">Any type</option>${types.map((t) => html`<option value=${t}>${t}</option>`)}</select>
        <div class="seg">${[['all', 'All'], ['srd', 'SRD'], ['mine', 'Mine']].map(([k, l]) => html`<button class=${src === k ? 'on' : ''} onClick=${() => setSrc(k)}>${l}</button>`)}</div>
      </div>
      <div class="rows">
        ${rows.map((m) => html`<div key=${m.id} class="row ${cur?.id === m.id ? 'on' : ''}" onClick=${() => go('monster', m.id)}>
          <div class="rname">${m.name} ${m.source !== 'SRD' ? html`<span class="src mine">Mine</span>` : ''}</div>
          <div class="rsub">CR ${m.cr || '—'} · ${m.type || '—'}</div></div>`)}
        ${!rows.length ? html`<${Empty}>Nothing in the library matches.
          ${q.trim() ? html`<div class="gapadd"><button class="primary" onClick=${() => { newHomebrew(q.trim()); setQ(''); }}>+ Add “${q.trim()}” as a homebrew monster</button>
            <div class="muted">The built-in library is SRD 5.2 only. If it's from one of your books, add your own version.</div></div>` : ''}<//>` : ''}
      </div>`}
    detail=${cur ? html`<div class="form">
        <div class="dhead">
          <${MonsterActions} m=${cur} /><${Pin} t="monster" id=${cur.id} />
          <span class="spacer"></span>
          ${cur.source !== 'SRD' ? html`<button onClick=${() => go('monster', cur.id, { editing: !editing })}>${editing ? '✓ Done editing' : '✎ Edit'}</button>` : ''}
          <button onClick=${() => duplicateMonster(cur)} title="Make your own editable copy to rename and tweak">Duplicate</button>
          ${cur.source !== 'SRD' ? html`<button class="danger ghost" onClick=${async () => { if (await del('monster', cur)) go('monster', null); }}>Delete</button>` : ''}
        </div>
        <${Picture} key=${'p' + cur.id} type="monster" id=${cur.id} />
        ${editing ? html`<${MonsterEditor} key=${cur.id} m=${cur} />` : html`<${StatBlock} m=${cur} />`}
      </div>` : html`<${Empty}>Pick a monster to see its stat block, or create your own.<//>`} />`;
}
