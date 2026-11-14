// Table-driven generators. Every table lives in `gen_table` and is editable; the built-in ones are
// original content seeded from data/generators.json.
//
// Entry text is a template:  {key} rolls another table · {key x3} rolls three different entries ·
// {2d6} or {2d6*10} rolls dice.
import { html, useState, useEffect, S, byId, create, edit, del, go, toast, notify, call, today } from './lib.js';
import { Field, TwoPane, Empty, Ref, Select } from './components.js';
import { parseDice, rollTerms } from './dice.js';

// ---------------------------------------------------------------- rolling
export const tableByKey = (key) => S.genTables.find((t) => t.key === key) || null;
const entriesOf = (t) => (Array.isArray(t?.entries) ? t.entries.filter((e) => e && String(e.text || '').trim()) : []);

function pickEntry(entries, avoid) {
  let pool = avoid?.size ? entries.filter((e) => !avoid.has(e.text)) : entries;
  if (!pool.length) pool = entries;
  let r = Math.random() * pool.reduce((sum, e) => sum + Math.max(1, e.weight | 0), 0);
  for (const e of pool) { r -= Math.max(1, e.weight | 0); if (r < 0) return e; }
  return pool[pool.length - 1];
}

// Fill in a template. Unknown {keys} are left as written so a typo is easy to spot.
export function expand(text, depth = 0) {
  if (depth > 8) return text;       // a table that refers to itself stops here
  return String(text).replace(/\{([^{}]+)\}/g, (whole, inner) => {
    const body = inner.trim();
    const dice = body.replace(/\s+/g, '').match(/^(\d*d\d+(?:[+-]\d+)?)(?:[*x×](\d+))?$/i);
    if (dice) { try { return (rollTerms(parseDice(dice[1])).total * (Number(dice[2]) || 1)).toLocaleString(); } catch { return whole; } }
    const many = body.match(/^(\S+)\s+x\s*(\d+)$/i);
    const t = tableByKey(many ? many[1] : body);
    const entries = entriesOf(t);
    if (!entries.length) return whole;
    if (!many) return expand(pickEntry(entries).text, depth + 1);
    const seen = new Set(); const out = [];
    for (let i = 0; i < Math.min(Number(many[2]), 20); i++) { const e = pickEntry(entries, seen); seen.add(e.text); out.push(expand(e.text, depth + 1)); }
    return out.join(', ');
  });
}

// Roll a table by key. Returns '' if the table is missing or empty.
export function rollTable(key, avoidText) {
  const entries = entriesOf(tableByKey(key));
  if (!entries.length) return '';
  for (let i = 0; i < 6; i++) { const out = expand(pickEntry(entries).text).trim(); if (out !== avoidText || i === 5) return out; }
  return '';
}

// ---------------------------------------------------------------- saving results
// Append a line to the live session's notes, starting a session if none is live.
export async function appendNote(body, npcIds = []) {
  let sid = S.kv['activeSession:' + S.cid];
  if (!byId('session', sid)) {
    const s = await create('session', { date: today(), title: '' });
    sid = s.id; S.kv['activeSession:' + S.cid] = sid; call('kvSet', 'activeSession:' + S.cid, sid);
  }
  await create('note', { session_id: sid, created_at: new Date().toISOString(), body, npc_ids: npcIds, quest_ids: [] });
  return sid;
}

const SAVE_AS = [['', 'Nothing (just a result)'], ['npc', 'A new NPC'], ['location', 'A new location'], ['quest', 'A new quest'], ['note', 'A session note']];
const SAVE_LABEL = { npc: 'Save as NPC', location: 'Save as location', quest: 'Save as quest', note: 'Add to session notes' };

// Turn a result into a campaign entity. "Name — details" splits into name and description.
export async function saveResult(t, text) {
  const [head, ...rest] = text.split(' — ');
  const more = rest.join(' — ');
  if (t.save_as === 'npc') return { type: 'npc', row: await create('npc', { name: head, description: more, tags: 'generated' }) };
  if (t.save_as === 'location') return { type: 'location', row: await create('location', { name: head, description: more, tags: 'generated' }) };
  if (t.save_as === 'quest') return { type: 'quest', row: await create('quest', { title: text.length > 60 ? text.slice(0, 57).replace(/\s+\S*$/, '') + '…' : text, description: text, tags: t.category.toLowerCase().replace(/s$/, '') }) };
  await appendNote(`🎲 ${t.name}: ${text}`);
  return { type: 'note' };
}

// ---------------------------------------------------------------- editing
// One entry per line; "3| text" gives that line a weight of 3.
const toLines = (entries) => (entries || []).map((e) => ((e.weight | 0) > 1 ? `${e.weight}| ${e.text}` : e.text)).join('\n');
const fromLines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^(\d+)\s*\|\s*(.+)$/);
  return m ? { text: m[2], weight: Math.max(1, Math.min(100, Number(m[1]))) } : { text: l, weight: 1 };
});
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'table';
function freeKey(base) { let k = base; for (let n = 2; tableByKey(k); n++) k = `${base}_${n}`; return k; }

function TableEditor({ t }) {
  const [draft, setDraft] = useState(() => toLines(t.entries));
  const [key, setKey] = useState(t.key);
  const refs = [...new Set((draft.match(/\{([a-z0-9_]+)(?:\s+x\s*\d+)?\}/gi) || []).map((r) => r.replace(/[{}]/g, '').split(/\s/)[0]))];
  const missing = refs.filter((k) => !/^\d*d\d+/i.test(k) && !tableByKey(k));
  const usedBy = S.genTables.filter((o) => o !== t && (o.entries || []).some((e) => new RegExp(`\\{${t.key}(\\s+x\\s*\\d+)?\\}`, 'i').test(e.text)));
  const rename = (v) => { const k = slug(v); setKey(v); if (k && (k === t.key || !tableByKey(k))) edit('gen_table', t, { key: k }); };
  return html`<div class="geneditor">
    <div class="grid four">
      <${Field} label="Name" wide><input value=${t.name} onInput=${(e) => edit('gen_table', t, { name: e.target.value })} /><//>
      <${Field} label="Group"><input list="gen-cats" value=${t.category} onInput=${(e) => edit('gen_table', t, { category: e.target.value })} />
        <datalist id="gen-cats">${[...new Set(S.genTables.map((x) => x.category))].map((c) => html`<option value=${c} />`)}</datalist><//>
      <${Field} label="Key" hint="other tables use it as {key}">${t.builtin
        ? html`<input value=${t.key} disabled />`
        : html`<input value=${key} onInput=${(e) => rename(e.target.value)} onBlur=${() => setKey(t.key)} />`}<//>
      <${Field} label="Shown as"><${Select} value=${t.top ? '1' : '0'} options=${[{ id: '1', label: 'A generator' }, { id: '0', label: 'A parts table' }]} onChange=${(v) => edit('gen_table', t, { top: v === '1' ? 1 : 0 })} /><//>
      <${Field} label="A result can become"><${Select} value=${t.save_as} options=${SAVE_AS.map(([id, label]) => ({ id, label }))} onChange=${(v) => edit('gen_table', t, { save_as: v })} /><//>
      <${Field} label="Entries" hint="one per line · start a line with “3| ” to make it three times as likely · {key} rolls another table · {key x3} rolls three · {2d6*10} rolls dice" wide>
        <textarea rows="14" value=${draft} spellcheck=${false}
          onInput=${(e) => { setDraft(e.target.value); edit('gen_table', t, { entries: fromLines(e.target.value) }); }}></textarea><//>
    </div>
    ${missing.length ? html`<div class="gap">No table has the key ${missing.map((k, n) => html`${n ? ', ' : ''}<code>${k}</code>`)} yet, so that part will be left as written.</div>` : ''}
    <div class="genmeta muted">${t.entries.length} ${t.entries.length === 1 ? 'entry' : 'entries'}${t.builtin ? ' · built in (your edits are kept)' : ' · yours'}
      ${usedBy.length ? html` · used by ${usedBy.map((o, n) => html`${n ? ', ' : ''}<a onClick=${() => go('generators', o.id)}>${o.name}</a>`)}` : ''}</div>
  </div>`;
}

// ---------------------------------------------------------------- screen
const results = {};     // table id -> recent results (kept while the app is open)

function GeneratorDetail({ t }) {
  const [, force] = useState(0);
  const [editing, setEditing] = useState(!!S.route.editing);
  const [saved, setSaved] = useState(null);
  const list = (results[t.id] ??= []);
  const reroll = () => {
    const text = rollTable(t.key, list[0]);
    if (!text) return toast('This table has no entries yet — add some below.');
    list.unshift(text); if (list.length > 12) list.length = 12;
    setSaved(null); force((n) => n + 1);
  };
  useEffect(() => { if (!list.length && t.entries.length) reroll(); }, []);
  const cur = list[0];
  const save = async () => {
    const r = await saveResult(t, cur);
    setSaved(r);
    toast(r.type === 'note' ? 'Added to the live session\'s notes.' : 'Saved to the campaign.');
  };
  const copy = () => navigator.clipboard.writeText(cur).then(() => toast('Copied.'));
  return html`<div class="form">
    <div class="dhead"><div class="title static">${t.name}</div>
      <button onClick=${() => setEditing(!editing)}>${editing ? '✓ Done editing' : '✎ Edit table'}</button>
      ${!t.builtin ? html`<button class="danger ghost" onClick=${async () => { if (await del('gen_table', t)) go('generators', null); }}>Delete</button>` : ''}
    </div>
    <div class="genresult">
      <div class="gentext">${cur || html`<span class="muted">No entries yet.</span>`}</div>
      <div class="genbtns">
        <button class="primary" onClick=${reroll} title="Roll again (R)">🎲 Reroll</button>
        ${cur && t.save_as ? html`<button onClick=${save} disabled=${!!saved}>${saved ? '✓ Saved' : SAVE_LABEL[t.save_as]}</button>` : ''}
        ${cur && t.save_as !== 'note' ? html`<button onClick=${async () => { await appendNote(`🎲 ${t.name}: ${cur}`); toast('Added to the live session\'s notes.'); }}>→ Notes</button>` : ''}
        ${cur ? html`<button onClick=${copy}>Copy</button>` : ''}
        ${saved?.row ? html`<${Ref} type=${saved.type} id=${saved.row.id} />` : ''}
      </div>
    </div>
    ${list.length > 1 ? html`<div class="section"><h3>Earlier results</h3>
      ${list.slice(1).map((r, n) => html`<div class="genold" title="Bring this one back" onClick=${() => { list.splice(n + 1, 1); list.unshift(r); setSaved(null); force((x) => x + 1); }}>${r}</div>`)}</div>` : ''}
    ${editing ? html`<div class="section"><h3>Table</h3><${TableEditor} key=${t.id} t=${t} /></div>` : ''}
  </div>`;
}

export function GeneratorsScreen() {
  const [q, setQ] = useState('');
  const [parts, setParts] = useState(false);
  const cur = byId('gen_table', S.route.id);
  const ql = q.trim().toLowerCase();
  const rows = S.genTables.filter((t) => (ql ? (t.name + ' ' + t.category + ' ' + t.key).toLowerCase().includes(ql) : parts || t.top || t === cur))
    .sort((a, b) => (b.top - a.top) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const add = async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const name = e.target.value.trim(); e.target.value = '';
    const t = await create('gen_table', { key: freeKey(slug(name)), name, category: 'My tables', top: 1, save_as: '', builtin: 0, entries: [] });
    go('generators', t.id, { editing: true });
  };
  // R rerolls the open generator when you're not typing.
  useEffect(() => {
    const h = (e) => { if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !document.querySelector('.overlay')) document.querySelector('.genbtns .primary')?.click(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  let lastCat = null;
  return html`<${TwoPane}
    list=${html`
      <input class="quickadd" placeholder="+ New table — name, then Enter" onKeyDown=${add} />
      <input class="filter" placeholder="Filter generators and tables" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <label class="check listcheck"><input type="checkbox" checked=${parts} onChange=${(e) => setParts(e.target.checked)} /> Show parts tables (names, words, stock…)</label>
      <div class="rows">
        ${rows.map((t) => { const head = t.category !== lastCat; lastCat = t.category; return html`
          ${head ? html`<div class="rowhead">${t.category || 'Other'}</div>` : ''}
          <div key=${t.id} class="row ${cur?.id === t.id ? 'on' : ''}" onClick=${() => go('generators', t.id)}>
            <div class="rname">${t.name} ${!t.builtin ? html`<span class="src mine">Mine</span>` : ''}</div>
            <div class="rsub">${t.entries.length} ${t.entries.length === 1 ? 'entry' : 'entries'}${t.top ? '' : ' · parts'}</div></div>`; })}
        ${!rows.length ? html`<${Empty}>Nothing matches.<//>` : ''}
      </div>`}
    detail=${cur ? html`<${GeneratorDetail} key=${cur.id} t=${cur} />`
      : html`<${Empty}>Pick a generator to roll on it. Every table can be edited, and you can add your own.<br /><br />Need a whole character right now? Use <b>⚡ NPC</b> in the top bar (Ctrl+N).<//>`} />`;
}
