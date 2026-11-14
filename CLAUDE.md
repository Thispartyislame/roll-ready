# Roll Ready — handoff notes

Local-first Electron app for tabletop GMs (5E compatible, SRD 5.2). Phase 1 is complete and was
tested. **Phase 2 is partway built and the app does not currently start** — finish the items under
"Still to do" before running it. The full Phase 2 spec is in `docs/phase2-build-prompt.md`.

## Stack and conventions (do not re-choose)

- Electron + `node:sqlite` (built into Electron's Node; no native modules) + Preact/htm vendored at
  `renderer/vendor/htm-preact.js`. No bundler, no build step. `npm install && npm start`.
- `main.js` (windows, IPC) · `preload.js` (GM window: `dm.call(method, ...args)`) ·
  `preload-player.js` (player window: read-only public state) · `src/schema.js` (append-only
  migrations) · `src/db.js` (entity registry `ENT`, load/save/remove, seeding).
- Renderer keeps everything in memory in `S` (`renderer/js/lib.js`); `edit(type, obj, patch)`
  autosaves after 300 ms; `create`, `del`, `go(screen, id)`, `toast`, `setKv`.
- UI copy says "GM", never "DM"; no D&D / Wizards branding anywhere in the UI. The CC-BY
  attribution text in Settings → About must stay verbatim.
- Built-in rules data is SRD 5.2 only (`data/srd.json`, built by `tools/build-srd.py`).
  Generator content in `data/generators.json` is original and must stay original.
- Known pitfall already fixed once: Preact effects run after first paint, so `useStore()` catches
  up if the store changed before it subscribed. Keep that.

## Phase 2: done so far

- Renamed to Roll Ready (package.json, appId). `main.js` copies the old
  `DM Helper/dm-helper.sqlite` to `Roll Ready/roll-ready.sqlite` on first launch.
- **Schema v2 + db.js** (tested against a Phase 1 database and a fresh one): campaign
  `party_level`/`party_size`; encounter `hp_mode`; `encounter_monster` rebuilt with its own id,
  `custom_name`, `hp_override`; new `party_member`, `difficulty_threshold`, `timer`, `gen_table`;
  `dice_log` gains `session_id`, `combatant`. `setThreshold`, `kvGet`, generator seeding.
- **Licensing finding:** the "XP Budget per Character" table IS in SRD 5.2 (Gameplay Toolbox →
  Combat Encounters), per the markdown conversion of the SRD used for the bundled data and
  corroborated by SRD mirrors; not checked against the official PDF. It is shipped as editable
  defaults in `difficulty_threshold` (`srd.json` → `xp_budget`).
- **main.js**: player window (open/close, send to display, remembered bounds with fallback to the
  primary display, full screen via F11/Esc, theme), `playerPush` relay of a sanitized state.
- **renderer/js/dice.js**: expression parser (`2d6+3`, `4d6kh3`, `2d20kl1`, `d%`), `roll()`,
  history, log-to-notes, `QuickRoll` bar, `LastRoll` strip, roller panel (builder now emits
  expressions).
- **renderer/js/timers.js**: countdown timers (seconds or rounds), `tickRounds`, chips, panel.
- **renderer/js/combat.js**: rolled HP, custom names, `addParty`, `addEncounter` (loads party
  too), round ticks, `publicState()` (the only data sent to the player view), concentration
  prompt, `saveOutcome()`.
- **renderer/js/monsters.js**: rollable stat blocks, CR/type/source filters, add-as-homebrew from
  the empty search, `Pin`, `newHomebrew`.
- **renderer/js/world.js**: encounter builder (XP total, difficulty label, per-line name/HP,
  average/rolled toggle, "Run encounter") and `PartyScreen`.
- **renderer/js/tracker.js**: rewritten (selection, D/H/C/V keys, reminder banners, player-view
  menu, end-combat dialog, pinned panels). Not yet run.
- **renderer/js/lib.js**: pins, `XP_BY_CR`, `budgets`, `difficultyLabel`.

## Still to do

1. `lookup.js`: export `EntryView` (rename `View`, accept `compact`) — `tracker.js` imports it;
   add a `Pin` button to entries; add "Add as homebrew monster" to the SRD-gap message.
2. `tools.js`: delete the old dice code (now in `dice.js`); rebrand strings; add an editable
   thresholds grid to Settings (`call('setThreshold', level, tier, xp)` and update
   `S.thresholds`); command-palette actions (next turn, roll dice, start timer, new note, run
   encounter, pop out player view, emergency NPC); shortcut reference overlay on `?`.
3. `app.js`: nav entries for Party and Generators; header gets `QuickRoll`, `Timers`, the
   emergency-NPC button; hotkeys (Ctrl+E quick roll, Ctrl+Shift+P player view); subscribe to
   `window.dm.onPlayerStatus` and store it in `S.player`; pass `system: '5E (2024 rules)'` when
   creating a campaign; rebrand the welcome screen and `index.html` title.
4. `renderer/player.html` (+ js/css): player view. Uses `window.table.get()/onState()`. Large
   high-contrast list, round number, active turn, conditions, coarse health; full-screen and
   theme buttons that fade when idle; hide the cursor when idle.
5. `generators.js`: Generators screen over `S.genTables` — roll (`{key}`, `{key x3}`,
   `{2d6*10}` templates), reroll, save to campaign by `save_as` (npc / location / quest / note),
   edit entries (one per line, `3| text` for weight), add tables.
6. **Emergency NPC generator (feature 10)**: not started. Needs new original tables in
   `data/generators.json` (occupation, appearance, mannerism, want, secret, hook, per setting /
   attitude where useful, optional SRD species), an overlay with per-field lock/reroll,
   filters, history of 20, save as NPC with an `emergency` tag, copy as text, append to notes.
   Output must be a plain object of named fields.
7. `styles.css`: styles for everything new (quick roll, roll strip, timers panel, banners,
   budget bar, party table, pins, modal, row menu headers, key hint, generators, emergency NPC).
8. Update `ARCHITECTURE.md` and `README.md`; then test end to end, including upgrading a Phase 1
   database, and smoke-test on Windows and macOS (Phase 2 has not been run at all).
