# Roll Ready — handoff notes

Local-first Electron app for tabletop GMs (5E compatible, SRD 5.2). Phases 1 and 2 are
complete and were tested end to end on Linux. Remaining: smoke-test on Windows and macOS (see the
end of this file). The Phase 2 spec is in `docs/phase2-build-prompt.md`.

**Before any UI work, read `PRODUCT.md` and `DESIGN.md`** (who the app is for, how it should feel,
the visual rules). Where they conflict with this file, this file wins.

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

## Phase 2: what was built

- Schema v2 + `db.js`: party, thresholds, timers, generator tables, encounter lines with custom
  name / HP override, roll-log links. Upgrades a Phase 1 database in place.
- `main.js`: player window (send to display, remembered bounds, F11/Esc, theme) relaying only the
  sanitized `publicState()` from `combat.js`. `renderer/player.html` + `js/player.js` + `player.css`.
- `dice.js` (parser, quick roll, history), `timers.js` (seconds / rounds), `combat.js`, `tracker.js`
  (keys, reminder banners, end-combat dialog, pins), `monsters.js`, `world.js` (encounter builder,
  party), `lookup.js` (`EntryView`, pins, SRD-gap → homebrew).
- `generators.js`: roll-table engine and Generators screen. `npcgen.js`: Emergency NPC overlay;
  `generateNpc()` returns a plain object of named fields. Emergency tables are the `enpc_*` keys
  in `data/generators.json`; filters are discovered by key prefix.
- `tools.js`: stopwatch, command palette with actions, shortcut overlay (`?`), Settings with the
  editable thresholds grid. `app.js`: nav, header, global hotkeys.
- **Licensing finding:** the "XP Budget per Character" table IS in SRD 5.2 (Gameplay Toolbox →
  Combat Encounters), per the markdown conversion of the SRD used for the bundled data and
  corroborated by SRD mirrors; not checked against the official PDF. Shipped as editable defaults.

## Conventions worth keeping

- Overlays use the `.overlay` class; the tracker's single-key shortcuts are disabled while one is
  open, so any new modal should use it too.
- Focus for anything typed into immediately after a hotkey goes in a layout effect (see `Palette`).
- Only `publicState()` may decide what the player window sees.
- No `confirm()` for undoable actions: `del()` hides the entry and shows a toast with Undo (the row
  is removed from the file when the toast goes, on window blur, or on a campaign switch);
  `withUndo()` in `combat.js` does the same for tracker changes. Only deleting a campaign asks.
- Colours are tokens only (`renderer/styles.css`, `renderer/player.css`), defined for dark and
  `:root[data-theme="light"]`. `js/theme.js` sets `data-theme` before the app loads.

## Still to do

- Smoke-test on Windows and macOS: launch, player view on a second display, full screen, installers.
- Confirm the XP budget table against the official SRD 5.2 PDF.
