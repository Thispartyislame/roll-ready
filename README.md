# Roll Ready

A local-first desktop app for game masters: prep a campaign, then run it at the table. World notes,
a session log, an encounter builder, an initiative tracker with a player-facing view, rules and
spell lookup, dice, timers and generators. 5E compatible, built for the 2024 rules with SRD 5.2 as
the bundled rules data. Works fully offline; no account, no server.

**New to Roll Ready? Read the [user guide](docs/USER-GUIDE.md)** for a walk-through of every
feature, with screenshots.

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
npm run dist:win     # on Windows  -> dist/Roll Ready Setup x.y.z.exe
npm run dist:mac     # on a Mac    -> dist/Roll Ready-x.y.z.dmg
```

Build each on its own OS (a Mac build can't be made on Windows). The builds are unsigned, so
Windows SmartScreen and macOS Gatekeeper will warn the first time: on Windows choose
"More info → Run anyway"; on macOS right-click the app → Open.

## Where your data lives

One SQLite file, created on first launch:

- Windows: `%APPDATA%\Roll Ready\roll-ready.sqlite`
- macOS: `~/Library/Application Support/Roll Ready/roll-ready.sqlite`

Settings → "Show in folder" opens it. Copy the file to back it up or move it to another computer.
Set the `ROLLREADY_DB` environment variable to point the app at a different file.

**Upgrading from version 1 (DM Helper):** on first launch Roll Ready copies your old
`DM Helper/dm-helper.sqlite` to the new location and upgrades the copy. The old file is left alone.

## What's in it

| Area | What it does |
|---|---|
| **NPCs, Locations, Factions, Quests** | Type a name, press Enter, it exists. Every field saves as you type. Link anything to anything and click through. Filter by name or tag. |
| **Party** | Add your players' characters once per campaign (name, AC, max HP, initiative bonus). They load into the tracker with every encounter. |
| **Sessions & notes** | Start a session, then log one-line notes. `@` links an NPC or quest as you type. The top bar has a quick-note field that works from any screen. Search every note by text, NPC or quest. |
| **Encounters** | Add monsters with quantities, optional table names and fixed HP. Shows total XP and a difficulty label (Low / Moderate / High) for your party size and level. **Run encounter** loads every creature plus the party into the tracker, numbered (Goblin 1, Goblin 2…), with average or rolled hit points. |
| **Initiative tracker** | Add from the monster library, NPCs, a prepped encounter, the party, or quick-add by name. HP, AC, damage/heal, conditions, concentration (with the save DC when damage lands), Bloodied tag, stat block alongside. A banner reminds you of conditions, concentration and timers when a combatant's turn starts. **End combat…** saves who's standing to the session log. The whole state survives a restart. |
| **Player view** | A separate read-only window for a second monitor, projector or shared screen: turn order, whose turn it is, round, conditions and (optionally) Healthy / Bloodied / Near death. Never shows HP numbers, stat blocks, notes or hidden combatants. Pop it out from the tracker, send it to a display, F11 for full screen. Light and dark themes. |
| **Dice** | Quick-roll bar in the top bar (`2d6+3`, `d20`, `4d6kh3`, `2d20kl1+5`, `d%`), click-to-roll numbers in stat blocks, a draggable roller with history, and "→ notes" to log a roll to the live session. Every die is shown, dropped dice in parentheses. |
| **Timers** | Any number of named countdowns, in real time (`60:00`) or combat rounds. Round timers tick when the tracker starts a new round, can be attached to a combatant, and turn red when they expire. The stopwatch is still in the top bar. |
| **Rules & spells** | Search-as-you-type over SRD 5.2: spells, rules glossary, conditions, equipment, magic items and monsters, with your own entries alongside. **Pin** any entry to keep it beside the initiative tracker. Searching for something the SRD leaves out says so and offers to add it as a homebrew monster. |
| **Monsters** | SRD stat blocks in the 2024 format plus your own. Filter by CR, type and source. Create from scratch, or duplicate one and edit it. |
| **Generators** | NPC names in five styles, tavern names, shops and stock, rumors, weather and treasure by CR tier. Reroll with `R`, save a result to the campaign, copy it, or add it to the session notes. Every table is editable and you can add your own. |
| **Soundboard** | A grid of buttons, each loaded with a sound, a picture or video for the player view, or a picture and a sound together. Press a button (or `1`–`9`, `0`) to play, press again to stop, `Esc` stops everything. Each button can have a time limit after which it stops and its picture disappears, plus volume and loop. **Pop out board** (`Ctrl+Shift+B`) opens the buttons in a small window that stays on top and can be moved anywhere. |
| **Scenes and volume** | A soundboard button can be a *scene* that starts several other buttons at once (rain, music and a map) and stops them together. Buttons can fade in and out, and Music and Effects each have their own master volume. |
| **Pictures for the players** | Attach a picture to any NPC, location or monster, then **Show to players** puts it on the player view until you hide it. Also available from the tracker's side panel. |
| **Session recording** | **● Rec** in the top bar records the session from your microphone into an audio file attached to the live session. Stop it there or from the session's page, where each recording has **Show in folder**. |
| **Backup and restore** | Settings → Your data → **Back up everything…** writes one .zip with every campaign, the soundboard files, pictures and recordings. **Restore from a backup…** replaces everything with a backup, after saving a safety copy of what you had. |
| **Emergency NPC** | `Ctrl+N` from anywhere: a named character with a role, look, voice, want, secret and hook, instantly. Lock the parts you like and reroll the rest; filter by setting, attitude and naming style; save as an NPC tagged `emergency`. |
| **Command palette** | `Ctrl+K`: jump to anything by name or tag, run an action (next turn, start timer, run an encounter, pop out the player view…), or type a roll. |

### Shortcuts

Press `?` on any screen for the full list. (⌘ in place of Ctrl on macOS.)

| Keys | What it does |
|---|---|
| `Ctrl+K` | Command palette |
| `Ctrl+E` | Quick roll |
| `Ctrl+D` | Dice roller and history |
| `Ctrl+N` | Emergency NPC |
| `Ctrl+J` | Quick note to the live session |
| `Ctrl+I` / `Ctrl+L` | Initiative tracker / rules lookup |
| `Ctrl+T` | Start or pause the stopwatch |
| `Ctrl+Shift+P` | Pop out or close the player view |
| `Ctrl+Shift+B` | Pop out or close the soundboard |
| `Space` `→` `N` / `←` `P` | Next / previous turn (tracker) |
| `↑` `↓` | Select a combatant (tracker) |
| `D` / `H` | Damage / heal the selected combatant |
| `C` | Conditions menu; then the key beside each condition |
| `V` | Hide or show the selected combatant in the player view |
| `R` | Reroll (Generators, Emergency NPC) |
| `F11` / `Esc` | Player view full screen on / off |

## Things worth knowing

- **0 HP skipping** only applies to combatants whose HP you're tracking. Players added with just a
  name and initiative are never skipped; if you do track a PC's HP and they drop to 0, they are
  skipped like anyone else (edit their HP or use Prev to bring them back for death saves).
- **"End combat…"** clears monsters and NPCs but keeps anyone marked PC, so the party stays put.
- **Encounter difficulty** uses an XP budget per character that you can edit under Settings. The
  defaults are the table from SRD 5.2.
- **The player view is a window on this computer**, not a web page: drag it to a second monitor or
  share that window in your video call. It does not reach players' own devices.
- **Expired timers are flagged, not removed** — click an expired chip to clear it.
- **Light and dark themes.** The app follows your system setting until you choose: use the theme
  switch at the bottom of the sidebar or Settings → Appearance. The player view has its own.
- **Deleting doesn't ask first.** The entry goes at once and a message offers Undo for a few
  seconds. Removing a combatant and clearing the tracker work the same way. Only deleting a whole
  campaign asks for confirmation.
- **Soundboard files are copied into the app**, into a `roll-ready-media` folder next to the data
  file, so buttons keep working if you move the originals. Back that folder up along with the data
  file. Sound plays on this computer; pictures and video show on the player view, so pop it out
  first. Supported: mp3, wav, ogg, m4a, aac, flac, opus; png, jpg, gif, webp; mp4, webm, mov.
- **Recordings** are `.webm` audio files (Opus, about 20 MB an hour) in a `roll-ready-recordings`
  folder next to the data file. They play in any browser and in VLC, and transcription tools accept
  them. Roll Ready does not transcribe or upload them. Tell your players before you record; in
  some places recording people without their consent is illegal.
- **Backups** hold up to 4 GB. The safety copies made before a restore are kept in a
  `roll-ready-backups` folder next to the data file; delete old ones when you no longer need them.
- **Generator content is original** to this app; edit or replace any of it under Generators.
- **SRD entries are read-only.** Duplicate a monster to change it; add your own spells, items and
  rules with the + buttons on the lookup screen.
- **The condition list is editable** (Settings) for tables that run different rules.
- The lookup covers GM-facing reference. Class features, species, feats and backgrounds from the
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
