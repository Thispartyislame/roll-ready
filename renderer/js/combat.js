// Initiative tracker state and rules. Kept separate from the UI so other screens
// (NPCs, monsters, encounters, the command palette) can drive it.
// The whole state lives in one saved record per campaign, so a crash or accidental close mid-fight loses nothing.
import { S, notify, call, byId, d, toast, create, label } from './lib.js';
import { parseDice, rollTerms } from './dice.js';
import { tickRounds, dropTimersFor } from './timers.js';

export function tracker() {
  const key = 'tracker:' + S.cid;
  if (!S.kv[key]) S.kv[key] = { round: 1, turn: null, seq: 1, combatants: [] };
  const t = S.kv[key];
  if (t.showHealth === undefined) t.showHealth = true;
  return t;
}
let timer;
export function touch() {
  notify();
  clearTimeout(timer);
  const key = 'tracker:' + S.cid; const val = tracker();
  timer = setTimeout(() => { call('kvSet', key, val); pushPublic(); }, 120);
}

// A combatant with HP tracked (max > 0) that has dropped to 0 is "down": greyed out and skipped.
// Combatants added without HP (typically PCs, whose players track their own) are never skipped.
export const isDown = (c) => c.maxHp > 0 && c.hp <= 0;

export function order(t = tracker()) {
  return [...t.combatants].sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || (b.initBonus || 0) - (a.initBonus || 0) || a.id - b.id);
}

// ---------------------------------------------------------------- what players may see
// The ONLY data that ever leaves the GM window for the player view. No HP numbers, no notes,
// no stat blocks, and hidden combatants are left out entirely.
const healthWord = (c) => {
  if (!c.maxHp) return '';
  if (c.hp <= 0) return 'Down';
  const f = c.hp / c.maxHp;
  return f > 0.5 ? 'Healthy' : f > 0.2 ? 'Bloodied' : 'Near death';
};
export function publicState() {
  const t = tracker();
  const shown = order(t).filter((c) => !c.hidden);
  return {
    round: t.round,
    combatants: shown.map((c) => ({
      name: c.name, init: c.init, pc: c.kind === 'pc', active: c.id === t.turn, down: isDown(c),
      health: t.showHealth ? healthWord(c) : '',
      conditions: Object.entries(c.cond || {}).map(([k, v]) => (S.conditions.find((x) => x.name === k)?.leveled ? `${k} ${v}` : k)),
    })),
  };
}
export function pushPublic() { if (S.cid) call('playerPush', publicState()); }

// ---------------------------------------------------------------- adding combatants
function add(t, c) {
  const x = { id: t.seq++, kind: 'monster', init: null, initBonus: 0, hp: 0, maxHp: 0, ac: null, cond: {}, conc: false, hidden: false, ...c };
  t.combatants.push(x);
  return x;
}

// Roll a monster's hit dice ("3d6 + 6"); fall back to its listed average if they can't be read.
export function rollHp(m) {
  try { return Math.max(1, rollTerms(parseDice(m.data?.hit_dice)).total); } catch { return m.hp || 0; }
}

// opts: name (custom name), hp (override), rolled (roll hit dice per creature instead of using the average)
export function addMonster(m, qty = 1, opts = {}) {
  const t = tracker();
  const base = opts.name || m.name;
  const have = t.combatants.filter((c) => c.baseName === base).length;
  const init = d(20) + (m.init_bonus || 0);          // one roll for the whole group
  for (let i = 1; i <= qty; i++) {
    const hp = opts.hp || (opts.rolled ? rollHp(m) : m.hp || 0);
    add(t, { name: have + qty > 1 ? `${base} ${have + i}` : base, baseName: base, kind: 'monster', monsterId: m.id,
      init, initBonus: m.init_bonus || 0, hp, maxHp: hp, ac: m.ac });
  }
  touch();
}

export function addNpc(n) {
  const t = tracker();
  if (t.combatants.some((c) => c.npcId === n.id)) return toast(`${n.name} is already in the tracker.`);
  const m = byId('monster', n.monster_id);
  const bonus = n.init_bonus ?? m?.init_bonus ?? 0;
  const hp = n.max_hp ?? m?.hp ?? 0;
  add(t, { name: n.name || 'NPC', kind: 'npc', npcId: n.id, monsterId: m?.id, init: d(20) + bonus, initBonus: bonus, hp, maxHp: hp, ac: n.ac ?? m?.ac ?? null });
  touch();
}

export function addAdhoc({ name, init, hp, ac, pc }) {
  add(tracker(), { name: name || 'Combatant', kind: pc ? 'pc' : 'adhoc', init, hp: hp || 0, maxHp: hp || 0, ac });
  touch();
}

// Load the campaign's saved party. Members already in the tracker are left alone. Players roll their own
// initiative, so it starts blank.
export function addParty({ quiet } = {}) {
  const t = tracker(); let n = 0;
  for (const p of S.c.party_member) {
    if (t.combatants.some((c) => c.partyId === p.id)) continue;
    add(t, { name: p.name || 'PC', kind: 'pc', partyId: p.id, initBonus: p.init_bonus || 0, hp: p.max_hp || 0, maxHp: p.max_hp || 0, ac: p.ac });
    n++;
  }
  touch();
  if (!quiet) toast(n ? `Added ${n} party member${n > 1 ? 's' : ''}.` : S.c.party_member.length ? 'The party is already in the tracker.' : 'No party saved yet — add your players on the Party screen.');
  return n;
}

// One action from prep to play: every monster and NPC in the encounter, plus the party.
export function addEncounter(enc) {
  for (const em of enc.monsters || []) {
    const m = byId('monster', em.monster_id);
    if (m) addMonster(m, em.quantity, { name: em.custom_name, hp: em.hp_override, rolled: enc.hp_mode === 'rolled' });
  }
  for (const id of enc.npc_ids || []) { const n = byId('npc', id); if (n) addNpc(n); }
  addParty({ quiet: true });
  toast(`“${enc.name}” is in the initiative tracker${S.c.party_member.length ? ', with the party' : ''}.`);
}

// ---------------------------------------------------------------- turns
// Advance to the next combatant that isn't down; wrapping past the bottom starts a new round.
export function step(dir = 1) {
  const t = tracker(); const list = order(t); const n = list.length;
  if (!n) return;
  const cur = list.findIndex((c) => c.id === t.turn);
  const before = t.round;
  if (cur < 0) { const first = list.find((c) => !isDown(c)); t.turn = first ? first.id : null; }
  else {
    for (let i = 1; i <= n; i++) {
      const raw = cur + dir * i;
      const c = list[((raw % n) + n) % n];
      if (isDown(c) && c.id !== t.turn) continue;
      if (c.id === t.turn && isDown(c)) break;
      if (dir > 0 && raw >= n) t.round++;
      if (dir < 0 && raw < 0) t.round = Math.max(1, t.round - 1);
      t.turn = c.id;
      break;
    }
  }
  t.reminderOff = false;           // a new turn can show its reminder banner again
  if (t.round !== before) tickRounds(t.round - before);
  touch();
}

// Removing whoever's turn it is hands the turn to whoever was next.
export function removeCombatant(id) {
  const t = tracker();
  if (t.turn === id) {
    step(1);
    if (t.turn === id) t.turn = null;       // nobody else left standing
  }
  t.combatants = t.combatants.filter((c) => c.id !== id);
  if (!t.combatants.length) { t.turn = null; t.round = 1; }
  if (t.concPrompt?.id === id) t.concPrompt = null;
  touch();
  dropTimersFor(id);
}

export function rollAll() {
  const t = tracker(); const groups = {};
  for (const c of t.combatants) {
    if (c.kind === 'pc') continue;
    const k = c.monsterId && c.kind === 'monster' ? 'm' + c.monsterId + (c.baseName || '') : 'c' + c.id;
    groups[k] ??= d(20) + (c.initBonus || 0);
    c.init = groups[k];
  }
  touch();
}

export function resetCombat(keepParty) {
  const t = tracker();
  for (const c of t.combatants) if (!(keepParty && c.kind === 'pc')) dropTimersFor(c.id);
  t.combatants = keepParty ? t.combatants.filter((c) => c.kind === 'pc') : [];
  t.combatants.forEach((c) => { c.init = null; c.conc = false; c.cond = {}; });
  t.round = 1; t.turn = null; t.concPrompt = null;
  touch();
}

// Apply damage (positive) or healing (negative). If the target is concentrating, raise a reminder with
// the save DC — a reminder only; the GM decides what happens.
export function damage(c, amount) {
  if (!amount || !c.maxHp) return;
  c.hp = Math.max(0, Math.min(c.maxHp || Infinity, c.hp - amount));
  // 2024 rules: DC 10 or half the damage taken, whichever is higher, to a maximum of 30.
  if (amount > 0 && c.conc) tracker().concPrompt = { id: c.id, name: c.name, dc: Math.min(30, Math.max(10, Math.floor(amount / 2))), dropped: isDown(c) };
  if (isDown(c)) c.conc = false;
  touch();
}

// After the fight: write who is still standing (and any notes) into the live session's log.
export async function saveOutcome(extra) {
  const t = tracker();
  let sid = S.kv['activeSession:' + S.cid];
  if (!byId('session', sid)) {
    const now = new Date();
    const s = await create('session', { date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, title: '' });
    sid = s.id; S.kv['activeSession:' + S.cid] = sid; call('kvSet', 'activeSession:' + S.cid, sid);
  }
  const npcIds = [];
  const nm = (c) => { const n = byId('npc', c.npcId); if (n) { npcIds.push(n.id); return `@[${label(n)}](npc:${n.id})`; } return c.name; };
  const list = order(t);
  const up = list.filter((c) => !isDown(c)).map((c) => nm(c) + (c.maxHp ? ` (${c.hp}/${c.maxHp} HP)` : ''));
  const down = list.filter(isDown).map(nm);
  const body = `⚔ Combat ended in round ${t.round}. Standing: ${up.join(', ') || 'no one'}.${down.length ? ` Down: ${down.join(', ')}.` : ''}${extra?.trim() ? ' ' + extra.trim() : ''}`;
  await create('note', { session_id: sid, created_at: new Date().toISOString(), body, npc_ids: [...new Set(npcIds)], quest_ids: [] });
  return sid;
}
