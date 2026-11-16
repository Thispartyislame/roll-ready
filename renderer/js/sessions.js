// Session log: start a session, append notes fast, browse and search past sessions.
import { html, useState, useRef, useEffect, S, byId, label, create, edit, del, go, setKv, call, notify, today, clock,
  parseMentions, plainBody, mentionsIn, tokenize, nameScore, reloadCampaign } from './lib.js';
import { Bound, Field, Ref, Links, TwoPane, Empty, Select } from './components.js';
import { Recordings } from './recording.js';

export const activeSession = () => byId('session', S.kv['activeSession:' + S.cid]);
export async function startSession() {
  const s = await create('session', { date: today(), title: '' });
  setKv('activeSession:' + S.cid, s.id);
  go('session', s.id);
  return s;
}

// Single-line note field with @-mention autocomplete for NPCs and quests.
// Enter saves. Typing @ opens the list; Enter/Tab picks; an unknown name can be created as an NPC on the spot.
export function NoteInput({ sessionId, note, onDone, placeholder, inputRef }) {
  const [text, setText] = useState(note ? plainBody(note.body) : '');
  const [picked, setPicked] = useState(note ? mentionsIn(note.body).map((p) => ({ ...p, name: byId(p.type, p.id) ? label(byId(p.type, p.id)) : p.name })) : []);
  const [caret, setCaret] = useState(0);
  const [hi, setHi] = useState(0);
  const own = useRef(); const ref = inputRef || own;
  useEffect(() => { if (note) ref.current?.focus(); }, []);

  const before = text.slice(0, caret);
  const m = before.match(/@([^@]*)$/);
  let partial = m ? m[1] : null;
  if (partial != null && (picked.some((p) => partial.startsWith(p.name)) || partial.length > 40)) partial = null;
  let hits = [];
  if (partial != null) {
    const q = partial.toLowerCase();
    hits = [...S.c.npc.map((e) => ({ type: 'npc', id: e.id, name: label(e) })), ...S.c.quest.map((e) => ({ type: 'quest', id: e.id, name: label(e) }))]
      .map((o) => ({ o, s: nameScore(o.name.toLowerCase(), q) })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.o.name.localeCompare(b.o.name)).slice(0, 7).map((x) => x.o);
    if (q.trim() && !/\s$/.test(partial) && !hits.some((h) => h.name.toLowerCase() === q)) hits.push({ create: partial.trim() });
    if (!hits.length) partial = null;
  }

  const pick = async (h) => {
    if (h.create) { const e = await create('npc', { name: h.create }); h = { type: 'npc', id: e.id, name: e.name }; }
    const start = caret - partial.length - 1;
    const next = text.slice(0, start) + '@' + h.name + ' ' + text.slice(caret);
    setText(next); setPicked([...picked, h]); setHi(0);
    const pos = start + h.name.length + 2;
    setCaret(pos);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };

  const submit = async () => {
    if (!text.trim()) { onDone?.(); return; }
    const t = tokenize(text.trim(), picked);
    if (note) edit('note', note, t);
    else await create('note', { session_id: sessionId, created_at: new Date().toISOString(), ...t });
    setText(''); setPicked([]);
    onDone?.();
  };

  const key = (e) => {
    if (partial != null) {
      if (e.key === 'ArrowDown') { e.preventDefault(); return setHi((x) => Math.min(hits.length - 1, x + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); return setHi((x) => Math.max(0, x - 1)); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pick(hits[Math.min(hi, hits.length - 1)]); }
      if (e.key === 'Escape') { e.preventDefault(); return setCaret(-1); }
    }
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape' && note) onDone?.();
  };
  const track = (e) => setCaret(e.target.selectionStart);

  return html`<span class="noteinput">
    <input ref=${ref} value=${text} placeholder=${placeholder || 'Add a note — @ to link an NPC or quest, Enter to save'}
      onInput=${(e) => { setText(e.target.value); track(e); setHi(0); }} onKeyDown=${key} onKeyUp=${(e) => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) track(e); }} onClick=${track}
      onBlur=${() => setTimeout(() => setCaret(-1), 150)} />
    ${partial != null ? html`<div class="menu up">
      ${hits.map((h, n) => html`<div class="mi ${n === hi ? 'hi' : ''} ${h.create ? 'create' : ''}" onMouseDown=${(e) => { e.preventDefault(); pick(h); }}>
        ${h.create ? html`+ Create NPC “${h.create}”` : html`<span>${h.name}</span><small>${h.type === 'npc' ? 'NPC' : 'Quest'}</small>`}</div>`)}
    </div>` : ''}
  </span>`;
}

export const NoteBody = ({ body }) => parseMentions(body).map((p) => (typeof p === 'string' ? p
  : byId(p.type, p.id) ? html`<${Ref} type=${p.type} id=${p.id} />` : html`<span class="chip gone">${p.name}</span>`));

function NoteRow({ n, showSession }) {
  const [editing, setEditing] = useState(false);
  const s = byId('session', n.session_id);
  if (editing) return html`<div class="note editing"><${NoteInput} note=${n} onDone=${() => setEditing(false)} /></div>`;
  return html`<div class="note">
    <span class="time">${showSession ? html`<a onClick=${() => go('session', s.id)}>${s?.date}</a> ` : ''}${clock(n.created_at)}</span>
    <span class="body"><${NoteBody} body=${n.body} /></span>
    <span class="acts"><button class="ghost" title="Edit" onClick=${() => setEditing(true)}>✎</button>
      <button class="x" title="Delete note" onClick=${() => del('note', n, { ask: false })}>×</button></span>
  </div>`;
}

export function SessionScreen() {
  const [q, setQ] = useState(''); const [npc, setNpc] = useState(''); const [quest, setQuest] = useState('');
  const act = activeSession();
  const cur = byId('session', S.route.id) || null;
  const sessions = [...S.c.session].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const searching = q.trim() || npc || quest;
  const ql = q.trim().toLowerCase();
  const found = !searching ? [] : S.c.note.filter((n) => (!ql || plainBody(n.body).toLowerCase().includes(ql))
    && (!npc || n.npc_ids.includes(Number(npc))) && (!quest || n.quest_ids.includes(Number(quest)))).reverse();
  const opts = (type) => [...S.c[type]].sort((a, b) => label(a).localeCompare(label(b))).map((e) => ({ id: e.id, label: label(e) }));

  return html`<${TwoPane}
    list=${html`
      <button class="primary block" onClick=${startSession}>▶ Start a new session</button>
      <div class="searchbox">
        <input class="filter" placeholder="Search all notes…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <div class="pair"><${Select} value=${npc} empty="Any NPC" options=${opts('npc')} onChange=${setNpc} /><${Select} value=${quest} empty="Any quest" options=${opts('quest')} onChange=${setQuest} /></div>
      </div>
      <div class="rows">
        ${sessions.map((s) => html`<div class="row ${!searching && cur?.id === s.id ? 'on' : ''}" onClick=${() => { setQ(''); setNpc(''); setQuest(''); go('session', s.id); }}>
          <div class="rname">${label(s)} ${act?.id === s.id ? html`<span class="live">LIVE</span>` : ''}</div>
          <div class="rsub">${S.c.note.filter((n) => n.session_id === s.id).length} notes</div>
        </div>`)}
        ${!sessions.length ? html`<${Empty}>No sessions yet. Start one to begin logging notes.<//>` : ''}
      </div>`}
    detail=${searching ? html`<div class="form">
        <div class="dhead"><div class="title static">${found.length} note${found.length === 1 ? '' : 's'} found</div>
          <button onClick=${() => { setQ(''); setNpc(''); setQuest(''); }}>Clear search</button></div>
        <div class="notes">${found.slice(0, 300).map((n) => html`<${NoteRow} key=${n.id} n=${n} showSession />`)}</div>
      </div>`
      : cur ? html`<${SessionDetail} key=${cur.id} s=${cur} />` : html`<${Empty}>Select a session, or start a new one.<//>`} />`;
}

function SessionDetail({ s }) {
  const notes = S.c.note.filter((n) => n.session_id === s.id);
  const act = activeSession();
  const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [notes.length]);
  return html`<div class="form sessionform">
    <div class="dhead">
      <input type="date" value=${s.date} onInput=${(e) => edit('session', s, { date: e.target.value })} />
      <${Bound} type="session" obj=${s} k="title" cls="title" placeholder="Session title (optional)" />
      ${act?.id === s.id
        ? html`<button onClick=${() => setKv('activeSession:' + S.cid, null).then(notify)}>■ End session</button>`
        : html`<button onClick=${() => { setKv('activeSession:' + S.cid, s.id); notify(); }} title="Quick notes from the top bar will go to this session">Make live</button>`}
      <button class="danger ghost" onClick=${async () => { if (await del('session', s)) go('session', null); }}>Delete</button>
    </div>
    <div class="grid">
      <${Field} label="Summary" wide><${Bound} type="session" obj=${s} k="summary" area rows=${3} placeholder="What happened, in a few lines" /><//>
      <${Field} label="Encounters" wide><${Links} type="encounter" ids=${s.encounter_ids} placeholder="Link an encounter…"
        onChange=${(ids) => edit('session', s, { encounter_ids: ids })} onCreate=${(name) => create('encounter', { name, monsters: [], npc_ids: [] })} /><//>
    </div>
    <${Recordings} sessionId=${s.id} />
    <div class="section grow"><h3>Notes</h3>
      <div class="notes">
        ${notes.map((n) => html`<${NoteRow} key=${n.id} n=${n} />`)}
        ${!notes.length ? html`<${Empty}>No notes yet.<//>` : ''}
        <div ref=${end}></div>
      </div>
    </div>
    <div class="notebar"><${NoteInput} sessionId=${s.id} /></div>
  </div>`;
}
