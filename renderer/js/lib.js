// Shared state, persistence helpers and small utilities used by every screen.
import { html, useState, useEffect, useRef } from '../vendor/htm-preact.js';
export { html, useState, useEffect, useRef };
export { render, useMemo, useLayoutEffect } from '../vendor/htm-preact.js';

// ---------------------------------------------------------------- store
// One plain object holds everything; the whole (small) dataset is in memory, so every
// screen filters and searches without touching the disk. Writes go through IPC.
export const S = {
  ready: false, campaigns: [], cid: null,
  c: { npc: [], location: [], faction: [], quest: [], session: [], note: [], encounter: [], party_member: [], timer: [] },
  monsters: [], spells: [], items: [], rules: [], conditions: [], thresholds: [], genTables: [], diceLog: [], lastRoll: null, kv: {},
  route: { screen: 'npc', id: null },
  toast: null,
};
const LIB = { monster: 'monsters', spell: 'spells', item: 'items', rule: 'rules', condition: 'conditions', campaign: 'campaigns', gen_table: 'genTables' };
export const listOf = (type) => (LIB[type] ? S[LIB[type]] : S.c[type]);
export const byId = (type, id) => (id == null ? null : listOf(type).find((x) => x.id === id) || null);
export const label = (e) => {
  if (!e) return '(deleted)';
  if ('summary' in e) return [e.date, e.title].filter(Boolean).join(' · ') || 'Session';
  return e.name || e.title || '(unnamed)';
};

const subs = new Set();
let version = 0;
export function notify() { version++; subs.forEach((f) => f()); }
export function useStore() {
  const [, set] = useState(0);
  const seen = version;
  useEffect(() => {
    const f = () => set((n) => n + 1);
    subs.add(f);
    // Effects run after the first paint. If the store changed before this component got to
    // subscribe (data can load faster than a slow first frame), catch up now.
    if (version !== seen) f();
    return () => subs.delete(f);
  }, []);
  return S;
}

export function toast(msg) {
  S.toast = msg; notify();
  clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = null; notify(); }, 3500);
}

export async function call(method, ...args) {
  try { return await window.dm.call(method, ...args); }
  catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method 'api': Error: /, '')); throw e; }
}

// ---------------------------------------------------------------- search text
// Lower-cased name and full text are cached on each library entry so lookup is a plain scan.
export function index(type, e) {
  e._n = (e.name || '').toLowerCase();
  const d = e.data || {};
  let text = '';
  if (type === 'spell') text = [d.description, d.higher_level, d.classes, e.school].join(' ');
  else if (type === 'item') text = [d.description, e.category, e.rarity].join(' ');
  else if (type === 'rule') text = [e.body, e.category, e.section].join(' ');
  else if (type === 'monster') text = [e.type, ...['traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions'].flatMap((k) => (d[k] || []).map((a) => a.name))].join(' ');
  e._t = text.toLowerCase();
  return e;
}

// ---------------------------------------------------------------- load
export async function boot() {
  const b = await call('bootstrap');
  Object.assign(S, b);
  S.monsters.forEach((e) => index('monster', e));
  S.spells.forEach((e) => index('spell', e));
  S.items.forEach((e) => index('item', e));
  S.rules.forEach((e) => index('rule', e));
  const want = S.kv.lastCampaign;
  const c = S.campaigns.find((x) => x.id === want) || S.campaigns[0];
  if (c) await openCampaign(c.id);
  if (S.kv.lastRoute && c) S.route = S.kv.lastRoute;
  S.ready = true; notify();
}

export async function openCampaign(id) {
  await flushSaves();
  S.c = await call('loadCampaign', id);
  S.cid = id;
  for (const k of Object.keys(lastOpen)) if (k !== 'monster') delete lastOpen[k];
  if (S.ready && S.route.screen !== 'monster') S.route = { screen: S.route.screen, id: null };
  setKv('lastCampaign', id);
  notify();
}
export const reloadCampaign = async () => { await flushSaves(); if (S.cid) { S.c = await call('loadCampaign', S.cid); notify(); } };

// Each screen remembers what was last open on it, so flipping away and back doesn't lose your place.
const lastOpen = {};
export const lastOn = (screen) => lastOpen[screen] ?? null;
export function go(screen, id = null, extra = {}) {
  lastOpen[screen] = id;
  S.route = { screen, id, ...extra };
  setKv('lastRoute', { screen, id });
  notify();
}
// Jump to whatever an entity is: a world entity opens its screen, a library entry opens lookup.
export function open(type, id) {
  if (['spell', 'item', 'rule'].includes(type)) go('lookup', null, { sel: type + ':' + id });
  else go(type, id);
}

export function setKv(key, value) { S.kv[key] = value; return call('kvSet', key, value); }

// ---------------------------------------------------------------- writes
export async function create(type, fields) {
  const scoped = S.c[type] && type !== 'note';
  const row = await call('save', type, scoped ? { campaign_id: S.cid, ...fields } : fields);
  if (LIB[type]) index(type, row);
  listOf(type).push(row);
  notify();
  return row;
}

// Edits apply to the in-memory object immediately and are written ~300 ms after the last keystroke.
const pending = new Map();
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k[0] !== '_'));
export function edit(type, obj, patch) {
  Object.assign(obj, patch);
  if (LIB[type]) index(type, obj);
  notify();
  const key = type + ':' + obj.id;
  clearTimeout(pending.get(key)?.t);
  const run = () => { pending.delete(key); return call('save', type, strip(obj)); };
  pending.set(key, { t: setTimeout(run, 300), run });
}
export async function flushSaves() {
  const all = [...pending.values()];
  all.forEach((p) => clearTimeout(p.t));
  await Promise.all(all.map((p) => p.run().catch(() => {})));
}
window.addEventListener('beforeunload', () => { flushSaves(); });
window.addEventListener('blur', () => { flushSaves(); });

export async function del(type, obj, { ask = true } = {}) {
  if (ask && !confirm(`Delete "${label(obj)}"? This can't be undone.`)) return false;
  clearTimeout(pending.get(type + ':' + obj.id)?.t); pending.delete(type + ':' + obj.id);
  await call('remove', type, obj.id);
  if (type === 'campaign') {
    S.campaigns = S.campaigns.filter((x) => x.id !== obj.id);
    if (S.campaigns[0]) await openCampaign(S.campaigns[0].id);
    else { S.cid = null; notify(); }
  } else if (LIB[type]) {
    S[LIB[type]] = S[LIB[type]].filter((x) => x.id !== obj.id);
    if (type === 'monster') await reloadCampaign(); else notify();
  } else {
    await reloadCampaign();     // picks up cascaded link removals
  }
  return true;
}

// ---------------------------------------------------------------- misc helpers
export const tagsOf = (e) => (e.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
export const sign = (n) => (n >= 0 ? '+' : '') + n;
export const mod = (score) => Math.floor(((score ?? 10) - 10) / 2);
export const d = (sides) => 1 + Math.floor(Math.random() * sides);
export const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
export const clock = (iso) => { const t = new Date(iso); return isNaN(t) ? '' : t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
export const crNum = (cr) => (String(cr).includes('/') ? 1 / Number(String(cr).split('/')[1]) : Number(cr) || 0);

// Rank a text query against a name: exact > starts-with > word-starts-with > contains.
export function nameScore(name, q) {
  if (!q) return 1;
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  const i = name.indexOf(q);
  if (i < 0) return 0;
  return /[\s(\-']/.test(name[i - 1]) ? 60 : 40;
}

// Minimal Markdown -> HTML for SRD text and user notes: paragraphs, bold/italic, lists, tables, headings.
export function md(src) {
  if (!src) return '';
  const inline = (s) => esc(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*_(.+?)_\*\*|_\*\*(.+?)\*\*_/g, '<b><i>$1$2</i></b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])[*_]([^*_\n]+?)[*_](?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  const out = [];
  const lines = String(src).replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|?\s*$/.test(r)).map(cells);
      const hasHead = rows.length > 1 && /^\s*\|[\s:|-]+\|?\s*$/.test(rows[1]) && body[0].some(Boolean);
      out.push('<table>' + body.map((r, n) => (n === 0 && !body[0].some(Boolean) ? '' : '<tr>' + r.map((c) => (n === 0 && hasHead ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('') + '</tr>')).join('') + '</table>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      out.push('<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h4>${inline(h[2])}</h4>`); i++; continue; }
    if (/^Table: /.test(l)) { out.push(`<div class="tcap">${inline(l.slice(7))}</div>`); i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*]\s|\d+\.\s|#{1,6}\s)/.test(lines[i])) para.push(lines[i++].replace(/^>\s?/, ''));
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('');
}
export const Md = ({ text, cls = '' }) => html`<div class="md ${cls}" dangerouslySetInnerHTML=${{ __html: md(text) }} />`;

// ---------------------------------------------------------------- @-mentions
// Notes store mentions as @[Name](npc:12) so links survive renames; inputs show plain @Name.
const TOKEN = /@\[([^\]]*)\]\((npc|quest):(\d+)\)/g;
export function parseMentions(body) {
  const parts = []; let last = 0; let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(body || ''))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push({ type: m[2], id: Number(m[3]), name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < (body || '').length) parts.push(body.slice(last));
  return parts;
}
export const plainBody = (body) => parseMentions(body).map((p) => (typeof p === 'string' ? p : '@' + (label(byId(p.type, p.id)) === '(deleted)' ? p.name : label(byId(p.type, p.id))))).join('');
export const mentionsIn = (body) => parseMentions(body).filter((p) => typeof p !== 'string');
// Turn plain text + the mentions picked while typing back into token form.
export function tokenize(text, picked) {
  let out = text;
  const used = [];
  for (const p of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    const needle = '@' + p.name;
    if (!out.includes(needle)) continue;
    out = out.split(needle).join(`@[${p.name}](${p.type}:${p.id})`);
    used.push(p);
  }
  return { body: out, npc_ids: [...new Set(used.filter((p) => p.type === 'npc').map((p) => p.id))], quest_ids: [...new Set(used.filter((p) => p.type === 'quest').map((p) => p.id))] };
}

// ---------------------------------------------------------------- pinned reference panels
// Stat blocks, spells and rules pinned beside the initiative tracker. Saved per campaign.
export const pins = () => (S.kv['pins:' + S.cid] || []).filter((p) => byId(p.t, p.id));
export const isPinned = (t, id) => pins().some((p) => p.t === t && p.id === id);
export function togglePin(t, id) {
  const cur = pins();
  const next = isPinned(t, id) ? cur.filter((p) => !(p.t === t && p.id === id)) : [...cur, { t, id }];
  setKv('pins:' + S.cid, next); notify();
  if (next.length > cur.length) toast('Pinned beside the initiative tracker.');
}

// ---------------------------------------------------------------- encounter maths
export const XP_BY_CR = { 0: 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
export const xpOf = (m) => XP_BY_CR[m?.cr] ?? 0;
export const TIERS = [['low', 'Low'], ['moderate', 'Moderate'], ['high', 'High']];
// XP budget for the whole party at each tier, from the editable threshold table.
export function budgets(level, size) {
  const out = {};
  for (const [k] of TIERS) out[k] = (S.thresholds.find((t) => t.level === level && t.tier === k)?.xp || 0) * size;
  return out;
}
export function difficultyLabel(totalXp, level, size) {
  const b = budgets(level, size);
  if (!totalXp) return '—';
  if (!b.low && !b.moderate && !b.high) return 'No thresholds set';
  if (totalXp <= b.low) return 'Low';
  if (totalXp <= b.moderate) return 'Moderate';
  if (totalXp <= b.high) return 'High';
  return 'Beyond high';
}
