// Rules, spell, item and monster lookup. Everything is already in memory, so search is a plain scan per keystroke.
import { html, useState, useRef, useEffect, S, byId, create, edit, del, go, notify, nameScore, md, esc } from './lib.js';
import { Field, Empty } from './components.js';
import { StatBlock, MonsterActions } from './monsters.js';

// SRD 5.2 leaves some 2024 content out on purpose. When a search hits one of these names,
// say so instead of showing an empty list. Not exhaustive — add names as they come up.
const EXCLUDED = [
  { where: 'Monster Manual', names: ['beholder', 'mind flayer', 'illithid', 'displacer beast', 'carrion crawler', 'umber hulk', 'yuan-ti', 'githyanki', 'githzerai', 'kuo-toa', 'slaad', 'hook horror', 'intellect devourer', 'nothic', 'flumph', 'thri-kreen', 'death knight', 'demilich', 'dracolich', 'flameskull', 'revenant', 'shadow dragon', 'faerie dragon', 'peryton', 'myconid', 'modron', 'banshee', 'bullywug', 'galeb duhr', 'grell', 'helmed horror', 'jackalwere', 'yeti', 'empyrean', 'fomorian', 'cambion', 'piercer', 'quaggoth', 'scarecrow', 'water weird', 'aarakocra', 'spectator', 'death tyrant'] },
  { where: 'Player\'s Handbook', names: ['aasimar', 'chaos bolt', 'armor of agathys', 'arms of hadar', 'hunger of hadar', 'witch bolt', 'crown of madness', 'cloud of daggers', 'toll the dead', 'mind sliver', 'blade ward', 'thorn whip', 'word of radiance', 'hail of thorns', 'thunderous smite', 'wrathful smite', 'blinding smite', 'staggering smite', 'banishing smite', 'compelled duel', 'aura of vitality', 'conjure barrage', 'conjure volley', 'steel wind strike', 'swift quiver', 'destructive wave', 'circle of power', 'elemental weapon', 'lightning arrow', 'cordon of arrows', 'grasping vine', 'summon beast', 'summon fey', 'synaptic static', 'crusader\'s mantle', 'power word fortify', 'fount of moonlight', 'battle master', 'eldritch knight', 'arcane trickster', 'assassin subclass', 'wild magic', 'great old one', 'archfey'] },
  { where: 'adventure or sourcebook it comes from', names: ['artificer', 'strahd', 'orcus', 'demogorgon', 'tiamat', 'vecna', 'acererak', 'silvery barbs', 'booming blade', 'absorb elements'] },
];
// Spells named after famous wizards appear in the SRD under generic names.
const NAMED = /^(tasha|bigby|mordenkainen|melf|tenser|otiluke|leomund|evard|rary|drawmij|nystul|otto|aganazzar|snilloc|jallarzi|yolande)('s|s)?\s*/i;

function excludedHit(q) {
  if (q.length < 4) return null;
  for (const g of EXCLUDED) for (const n of g.names) if (n.startsWith(q) || q.includes(n)) return { name: n, where: g.where };
  return null;
}

const TYPES = [['all', 'All'], ['spell', 'Spells'], ['rule', 'Rules'], ['item', 'Items'], ['monster', 'Monsters']];
const POOL = { spell: 'spells', rule: 'rules', item: 'items', monster: 'monsters' };
const ui = { q: '', type: 'all', src: 'all', sel: null, editing: false };   // survives switching screens

const levelLine = (e) => (e.level ? `Level ${e.level} ${e.school}` : `${e.school} Cantrip`);
function meta(type, e) {
  if (type === 'spell') return levelLine(e) + (e.data.concentration ? ' · Conc.' : '') + (e.data.ritual ? ' · Ritual' : '');
  if (type === 'rule') return [e.category, e.section].filter(Boolean).join(' · ');
  if (type === 'item') return [e.category, e.rarity].filter(Boolean).join(' · ');
  return `Monster · CR ${e.cr || '—'} · ${e.type}`;
}

function search(q, type, src) {
  const words = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of Object.keys(POOL)) {
    if (type !== 'all' && type !== t) continue;
    for (const e of S[POOL[t]]) {
      if (src !== 'all' && (src === 'srd') !== (e.source === 'SRD')) continue;
      let s = nameScore(e._n, q);
      if (!s && q && words.every((w) => e._n.includes(w))) s = 30;
      if (!s && q.length >= 3 && words.every((w) => e._t.includes(w))) s = 10;
      if (!q) s = 1;
      if (s) out.push({ t, e, s: s + (t === 'rule' && e.category === 'Glossary' ? 2 : 0) + (e.source !== 'SRD' ? 1 : 0) });
    }
  }
  out.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
  return out;
}

// Highlight the search words inside rendered text so the relevant line jumps out.
function Body({ text, q }) {
  let h = md(text);
  const words = q.split(/\s+/).filter((w) => w.length >= 3).map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length) {
    const re = new RegExp('(' + words.join('|') + ')', 'gi');
    h = h.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(re, '<mark>$1</mark>'))).join('');
  }
  return html`<div class="md" dangerouslySetInnerHTML=${{ __html: h }} />`;
}

const Src = ({ e }) => html`<span class="src ${e.source === 'SRD' ? 'srd' : 'mine'}">${e.source === 'SRD' ? 'SRD' : 'Mine'}</span>`;
const fact = (k, v) => (v ? html`<div class="fact"><small>${k}</small><div>${v}</div></div>` : '');

function View({ t, e, q }) {
  const d = e.data || {};
  if (t === 'monster') return html`<div class="lkhead"><${MonsterActions} m=${e} /><button onClick=${() => go('monster', e.id)}>Open in library</button></div><${StatBlock} m=${e} />`;
  return html`<div class="entry">
    <h2>${e.name} <${Src} e=${e} /></h2>
    <div class="sub">${meta(t, e)}${t === 'spell' && d.classes ? ` (${d.classes})` : ''}${t === 'item' && d.attunement ? ' · Requires Attunement' : ''}</div>
    ${t === 'spell' ? html`<div class="facts">${fact('Casting Time', d.casting_time)}${fact('Range', d.range)}${fact('Components', d.components)}${fact('Duration', d.duration)}</div>` : ''}
    ${t === 'item' && (d.cost || d.weight) ? html`<div class="facts">${fact('Cost', d.cost)}${fact('Weight', d.weight)}</div>` : ''}
    <${Body} text=${t === 'rule' ? e.body : d.description} q=${q} />
    ${t === 'spell' && d.higher_level ? html`<div class="higher"><b>${e.level ? 'Using a Higher-Level Spell Slot.' : 'Cantrip Upgrade.'}</b> <${Body} text=${d.higher_level} q=${q} /></div>` : ''}
  </div>`;
}

function Editor({ t, e }) {
  const d = e.data || {};
  const setD = (k, v) => edit(t, e, { data: { ...e.data, [k]: v } });
  const top = (k, ph, numeric) => html`<input type=${numeric ? 'number' : 'text'} value=${e[k] ?? ''} placeholder=${ph} onInput=${(ev) => edit(t, e, { [k]: numeric ? Number(ev.target.value) || 0 : ev.target.value })} />`;
  const dat = (k, ph) => html`<input value=${d[k] ?? ''} placeholder=${ph} onInput=${(ev) => setD(k, ev.target.value)} />`;
  const chk = (k, l) => html`<label class="check"><input type="checkbox" checked=${!!d[k]} onChange=${(ev) => setD(k, ev.target.checked)} /> ${l}</label>`;
  const area = (val, on, rows, ph) => html`<textarea rows=${rows} value=${val ?? ''} placeholder=${ph} onInput=${(ev) => on(ev.target.value)}></textarea>`;
  return html`<div class="form"><div class="grid four">
    <${Field} label="Name" wide>${top('name')}<//>
    ${t === 'spell' ? html`
      <${Field} label="Level" hint="0 = cantrip">${top('level', '', true)}<//><${Field} label="School">${top('school', 'Evocation')}<//>
      <${Field} label="Classes">${dat('classes', 'Sorcerer, Wizard')}<//><${Field} label="Casting time">${dat('casting_time', 'Action')}<//>
      <${Field} label="Range">${dat('range', '60 feet')}<//><${Field} label="Components">${dat('components', 'V, S')}<//>
      <${Field} label="Duration">${dat('duration', 'Instantaneous')}<//><${Field} label="Flags"><div class="checks">${chk('concentration', 'Concentration')}${chk('ritual', 'Ritual')}</div><//>
      <${Field} label="Description" wide>${area(d.description, (v) => setD('description', v), 9, 'What the spell does. **Bold** and blank lines between paragraphs work.')}<//>
      <${Field} label="At higher levels" wide>${area(d.higher_level, (v) => setD('higher_level', v), 2)}<//>` : ''}
    ${t === 'item' ? html`
      <${Field} label="Category">${top('category', 'Wondrous Item')}<//><${Field} label="Rarity">${top('rarity', 'Uncommon')}<//>
      <${Field} label="Cost">${dat('cost', '50 GP')}<//><${Field} label="Weight">${dat('weight', '1 lb.')}<//>
      <${Field} label="Flags" wide><div class="checks">${chk('attunement', 'Requires attunement')}</div><//>
      <${Field} label="Description" wide>${area(d.description, (v) => setD('description', v), 10, 'What it is and what it does.')}<//>` : ''}
    ${t === 'rule' ? html`
      <${Field} label="Category" wide>${top('category', 'House Rule')}<//>
      <${Field} label="Text" wide>${area(e.body, (v) => edit(t, e, { body: v }), 12, 'The ruling, in your own words.')}<//>` : ''}
  </div></div>`;
}

export function LookupScreen() {
  const [, force] = useState(0);
  const set = (p) => { Object.assign(ui, p); force((n) => n + 1); };
  const box = useRef();
  useEffect(() => { box.current?.focus(); box.current?.select(); }, [S.route.focus]);
  useEffect(() => { if (S.route.sel) { set({ sel: S.route.sel, editing: !!S.route.editing }); S.route.sel = null; } });

  const q = ui.q.trim().toLowerCase();
  const all = search(q, ui.type, ui.src);
  const res = all.slice(0, 80);
  const [st, sid] = (ui.sel || '').split(':');
  let cur = st ? byId(st, Number(sid)) : null; let ct = st;
  if (!cur && q && res.length) { cur = res[0].e; ct = res[0].t; }      // top hit shows without a click
  const idx = res.findIndex((r) => r.e === cur);
  const move = (dn) => { const r = res[Math.max(0, Math.min(res.length - 1, idx + dn))]; if (r) set({ sel: r.t + ':' + r.e.id, editing: false }); };
  const gap = q ? excludedHit(q) : null;
  const named = q.match(NAMED);
  const editing = cur && cur.source !== 'SRD' && ui.editing;

  const add = async (t) => {
    const name = ui.q.trim() || { spell: 'New spell', item: 'New item', rule: 'New house rule' }[t];
    const base = { spell: { name, level: 1, school: '', data: { description: '' } }, item: { name, category: '', rarity: '', data: { description: '' } }, rule: { name, category: 'House Rule', section: '', body: '' } }[t];
    const e = await create(t, base);
    set({ sel: t + ':' + e.id, editing: true, q: '' });
  };

  return html`<div class="lookup">
    <div class="lkbar">
      <input ref=${box} class="lksearch" placeholder="Search spells, rules, conditions, items, monsters…  (Ctrl+L from anywhere)" value=${ui.q}
        onInput=${(e) => set({ q: e.target.value, sel: null, editing: false })}
        onKeyDown=${(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); } else if (e.key === 'Escape') set({ q: '', sel: null }); }} />
      <div class="seg">${TYPES.map(([k, l]) => html`<button class=${ui.type === k ? 'on' : ''} onClick=${() => set({ type: k, sel: null })}>${l}</button>`)}</div>
      <div class="seg">${[['all', 'SRD + Mine'], ['srd', 'SRD'], ['mine', 'Mine']].map(([k, l]) => html`<button class=${ui.src === k ? 'on' : ''} onClick=${() => set({ src: k, sel: null })}>${l}</button>`)}</div>
      <span class="spacer"></span>
      <button onClick=${() => add('spell')}>+ Spell</button><button onClick=${() => add('item')}>+ Item</button><button onClick=${() => add('rule')}>+ House rule</button>
    </div>
    <div class="two">
      <div class="listpane">
        ${gap ? html`<div class="gap"><b>“${gap.name.replace(/\b\w/g, (c) => c.toUpperCase())}” isn't included in the open ruleset (SRD 5.2).</b> Check your ${gap.where}. You can add your own version with the + buttons above${ui.type === 'monster' || gap.where === 'Monster Manual' ? ' or as a homebrew monster' : ''}.</div>` : ''}
        ${named && !res.some((r) => r.s >= 40) ? html`<div class="gap"><b>Named spells appear in the SRD under generic names.</b> Try <a onClick=${() => set({ q: ui.q.replace(NAMED, ''), sel: null })}>“${ui.q.replace(NAMED, '')}”</a>.</div>` : ''}
        <div class="rows">
          ${res.map((r) => html`<div key=${r.t + r.e.id} class="row ${r.e === cur ? 'on' : ''}" onClick=${() => set({ sel: r.t + ':' + r.e.id, editing: false })}>
            <div class="rname">${r.e.name} ${r.e.source !== 'SRD' ? html`<${Src} e=${r.e} />` : ''}</div><div class="rsub">${meta(r.t, r.e)}</div></div>`)}
          ${!res.length && !gap ? html`<${Empty}>${q ? 'No matches in the SRD or your own entries.' : 'Start typing to search.'}<//>` : ''}
          ${all.length > res.length ? html`<div class="more">${all.length - res.length} more — keep typing to narrow it down</div>` : ''}
        </div>
      </div>
      <div class="detail">
        ${cur ? html`
          ${cur.source !== 'SRD' && ct !== 'monster' ? html`<div class="lkhead">
            <button onClick=${() => set({ sel: ct + ':' + cur.id, editing: !editing })}>${editing ? '✓ Done editing' : '✎ Edit'}</button>
            <button class="danger ghost" onClick=${async () => { if (await del(ct, cur)) set({ sel: null, editing: false }); }}>Delete</button></div>` : ''}
          ${editing ? html`<${Editor} key=${cur.id} t=${ct} e=${cur} />` : html`<${View} t=${ct} e=${cur} q=${q} />`}`
        : html`<${Empty}>Results show here. Arrow keys move through the list.<//>`}
      </div>
    </div>
  </div>`;
}
