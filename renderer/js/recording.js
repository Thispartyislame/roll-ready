// Session audio recording. Records the microphone in this window and hands the audio to the main
// process every few seconds, which appends it to a file in "roll-ready-recordings" beside the database.
// The file is an ordinary .webm (Opus) audio file, attached to the live session.
import { html, useState, useEffect, S, notify, call, create, setKv, toast, label, today, byId } from './lib.js';

const R = { rec: null, stream: null, started: 0, file: null, sessionId: null, queue: Promise.resolve() };
export const isRecording = () => !!R.rec;
const clockOf = (ms) => { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); return (h ? h + ':' : '') + String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0') + ':' + String(s % 60).padStart(2, '0'); };
const spoken = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

export async function startRecording() {
  if (R.rec) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return toast('Couldn\'t reach a microphone. Check that one is connected and that Roll Ready is allowed to use it.'); }
  // A recording belongs to a session; start one quietly if none is live.
  let s = byId('session', S.kv['activeSession:' + S.cid]);
  if (!s) { s = await create('session', { date: today(), title: '' }); await setKv('activeSession:' + S.cid, s.id); }
  R.file = await call('recStart', s.id, s.title || 'Session');
  R.sessionId = s.id; R.stream = stream; R.started = Date.now(); R.queue = Promise.resolve();
  const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48000 });
  // Chunks are written in order, even though turning each one into bytes is asynchronous.
  rec.ondataavailable = (e) => { if (e.data.size) R.queue = R.queue.then(async () => call('recAppend', new Uint8Array(await e.data.arrayBuffer()))).catch(() => {}); };
  rec.onstop = async () => {
    await R.queue;
    const file = await call('recStop');
    const length = Date.now() - R.started; const sid = R.sessionId;
    stream.getTracks().forEach((t) => t.stop());
    R.rec = null; R.stream = null; R.file = null;
    if (byId('session', sid)) await create('note', { session_id: sid, created_at: new Date().toISOString(), body: `🎙 Recorded ${spoken(length)} of audio: ${file}`, npc_ids: [], quest_ids: [] });
    toast(`Recording saved (${spoken(length)}). Find it under Sessions & notes.`);
    S.recVersion = (S.recVersion || 0) + 1; notify();
  };
  rec.start(4000);
  R.rec = rec;
  toast('Recording from your microphone. Make sure everyone at the table is happy to be recorded.', { ms: 6000 });
  S.recVersion = (S.recVersion || 0) + 1; notify();
}
export function stopRecording() { if (R.rec && R.rec.state !== 'inactive') R.rec.stop(); }
export const toggleRecording = () => (R.rec ? stopRecording() : startRecording());
window.addEventListener('beforeunload', () => { if (R.rec) { try { R.rec.stop(); } catch { /* closing anyway */ } call('recStop'); } });

// Top-bar control: a quiet button, or the running time while recording (a label and a time, not just a colour).
export function RecButton() {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => R.rec && tick((n) => n + 1), 1000); return () => clearInterval(i); }, []);
  return R.rec
    ? html`<button class="recbtn on" onClick=${stopRecording} title="Recording this session's audio — click to stop and save">● REC ${clockOf(Date.now() - R.started)}</button>`
    : html`<button class="recbtn" onClick=${startRecording} title="Record this session's audio from your microphone">● Rec</button>`;
}

const size = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');
// Recordings attached to one session, shown on the session's page.
export function Recordings({ sessionId }) {
  const [list, setList] = useState([]);
  const load = () => call('recList').then((all) => setList(all.filter((r) => r.sessionId === sessionId)));
  useEffect(() => { load(); }, [sessionId, S.recVersion]);
  const here = R.rec && R.sessionId === sessionId;
  return html`<div class="section"><h3>Recordings <small>audio of the session, saved as a file you can play or transcribe</small></h3>
    ${list.map((r) => html`<div class="recrow" key=${r.file}>
      <span class="recname" title=${r.file}>${r.file.replace(/^s\d+-/, '')}</span>
      <span class="muted">${r.live ? 'recording now…' : size(r.bytes)}</span>
      <button onClick=${() => call('recShow', r.file)}>Show in folder</button>
      ${r.live ? '' : html`<button class="danger ghost" onClick=${async () => { if (confirm(`Delete the recording “${r.file.replace(/^s\d+-/, '')}”? The audio file is removed for good.`)) { await call('recDelete', r.file); load(); } }}>Delete</button>`}
    </div>`)}
    ${!list.length ? html`<div class="muted">No recordings for this session yet.</div>` : ''}
    <div class="rowbtns">${here ? html`<button onClick=${stopRecording}>■ Stop recording</button>` : R.rec ? html`<span class="muted">Recording another session…</span>` : html`<button onClick=${startRecording} title="Records into the live session">● Record audio</button>`}</div>
  </div>`;
}
