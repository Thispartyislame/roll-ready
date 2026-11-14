# DM Helper

A local-first desktop app for prepping and running D&D campaigns: world notes, a session log, an
initiative tracker, rules and spell lookup, a dice roller and a stopwatch. Built for the 2024 revised
rules (5.5e) with SRD 5.2 as the bundled rules data. Works fully offline; no account, no server.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer (it's only used to install and launch; the app
runs on the Node bundled inside Electron).

```
npm install
npm start
```

That's it — there are no native modules to compile and no build step.

## Build an installer

```
npm run dist:win     # on Windows  -> dist/DM Helper Setup x.y.z.exe
npm run dist:mac     # on a Mac    -> dist/DM Helper-x.y.z.dmg
```

Build each on its own OS (a Mac build can't be made on Windows). The builds are unsigned, so
Windows SmartScreen and macOS Gatekeeper will warn the first time: on Windows choose
"More info → Run anyway"; on macOS right-click the app → Open.

## Where your data lives

One SQLite file, created on first launch:

- Windows: `%APPDATA%\DM Helper\dm-helper.sqlite`
- macOS: `~/Library/Application Support/DM Helper/dm-helper.sqlite`

Settings → "Show in folder" opens it. Copy the file to back it up or move it to another computer.
Set the `DMHELPER_DB` environment variable to point the app at a different file.

## What's in it

| Area | What it does |
|---|---|
| **NPCs, Locations, Factions, Quests** | Type a name, press Enter, it exists. Every field saves as you type. Link anything to anything and click through: NPC ↔ faction, NPC → location, nested locations, quest ↔ NPCs and locations. Filter by name or tag. |
| **Sessions & notes** | Start a session, then log one-line notes. `@` links an NPC or quest as you type (and can create a new NPC on the spot). The top bar has a quick-note field that works from any screen. Search every note by text, NPC or quest. |
| **Encounters** | Prep monsters (with quantities) and NPCs ahead of time, then send the whole thing to the tracker in one click. |
| **Initiative tracker** | Add from the monster library, your NPCs, a prepped encounter, or quick-add by name. Initiative is rolled on add (one roll per monster group). HP, AC, damage/heal box, conditions (Exhaustion has levels), concentration with the save DC shown when damage lands, Bloodied tag, stat block alongside. Per-row remove; removing the active combatant passes the turn on. Combatants at 0 HP grey out and are skipped. |
| **Rules & spells** | Search-as-you-type over SRD 5.2: 339 spells, the full rules glossary, conditions, core rules, gameplay toolbox, equipment, magic items and 331 monsters. Your own spells, items and house rules sit alongside, tagged **Mine** vs **SRD**. Searching for something the SRD leaves out (Beholder, Artificer…) tells you so and where to look. |
| **Monsters** | SRD stat blocks in the 2024 format, plus your own: create from scratch or duplicate an SRD monster and edit it. Shared across all campaigns. |
| **Dice roller** | Draggable overlay. Any number of die groups (1d12 + 2d4 …), a modifier, repetitions (each listed, grand total underneath), advantage/disadvantage on d20s, and a log that persists. |
| **Timer** | Stopwatch in the top bar; keeps running whatever screen you're on. |

### Shortcuts

`Ctrl+K` jump to anything · `Ctrl+L` lookup · `Ctrl+I` initiative · `Ctrl+J` quick note ·
`Ctrl+D` dice · `Ctrl+T` timer · `Space`/`→`/`←` next/previous turn. (⌘ on macOS.)

## Things worth knowing

- **0 HP skipping** only applies to combatants whose HP you're tracking. Players added with just a
  name and initiative are never skipped; if you do track a PC's HP and they drop to 0, they are
  skipped like anyone else (edit their HP or use Prev to bring them back for death saves).
- **"New combat"** clears monsters and NPCs but keeps anyone marked PC, so the party stays put.
- **SRD entries are read-only.** Duplicate a monster to change it; add your own spells, items and
  rules with the + buttons on the lookup screen.
- **The condition list is editable** (Settings) for tables that run different rules.
- The lookup covers DM-facing reference. Class features, species, feats and backgrounds from the
  SRD are not included.
- Not in this version, by design: battle maps, tokens, player character sheets, sync/accounts,
  AI generation, import/export.

## Regenerating the SRD data (optional)

`data/srd.json` ships ready to use. To rebuild it, clone the two CC-BY-4.0 sources and run:

```
python3 tools/build-srd.py <open5e-api>/data/v2/wizards-of-the-coast/srd-2024 <dndsrd5.2_markdown>/src data/srd.json
```

Sources: github.com/open5e/open5e-api and github.com/springbov/dndsrd5.2_markdown. Bump `version`
in the script when the data changes; the app refreshes its SRD rows on next launch without touching
your own entries.

## Licence and attribution

This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the
Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative
Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.

The same notice appears in the app under Settings → About & credits.
