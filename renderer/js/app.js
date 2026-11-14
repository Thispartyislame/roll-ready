import { html, render, useRef, useStore, S, boot, go, lastOn, openCampaign, label } from './lib.js';
import { useHotkey } from './components.js';
import { EntityScreen } from './world.js';
import { SessionScreen, NoteInput, activeSession, startSession } from './sessions.js';
import { TrackerScreen } from './tracker.js';
import { tracker } from './combat.js';
import { MonsterScreen } from './monsters.js';
import { LookupScreen } from './lookup.js';
import { Timer, Dice, Palette, SettingsScreen, toggleDice, togglePalette, toggleTimer, newCampaign } from './tools.js';

const NAV = [
  ['At the table'],
  ['tracker', 'Initiative', '⚔'], ['lookup', 'Rules & spells', '📖'], ['session', 'Sessions & notes', '✎'],
  ['Campaign'],
  ['npc', 'NPCs', '☺'], ['location', 'Locations', '⌂'], ['faction', 'Factions', '⚑'], ['quest', 'Quests', '❖'], ['encounter', 'Encounters', '☠'],
  ['Library'],
  ['monster', 'Monsters', '🐉'], ['settings', 'Settings & about', '⚙'],
];

function Welcome() {
  return html`<div class="welcome"><h1>DM Helper</h1><p>Name your campaign to get started.</p>
    <input placeholder="Campaign name, then Enter" onKeyDown=${(e) => { if (e.key === 'Enter' && e.target.value.trim()) newCampaign(e.target.value.trim()); }} ref=${(el) => el && el.focus()} /></div>`;
}

function App() {
  useStore();
  const noteRef = useRef();
  const cmd = (k) => (e) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === k;
  useHotkey(cmd('k'), togglePalette);
  useHotkey(cmd('d'), toggleDice);
  useHotkey(cmd('t'), toggleTimer);
  useHotkey(cmd('i'), () => go('tracker'));
  useHotkey(cmd('l'), () => go('lookup', null, { focus: Date.now() }));
  useHotkey(cmd('j'), async () => { if (!activeSession()) await startSession(); setTimeout(() => noteRef.current?.focus(), 30); });

  if (!S.ready) return html`<div class="welcome"></div>`;
  if (!S.cid) return html`<${Welcome} />`;
  const r = S.route;
  const act = activeSession();
  const count = (k) => (k === 'tracker' ? tracker().combatants.length : S.c[k]?.length) || '';
  const screen = r.screen === 'tracker' ? html`<${TrackerScreen} />`
    : r.screen === 'lookup' ? html`<${LookupScreen} />`
    : r.screen === 'session' ? html`<${SessionScreen} />`
    : r.screen === 'monster' ? html`<${MonsterScreen} />`
    : r.screen === 'settings' ? html`<${SettingsScreen} />`
    : html`<${EntityScreen} key=${r.screen} type=${r.screen} />`;

  return html`<div class="app">
    <nav>
      <select class="camp" value=${S.cid} onChange=${(e) => openCampaign(Number(e.target.value))} title="Switch campaign">
        ${S.campaigns.map((c) => html`<option value=${c.id}>${c.name || '(unnamed campaign)'}</option>`)}
      </select>
      ${NAV.map(([k, l, icon]) => (l ? html`<a class=${r.screen === k ? 'on' : ''} onClick=${() => go(k, k === r.screen ? r.id : lastOn(k) ?? (k === 'session' ? act?.id ?? null : null))}>
        <i>${icon}</i><span>${l}</span><em>${count(k)}</em></a>` : html`<h5>${k}</h5>`))}
    </nav>
    <main>
      <header>
        <button class="jump" onClick=${togglePalette}>🔍 Jump to… <kbd>Ctrl K</kbd></button>
        ${act ? html`<div class="quick"><span class="live" title=${label(act)}>LIVE</span><${NoteInput} sessionId=${act.id} inputRef=${noteRef} placeholder="Quick note to the live session — @ links an NPC or quest (Ctrl+J)" /></div>`
          : html`<div class="quick"><button onClick=${startSession}>▶ Start session</button></div>`}
        <${Timer} />
        <button onClick=${toggleDice} title="Dice roller (Ctrl+D)">🎲 Dice</button>
      </header>
      <div class="screen">${screen}</div>
    </main>
    <${Dice} /><${Palette} />
    ${S.toast ? html`<div class="toast">${S.toast}</div>` : ''}
  </div>`;
}

render(html`<${App} />`, document.getElementById('root'));
// If loading ever fails, say so on screen instead of leaving an empty window.
boot().catch((e) => {
  document.getElementById('root').innerHTML = '<div class="welcome"><h1>DM Helper</h1><p>Could not load your data.</p><code></code><p>Press F12 for details.</p></div>';
  document.querySelector('#root code').textContent = String(e && e.message || e);
});
