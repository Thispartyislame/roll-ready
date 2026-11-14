import { html, render, useRef, useEffect, useStore, S, boot, go, lastOn, openCampaign, label, notify, call } from './lib.js';
import { useHotkey } from './components.js';
import { EntityScreen, PartyScreen } from './world.js';
import { SessionScreen, NoteInput, activeSession, startSession } from './sessions.js';
import { TrackerScreen, popOutPlayer } from './tracker.js';
import { tracker, order, pushPublic } from './combat.js';
import { MonsterScreen } from './monsters.js';
import { LookupScreen } from './lookup.js';
import { Dice, QuickRoll, toggleDice } from './dice.js';
import { Timers } from './timers.js';
import { GeneratorsScreen } from './generators.js';
import { EmergencyNpc, toggleEmergency } from './npcgen.js';
import { Timer, Palette, Shortcuts, SettingsScreen, togglePalette, toggleTimer, toggleShortcuts, newCampaign, hooks } from './tools.js';

const NAV = [
  ['At the table'],
  ['tracker', 'Initiative', '⚔'], ['lookup', 'Rules & spells', '📖'], ['session', 'Sessions & notes', '✎'], ['generators', 'Generators', '🎲'],
  ['Campaign'],
  ['party', 'Party', '♟'], ['npc', 'NPCs', '☺'], ['location', 'Locations', '⌂'], ['faction', 'Factions', '⚑'], ['quest', 'Quests', '❖'], ['encounter', 'Encounters', '☠'],
  ['Library'],
  ['monster', 'Monsters', '🐉'], ['settings', 'Settings & about', '⚙'],
];

function Welcome() {
  return html`<div class="welcome"><h1>Roll Ready</h1><p>A prep and at-the-table helper for game masters. Name your campaign to get started.</p>
    <input placeholder="Campaign name, then Enter" onKeyDown=${(e) => { if (e.key === 'Enter' && e.target.value.trim()) newCampaign(e.target.value.trim()); }} ref=${(el) => el && el.focus()} /></div>`;
}

const togglePlayer = () => (S.player?.open ? call('playerClose') : popOutPlayer());

function App() {
  useStore();
  const noteRef = useRef(); const rollRef = useRef();
  const focusNote = () => setTimeout(() => noteRef.current?.focus(), 30);
  hooks.note = focusNote;
  hooks.quickRoll = () => setTimeout(() => { rollRef.current?.focus(); rollRef.current?.select(); }, 30);
  const cmd = (k) => (e) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === k;
  const ready = S.ready && S.cid;
  useHotkey(cmd('k'), togglePalette);
  useHotkey(cmd('d'), () => toggleDice());
  useHotkey(cmd('e'), () => hooks.quickRoll());
  useHotkey(cmd('t'), toggleTimer);
  useHotkey(cmd('i'), () => go('tracker'));
  useHotkey(cmd('l'), () => go('lookup', null, { focus: Date.now() }));
  useHotkey(cmd('j'), async () => { if (!ready) return; if (!activeSession()) await startSession(); focusNote(); });
  useHotkey((e) => cmd('n')(e) && ready, () => toggleEmergency());
  useHotkey((e) => (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p' && ready, togglePlayer);
  useHotkey((e) => e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName), () => toggleShortcuts());
  // The player view shows whichever campaign is open.
  useEffect(() => { if (S.cid) pushPublic(); }, [S.cid]);

  if (!S.ready) return html`<div class="welcome"></div>`;
  if (!S.cid) return html`<${Welcome} />${S.toast ? html`<div class="toast">${S.toast}</div>` : ''}`;
  const r = S.route;
  const act = activeSession();
  const count = (k) => (k === 'tracker' ? tracker().combatants.length : k === 'party' ? S.c.party_member.length : S.c[k]?.length) || '';
  const screen = r.screen === 'tracker' ? html`<${TrackerScreen} />`
    : r.screen === 'lookup' ? html`<${LookupScreen} />`
    : r.screen === 'session' ? html`<${SessionScreen} />`
    : r.screen === 'monster' ? html`<${MonsterScreen} />`
    : r.screen === 'settings' ? html`<${SettingsScreen} />`
    : r.screen === 'party' ? html`<${PartyScreen} />`
    : r.screen === 'generators' ? html`<${GeneratorsScreen} />`
    : html`<${EntityScreen} key=${r.screen} type=${r.screen} />`;

  return html`<div class="app">
    <nav>
      <select class="camp" value=${S.cid} onChange=${(e) => openCampaign(Number(e.target.value))} title="Switch campaign">
        ${S.campaigns.map((c) => html`<option value=${c.id}>${c.name || '(unnamed campaign)'}</option>`)}
      </select>
      ${NAV.map(([k, l, icon]) => (l ? html`<a class=${r.screen === k ? 'on' : ''} onClick=${() => go(k, k === r.screen ? r.id : lastOn(k) ?? (k === 'session' ? act?.id ?? null : null))}>
        <i>${icon}</i><span>${l}</span><em>${count(k)}</em></a>` : html`<h5>${k}</h5>`))}
      <span class="spacer"></span>
      <a class="navhelp" onClick=${() => toggleShortcuts(true)}><i>?</i><span>Shortcuts</span></a>
    </nav>
    <main>
      <header>
        <button class="jump" onClick=${togglePalette} title="Jump to anything or run an action (Ctrl+K)">🔍 <kbd>Ctrl K</kbd></button>
        ${act ? html`<div class="quick"><span class="live" title=${label(act)}>LIVE</span><${NoteInput} sessionId=${act.id} inputRef=${noteRef} placeholder="Quick note — @ links an NPC or quest (Ctrl+J)" /></div>`
          : html`<div class="quick"><button onClick=${startSession}>▶ Start session</button></div>`}
        <${QuickRoll} inputRef=${rollRef} />
        <button onClick=${() => toggleDice()} title="Dice roller and roll history (Ctrl+D)">🎲</button>
        <${Timers} combatants=${order(tracker())} />
        <${Timer} />
        <button class="enpcbtn" onClick=${() => toggleEmergency(true)} title="Emergency NPC: a named, playable character right now (Ctrl+N)">⚡ NPC</button>
      </header>
      <div class="screen">${screen}</div>
    </main>
    <${Dice} /><${Palette} /><${EmergencyNpc} /><${Shortcuts} />
    ${S.toast ? html`<div class="toast">${S.toast}</div>` : ''}
  </div>`;
}

// Hear when the player window opens, closes or changes theme.
S.player = { open: false, theme: 'dark' };
window.dm.onPlayerStatus((status) => { S.player = status; notify(); });

render(html`<${App} />`, document.getElementById('root'));
// If loading ever fails, say so on screen instead of leaving an empty window.
boot().then(async () => { S.player = await call('playerStatus'); notify(); }).catch((e) => {
  document.getElementById('root').innerHTML = '<div class="welcome"><h1>Roll Ready</h1><p>Could not load your data.</p><code></code><p>Press F12 for details.</p></div>';
  document.querySelector('#root code').textContent = String(e && e.message || e);
});
