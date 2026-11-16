// Campaign world data: NPCs, locations, factions, quests, encounters.
import { html, useState, useRef, S, listOf, byId, label, create, edit, del, go, tagsOf, parseMentions, clock, xpOf, budgets, difficultyLabel, TIERS, toast, num } from './lib.js';
import { Bound, Field, Select, Ref, Picker, Links, Tags, TwoPane, Empty } from './components.js';
import { addNpc, addEncounter, addParty } from './combat.js';
import { go as nav } from './lib.js';
import { Picture } from './soundboard.js';

const NAMES = { npc: 'NPC', location: 'Location', faction: 'Faction', quest: 'Quest', encounter: 'Encounter' };
const nameKey = (type) => (type === 'quest' ? 'title' : 'name');

function subline(type, e) {
  if (type === 'npc') return [label(byId('location', e.location_id)).replace('(deleted)', ''), e.status !== 'alive' ? e.status : ''].filter(Boolean).join(' · ');
  if (type === 'location') return e.parent_id ? 'in ' + label(byId('location', e.parent_id)) : '';
  if (type === 'faction') { const n = S.c.npc.filter((x) => x.faction_ids.includes(e.id)).length; return n ? `${n} member${n > 1 ? 's' : ''}` : ''; }
  if (type === 'quest') return e.status;
  if (type === 'encounter') { const n = (e.monsters || []).reduce((a, m) => a + m.quantity, 0) + (e.npc_ids || []).length; return n ? `${n} creature${n > 1 ? 's' : ''}` : ''; }
  return '';
}

export function EntityScreen({ type }) {
  const [q, setQ] = useState('');
  const addRef = useRef();
  const all = listOf(type);
  const ql = q.trim().toLowerCase();
  const rows = all.filter((e) => !ql || label(e).toLowerCase().includes(ql) || tagsOf(e).some((t) => t.toLowerCase().includes(ql.replace(/^#/, ''))))
    .sort((a, b) => label(a).localeCompare(label(b)));
  const cur = byId(type, S.route.id) || null;
  const add = async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const row = await create(type, { [nameKey(type)]: e.target.value.trim() });
    e.target.value = '';
    go(type, row.id);
  };
  const Detail = { npc: NpcDetail, location: LocationDetail, faction: FactionDetail, quest: QuestDetail, encounter: EncounterDetail }[type];
  return html`<${TwoPane}
    list=${html`
      <input ref=${addRef} class="quickadd" placeholder="+ New ${NAMES[type].toLowerCase() === 'npc' ? 'NPC' : NAMES[type].toLowerCase()} — name, then Enter" onKeyDown=${add} />
      <input class="filter" placeholder="Filter by name or tag" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="rows">
        ${rows.map((e) => html`<div key=${e.id} class="row ${cur?.id === e.id ? 'on' : ''} ${e.status === 'dead' ? 'dim' : ''}" onClick=${() => go(type, e.id)}>
          <div class="rname">${label(e)}</div>
          <div class="rsub">${subline(type, e)} <${Tags} e=${e} /></div>
        </div>`)}
        ${!rows.length ? html`<${Empty}>${all.length ? 'Nothing matches.' : `No ${NAMES[type].toLowerCase()}s yet. Type a name above and press Enter.`}<//>` : ''}
      </div>`}
    detail=${cur ? html`<${Detail} key=${cur.id} e=${cur} />` : html`<${Empty}>Select a ${NAMES[type].toLowerCase()} or add a new one.<//>`} />`;
}

const Head = ({ type, e, children }) => html`<div class="dhead">
  <${Bound} type=${type} obj=${e} k=${nameKey(type)} cls="title" placeholder="Name" />
  ${children}
  <button class="danger ghost" onClick=${async () => { if (await del(type, e)) go(type, null); }}>Delete</button>
</div>`;

// Notes that @-mention this NPC or quest, newest first.
function Mentions({ type, id }) {
  const notes = S.c.note.filter((n) => (type === 'npc' ? n.npc_ids : n.quest_ids).includes(id)).slice(-8).reverse();
  if (!notes.length) return '';
  return html`<div class="section"><h3>Mentioned in session notes</h3>
    ${notes.map((n) => { const s = byId('session', n.session_id); return html`<div class="mention" onClick=${() => nav('session', s.id)}>
      <small>${s?.date} ${clock(n.created_at)}</small> ${parseMentions(n.body).map((p) => (typeof p === 'string' ? p : html`<b>${label(byId(p.type, p.id)) === '(deleted)' ? p.name : label(byId(p.type, p.id))}</b>`))}
    </div>`; })}
  </div>`;
}

const locOptions = (excludeId) => {
  // A location can't be nested inside itself or its own descendants.
  const bad = new Set(excludeId == null ? [] : [excludeId]);
  for (let grew = bad.size > 0; grew;) { grew = false; for (const l of S.c.location) if (bad.has(l.parent_id) && !bad.has(l.id)) { bad.add(l.id); grew = true; } }
  return S.c.location.filter((l) => !bad.has(l.id)).map((l) => ({ id: l.id, label: label(l) })).sort((a, b) => a.label.localeCompare(b.label));
};

function NpcDetail({ e }) {
  const quests = S.c.quest.filter((q) => q.npc_ids.includes(e.id));
  const block = byId('monster', e.monster_id);
  return html`<div class="form">
    <${Head} type="npc" e=${e}><button onClick=${() => addNpc(e)} title="Add to the initiative tracker">⚔ To initiative</button><//>
    <div class="grid">
      <${Field} label="Location"><${Select} value=${e.location_id} empty="— nowhere —" options=${locOptions(null)} onChange=${(v) => edit('npc', e, { location_id: v ? Number(v) : null })} /><//>
      <${Field} label="Status"><input list="npc-status" value=${e.status} onInput=${(ev) => edit('npc', e, { status: ev.target.value })} />
        <datalist id="npc-status">${['alive', 'dead', 'unknown', 'missing', 'captured'].map((s) => html`<option value=${s} />`)}</datalist><//>
      <${Field} label="Tags" hint="comma-separated"><${Bound} type="npc" obj=${e} k="tags" placeholder="merchant, ally" /><//>
      <${Field} label="Factions" wide><${Links} type="faction" ids=${e.faction_ids} placeholder="Add faction…"
        onChange=${(ids) => edit('npc', e, { faction_ids: ids })} onCreate=${(name) => create('faction', { name })} /><//>
      <${Field} label="Description" wide><${Bound} type="npc" obj=${e} k="description" area rows=${4} placeholder="Who they are, what they look like, what they want" /><//>
      <${Field} label="Personality / voice" wide><${Bound} type="npc" obj=${e} k="personality" area rows=${3} placeholder="Mannerisms, accent, a line they'd say" /><//>
      <${Field} label="Picture" wide><${Picture} type="npc" id=${e.id} /><//>
    </div>
    <div class="section"><h3>Combat <small>optional — fill in to drop this NPC straight into initiative</small></h3>
      <div class="grid four">
        <${Field} label="AC"><${Bound} type="npc" obj=${e} k="ac" numeric placeholder=${block?.ac ?? ''} /><//>
        <${Field} label="Max HP"><${Bound} type="npc" obj=${e} k="max_hp" numeric placeholder=${block?.hp ?? ''} /><//>
        <${Field} label="Initiative bonus"><${Bound} type="npc" obj=${e} k="init_bonus" numeric placeholder=${block?.init_bonus ?? ''} /><//>
        <${Field} label="Uses stat block">${block
          ? html`<div class="links"><${Ref} type="monster" id=${block.id} onRemove=${() => edit('npc', e, { monster_id: null })} /></div>`
          : html`<${Picker} options=${S.monsters.map((m) => ({ id: m.id, label: m.name, sub: `CR ${m.cr}` }))} placeholder="Pick a monster…" onPick=${(o) => edit('npc', e, { monster_id: o.id })} />`}<//>
      </div>
    </div>
    ${quests.length ? html`<div class="section"><h3>Quests</h3><div class="links">${quests.map((q) => html`<${Ref} type="quest" id=${q.id} />`)}</div></div>` : ''}
    <${Mentions} type="npc" id=${e.id} />
  </div>`;
}

function LocationDetail({ e }) {
  const here = S.c.npc.filter((n) => n.location_id === e.id);
  const subs = S.c.location.filter((l) => l.parent_id === e.id);
  const quests = S.c.quest.filter((q) => q.location_ids.includes(e.id));
  const trail = []; for (let p = byId('location', e.parent_id), n = 0; p && n < 20; p = byId('location', p.parent_id), n++) trail.unshift(p);
  return html`<div class="form">
    ${trail.length ? html`<div class="trail">${trail.map((l) => html`<a onClick=${() => go('location', l.id)}>${label(l)}</a> › `)}${label(e)}</div>` : ''}
    <${Head} type="location" e=${e} />
    <div class="grid">
      <${Field} label="Inside"><${Select} value=${e.parent_id} empty="— top level —" options=${locOptions(e.id)} onChange=${(v) => edit('location', e, { parent_id: v ? Number(v) : null })} /><//>
      <${Field} label="Tags" hint="comma-separated"><${Bound} type="location" obj=${e} k="tags" placeholder="city, dangerous" /><//>
      <${Field} label="Description" wide><${Bound} type="location" obj=${e} k="description" area rows=${6} placeholder="What's here, what it feels like" /><//>
      <${Field} label="Picture" wide><${Picture} type="location" id=${e.id} /><//>
    </div>
    <div class="section"><h3>NPCs currently here</h3>
      <div class="links">
        ${here.map((n) => html`<${Ref} type="npc" id=${n.id} onRemove=${() => edit('npc', n, { location_id: null })} />`)}
        <${Picker} keepOpen placeholder="Move an NPC here…" options=${S.c.npc.filter((n) => n.location_id !== e.id).map((n) => ({ id: n.id, label: label(n), sub: label(byId('location', n.location_id)).replace('(deleted)', '') }))}
          onPick=${(o) => edit('npc', byId('npc', o.id), { location_id: e.id })}
          onCreate=${(name) => create('npc', { name, location_id: e.id })} />
      </div>
    </div>
    <div class="section"><h3>Places inside</h3>
      <div class="links">
        ${subs.map((l) => html`<${Ref} type="location" id=${l.id} />`)}
        <${Picker} keepOpen placeholder="Add a place inside…" options=${[]} onPick=${() => {}} onCreate=${(name) => create('location', { name, parent_id: e.id })} />
      </div>
    </div>
    ${quests.length ? html`<div class="section"><h3>Quests</h3><div class="links">${quests.map((q) => html`<${Ref} type="quest" id=${q.id} />`)}</div></div>` : ''}
  </div>`;
}

function FactionDetail({ e }) {
  const members = S.c.npc.filter((n) => n.faction_ids.includes(e.id));
  return html`<div class="form">
    <${Head} type="faction" e=${e} />
    <div class="grid">
      <${Field} label="Tags" hint="comma-separated" wide><${Bound} type="faction" obj=${e} k="tags" /><//>
      <${Field} label="Description" wide><${Bound} type="faction" obj=${e} k="description" area rows=${4} /><//>
      <${Field} label="Goals" wide><${Bound} type="faction" obj=${e} k="goals" area rows=${3} /><//>
      <${Field} label="Relationships with other factions" wide><${Bound} type="faction" obj=${e} k="relationships" area rows=${3} placeholder="Allied with…, at war with…" /><//>
    </div>
    <div class="section"><h3>Members</h3>
      <div class="links">
        ${members.map((n) => html`<${Ref} type="npc" id=${n.id} onRemove=${() => edit('npc', n, { faction_ids: n.faction_ids.filter((x) => x !== e.id) })} />`)}
        <${Picker} keepOpen placeholder="Add member…" options=${S.c.npc.filter((n) => !n.faction_ids.includes(e.id)).map((n) => ({ id: n.id, label: label(n) }))}
          onPick=${(o) => { const n = byId('npc', o.id); edit('npc', n, { faction_ids: [...n.faction_ids, e.id] }); }}
          onCreate=${(name) => create('npc', { name, faction_ids: [e.id] })} />
      </div>
    </div>
  </div>`;
}

function QuestDetail({ e }) {
  return html`<div class="form">
    <${Head} type="quest" e=${e} />
    <div class="grid">
      <${Field} label="Status"><${Select} value=${e.status} options=${['active', 'completed', 'failed', 'abandoned']} onChange=${(v) => edit('quest', e, { status: v })} /><//>
      <${Field} label="Tags" hint="comma-separated"><${Bound} type="quest" obj=${e} k="tags" /><//>
      <${Field} label="Description" wide><${Bound} type="quest" obj=${e} k="description" area rows=${6} placeholder="The hook, the stakes, the reward" /><//>
      <${Field} label="NPCs involved" wide><${Links} type="npc" ids=${e.npc_ids} placeholder="Add NPC…" onChange=${(ids) => edit('quest', e, { npc_ids: ids })} onCreate=${(name) => create('npc', { name })} /><//>
      <${Field} label="Locations" wide><${Links} type="location" ids=${e.location_ids} placeholder="Add location…" onChange=${(ids) => edit('quest', e, { location_ids: ids })} onCreate=${(name) => create('location', { name })} /><//>
    </div>
    <${Mentions} type="quest" id=${e.id} />
  </div>`;
}

// Party level and size, saved on the campaign and shared by every encounter in it.
function PartyBudget({ total }) {
  const c = S.campaigns.find((x) => x.id === S.cid);
  const b = budgets(c.party_level, c.party_size);
  const lab = difficultyLabel(total, c.party_level, c.party_size);
  return html`<div class="budget">
    <div class="bnum"><small>Total XP</small><b>${total.toLocaleString()}</b></div>
    <div class="bnum diff ${lab.toLowerCase().replace(/\s+/g, '-')}"><small>Difficulty</small><b>${lab}</b></div>
    <label>Party of <input type="number" min="1" max="12" value=${c.party_size} onInput=${(ev) => edit('campaign', c, { party_size: Math.max(1, num(ev.target.value) || 1) })} /></label>
    <label>at level <input type="number" min="1" max="20" value=${c.party_level} onInput=${(ev) => edit('campaign', c, { party_level: Math.max(1, Math.min(20, num(ev.target.value) || 1)) })} /></label>
    <div class="btiers">${TIERS.map(([k, l]) => html`<span class=${total && total <= b[k] ? 'fits' : ''}>${l} ≤ ${b[k].toLocaleString()}</span>`)}
      <a onClick=${() => go('settings', null, { section: 'thresholds' })} title="Edit the XP budget table">edit</a></div>
  </div>`;
}

function EncounterDetail({ e }) {
  const sessions = S.c.session.filter((s) => s.encounter_ids.includes(e.id));
  const setLine = (m, patch) => edit('encounter', e, { monsters: e.monsters.map((x) => (x === m ? { ...x, ...patch } : x)) });
  const total = e.monsters.reduce((sum, m) => sum + xpOf(byId('monster', m.monster_id)) * m.quantity, 0);
  const addLine = (id) => edit('encounter', e, { monsters: [...e.monsters, { monster_id: id, quantity: 1, custom_name: '', hp_override: null }] });
  return html`<div class="form">
    <${Head} type="encounter" e=${e}><button class="primary" title="Load every creature here, plus the party, into the initiative tracker" onClick=${() => { addEncounter(e); go('tracker'); }}>⚔ Run encounter</button><//>
    <${PartyBudget} total=${total} />
    <div class="section"><h3>Monsters
        <span class="h3right">Hit points: <span class="seg">${[['average', 'Average'], ['rolled', 'Rolled']].map(([k, l]) => html`<button class=${(e.hp_mode || 'average') === k ? 'on' : ''}
          title=${k === 'rolled' ? 'Roll each creature\'s hit dice when the encounter is run' : 'Use the listed average'} onClick=${() => edit('encounter', e, { hp_mode: k })}>${l}</button>`)}</span></span></h3>
      <table class="plain enc">
        ${e.monsters.length ? html`<tr class="th"><td>Qty</td><td>Monster</td><td>Name at the table</td><td>HP</td><td>XP</td><td></td></tr>` : ''}
        ${e.monsters.map((m) => { const mon = byId('monster', m.monster_id); return html`<tr>
          <td class="qty"><input type="number" min="1" value=${m.quantity} onInput=${(ev) => setLine(m, { quantity: Math.max(1, Number(ev.target.value) | 0) })} /></td>
          <td><${Ref} type="monster" id=${m.monster_id} /> <span class="muted">CR ${mon?.cr || '—'} · AC ${mon?.ac}</span></td>
          <td><input value=${m.custom_name || ''} placeholder=${mon?.name} title="Optional: what to call them in the tracker" onInput=${(ev) => setLine(m, { custom_name: ev.target.value })} /></td>
          <td class="qty"><input type="number" min="1" value=${m.hp_override ?? ''} placeholder=${mon?.hp} title="Optional: fixed HP for these creatures" onInput=${(ev) => setLine(m, { hp_override: num(ev.target.value) })} /></td>
          <td class="muted">${(xpOf(mon) * m.quantity).toLocaleString()}</td>
          <td><button class="x" title="Remove" onClick=${() => edit('encounter', e, { monsters: e.monsters.filter((x) => x !== m) })}>×</button></td>
        </tr>`; })}
      </table>
      <${Picker} keepOpen placeholder="Add a monster — search the library…"
        options=${S.monsters.map((m) => ({ id: m.id, label: m.name, sub: `CR ${m.cr || '—'} · ${m.source === 'SRD' ? 'SRD' : 'Mine'}` }))}
        onPick=${(o) => addLine(o.id)}
        onCreate=${async (name) => { const m = await create('monster', { name, cr: '', type: '', ac: 10, hp: 10, init_bonus: 0, data: { name, size: 'Medium', abilities: {}, traits: [], actions: [] } });
          addLine(m.id); toast(`“${name}” isn't in the library, so it was added as a homebrew monster. Fill in its stat block under Monsters.`); return m; }} />
    </div>
    <div class="grid">
      <${Field} label="NPCs in this encounter" wide><${Links} type="npc" ids=${e.npc_ids} placeholder="Add NPC…" onChange=${(ids) => edit('encounter', e, { npc_ids: ids })} /><//>
      <${Field} label="Notes" wide><${Bound} type="encounter" obj=${e} k="notes" area rows=${5} placeholder="Terrain, tactics, treasure" /><//>
      <${Field} label="Used in sessions" wide><div class="links">
        ${sessions.map((s) => html`<${Ref} type="session" id=${s.id} onRemove=${() => edit('session', s, { encounter_ids: s.encounter_ids.filter((x) => x !== e.id) })} />`)}
        <${Picker} keepOpen placeholder="Link to a session…" options=${S.c.session.filter((s) => !s.encounter_ids.includes(e.id)).map((s) => ({ id: s.id, label: label(s) }))}
          onPick=${(o) => { const s = byId('session', o.id); edit('session', s, { encounter_ids: [...s.encounter_ids, e.id] }); }} />
      </div><//>
    </div>
  </div>`;
}

// The party: added once per campaign, loaded into the tracker with every encounter.
// Just enough to run initiative — this is not a character sheet.
export function PartyScreen() {
  const c = S.campaigns.find((x) => x.id === S.cid);
  const list = S.c.party_member;
  const add = async (ev) => { if (ev.key !== 'Enter' || !ev.target.value.trim()) return; await create('party_member', { name: ev.target.value.trim() }); ev.target.value = ''; };
  const N = (p, k, ph) => html`<input type="number" value=${p[k] ?? ''} placeholder=${ph} onInput=${(ev) => edit('party_member', p, { [k]: num(ev.target.value) })} />`;
  return html`<div class="settings"><section>
    <h2>Party <small>your players' characters — saved with this campaign and loaded into the tracker alongside encounters</small></h2>
    <table class="plain party">
      ${list.length ? html`<tr class="th"><td>Character</td><td>Player</td><td>AC</td><td>Max HP</td><td>Init bonus</td><td></td></tr>` : ''}
      ${list.map((p) => html`<tr key=${p.id}>
        <td><${Bound} type="party_member" obj=${p} k="name" /></td><td><${Bound} type="party_member" obj=${p} k="player" placeholder="optional" /></td>
        <td class="qty">${N(p, 'ac', '—')}</td><td class="qty">${N(p, 'max_hp', '—')}</td><td class="qty">${N(p, 'init_bonus', '+0')}</td>
        <td><button class="x" title="Remove from the party" onClick=${() => del('party_member', p)}>×</button></td></tr>`)}
    </table>
    <div class="rowbtns"><input placeholder="+ Add a character — name, then Enter" onKeyDown=${add} />
      <button class="primary" disabled=${!list.length} onClick=${() => { addParty(); go('tracker'); }}>⚔ Load party into initiative</button></div>
    <p class="muted">Leave Max HP blank if your players track their own hit points; those characters are never skipped at 0 HP.</p>
  </section>
  <section><h2>Encounter difficulty <small>used by the encounter builder</small></h2>
    <div class="budget plainb">
      <label>Party of <input type="number" min="1" max="12" value=${c.party_size} onInput=${(ev) => edit('campaign', c, { party_size: Math.max(1, num(ev.target.value) || 1) })} /></label>
      <label>at level <input type="number" min="1" max="20" value=${c.party_level} onInput=${(ev) => edit('campaign', c, { party_level: Math.max(1, Math.min(20, num(ev.target.value) || 1)) })} /></label>
      ${list.length && list.length !== c.party_size ? html`<button onClick=${() => edit('campaign', c, { party_size: list.length })}>Use party size (${list.length})</button>` : ''}
    </div>
  </section></div>`;
}
