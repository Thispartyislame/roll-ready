// The demo campaign: a small sample campaign built from data/demo/demo.json, added alongside the GM's own
// campaigns (never over them). Media files are copied in from data/demo like any other soundboard file.
import { S, call, create, setKv, openCampaign, go, toast, notify } from './lib.js';

export const DEMO_NAME = 'Demo: The Saltwind Coast';
export const demoCampaign = () => S.campaigns.find((c) => c.name === DEMO_NAME) || null;

let busy = false;
export async function openDemo() {
  if (busy) return;
  const have = demoCampaign();
  if (have) { await openCampaign(have.id); go('session'); return toast('This is the demo campaign. Switch back to your own with the drop-down at the top of the sidebar.'); }
  busy = true;
  try { await buildDemo(); }
  catch (e) { toast('Couldn\'t add the demo campaign: ' + (e?.message || e)); }
  finally { busy = false; }
}

async function buildDemo() {
  const d = await call('demoData');
  const c = await call('save', 'campaign', d.campaign);
  S.campaigns.push(c);
  await openCampaign(c.id);
  const ref = {};
  const copied = {};   // each bundled file is copied once, even if several entries use it
  const media = async (name) => (copied[name] ??= await call('demoMedia', name));
  const monsterId = (name) => { const m = S.monsters.find((x) => x.name === name && x.source === 'SRD'); if (!m) throw new Error('missing SRD monster ' + name); return m.id; };

  for (const l of d.locations) {
    ref[l.ref] = await create('location', { name: l.name, description: l.description, tags: l.tags || '', parent_id: l.parent ? ref[l.parent].id : null });
    if (l.picture) await setKv(`img:location:${ref[l.ref].id}`, await media(l.picture));
  }
  for (const f of d.factions) ref[f.ref] = await create('faction', { name: f.name, description: f.description, goals: f.goals, relationships: f.relationships, tags: f.tags || '' });
  for (const n of d.npcs) {
    ref[n.ref] = await create('npc', { name: n.name, description: n.description, personality: n.personality, status: n.status || 'alive', tags: n.tags || '',
      location_id: n.location ? ref[n.location].id : null, faction_ids: (n.factions || []).map((r) => ref[r].id), monster_id: n.monster ? monsterId(n.monster) : null });
  }
  for (const q of d.quests) {
    ref[q.ref] = await create('quest', { title: q.title, description: q.description, status: q.status, tags: q.tags || '',
      npc_ids: (q.npcs || []).map((r) => ref[r].id), location_ids: (q.locations || []).map((r) => ref[r].id) });
  }
  for (const p of d.party) await create('party_member', p);
  for (const e of d.encounters) {
    ref[e.ref] = await create('encounter', { name: e.name, notes: e.notes, hp_mode: e.hp_mode, npc_ids: (e.npcs || []).map((r) => ref[r].id),
      monsters: e.monsters.map((m) => ({ monster_id: monsterId(m.monster), quantity: m.quantity, custom_name: m.name || '', hp_override: null })) });
  }
  // Note text links people and quests: @{Name} is an NPC, @{q:Title} a quest.
  const byName = (type, name) => S.c[type].find((x) => (x.name || x.title) === name);
  for (const s of d.sessions) {
    const row = await create('session', { date: s.date, title: s.title, summary: s.summary, encounter_ids: (s.encounters || []).map((r) => ref[r].id) });
    ref[s.ref] = row;
    for (const [time, text] of s.notes) {
      const npcIds = []; const questIds = [];
      const body = text.replace(/@\{(q:)?([^}]+)\}/g, (_m, q, name) => {
        const e = byName(q ? 'quest' : 'npc', name); if (!e) return name;
        (q ? questIds : npcIds).push(e.id);
        return `@[${name}](${q ? 'quest' : 'npc'}:${e.id})`;
      });
      await create('note', { session_id: row.id, created_at: new Date(`${s.date}T${time}:00`).toISOString(), body, npc_ids: [...new Set(npcIds)], quest_ids: [...new Set(questIds)] });
    }
  }
  let order = 0;
  for (const b of d.soundboard) {
    const fields = { label: b.label, channel: b.channel, color: b.color || '', volume: b.volume ?? 100, loop: b.loop || 0, fade: b.fade || 0, duration: b.duration || 0, sort_order: order++,
      members: (b.members || []).map((r) => ref['sb:' + r].id) };
    if (b.audio) fields.audio = await media(b.audio);
    if (b.visual) { fields.visual = await media(b.visual); fields.visual_kind = /\.(mp4|webm|mov|m4v|ogv)$/i.test(b.visual) ? 'video' : 'image'; }
    const row = await create('sound_button', fields);
    if (b.ref) ref['sb:' + b.ref] = row;
  }
  const pins = d.pins.map(([t, name]) => ({ t, id: (t === 'monster' ? S.monsters : S.rules).find((x) => x.name === name)?.id })).filter((p) => p.id);
  await setKv('pins:' + c.id, pins);
  notify();
  go('session', ref.s2.id);
  toast('Demo campaign added. Switch back to your own campaigns with the drop-down at the top of the sidebar; delete the demo in Settings when you\'re done.', { ms: 9000 });
}
