# Build prompt: Roll Ready (desktop app, Phase 2)

## Project summary

This is Phase 2 of **Roll Ready**, an existing local-first desktop app that helps tabletop RPG game masters (GMs) prep and run campaigns, with built-in support for fifth-edition-compatible rules (the 2024 revision). **Phase 1 is already built and working**: campaign/world data (NPCs, locations, factions, quests), session notes, initiative tracker, SRD 5.2 rules/spell lookup, and a utility stopwatch. Read the existing codebase, architecture note, and schema before changing anything, and follow the established stack, conventions, and storage approach. Do not re-choose the stack.

Phase 2 theme: **table speed and combat polish.** The goal is to make running a fight noticeably smoother and to make prepped encounters usable at the table with one click. This phase should mostly build on the existing architecture, not introduce new infrastructure.

## Naming and branding (unchanged from Phase 1)

- The app is called **Roll Ready**. All user-facing copy, including every new Phase 2 screen, tooltip, menu, and generator label, says "GM" or "Game Master," never "DM" or "Dungeon Master." (This prompt uses "DM" as shorthand in places; don't carry that into the UI.)
- Do not use "Dungeons & Dragons," "D&D," "Dungeon Master," or any Wizards of the Coast branding in the app's name, icon, or UI. Stating "5E compatible" descriptively is fine.

## Ruleset and licensing (unchanged from Phase 1)

- Build against the D&D 2024 revised rules (5.5e), using **SRD 5.2** (CC-BY-4.0) as the only built-in rules/monster data source. Keep the CC-BY-4.0 attribution notice in the About/Credits screen.
- Do not ship or scrape non-SRD text from the core rulebooks or D&D Beyond.
- **Important for the encounter builder:** do not assume the 2024 Dungeon Master's Guide encounter-building tables (XP budgets by character level and difficulty) are part of SRD 5.2. Verify what SRD 5.2 actually includes. If the budget thresholds are not covered by the SRD license, do not hardcode them. Instead, make the thresholds an editable data table the DM can fill in or adjust from their own books, and ship only license-safe defaults (monster XP values by CR from the SRD stat blocks are fine). Note what you found and decided in the architecture note.
- Any built-in generator content (names, tavern names, rumors, loot tables) must be **original content written for this app**, not copied from published tables.

## Design priorities (in order)

1. **Speed at the table.** Same as Phase 1: anything used mid-combat must respond instantly, with no spinners for local data.
2. **Fewer clicks from prep to play.** A fight prepped last week should load into the tracker in one action.
3. **Keyboard-friendly.** A DM with one hand on the mouse and one on dice should be able to do common things from the keyboard.
4. **Don't overbuild.** No virtual tabletop, battle maps, tokens, cloud accounts, or AI features. Those remain out of scope.

## Data model changes

Extend the existing schema with migrations. Do not break existing Phase 1 data.

- **Monster**: already a shared library from Phase 1. Add support for user-created homebrew monsters (source = "homebrew"), including editing and duplicating (duplicate an SRD monster into an editable homebrew copy for reskinning, e.g. rename and tweak stats).
- **Encounter**: extend with a structured monster list (monster FK + quantity + optional custom name/HP override per instance), computed total XP, and a difficulty label derived from the configurable threshold table.
- **DifficultyThreshold**: new editable table keyed by character level and difficulty tier (see licensing note above).
- **Timer**: new entity for named countdown timers (label, duration, remaining, running/paused, optional unit of "seconds" or "rounds", optional link to a combatant).
- **RollLog**: dice roll history (expression, individual dice results, total, timestamp, optional link to session and combatant). Rolls made during a live session should be loggable to that session's notes on request.
- **GeneratorTable**: user-editable roll tables (name, category, entries with optional weights) so DMs can extend or replace the built-in ones. The emergency NPC generator (feature 10) uses this same system, with one category per backstory field (occupation, appearance, mannerism, want, secret, hook, etc.).
- **CombatState persistence**: the initiative tracker's current state (combatants, HP, conditions, round, turn) should survive an app restart, so a crash or accidental close mid-fight doesn't lose the encounter.

## Feature scope (Phase 2: build all of this)

### 1. Integrated dice roller
- Parse standard dice expressions (e.g. `2d6+3`, `1d20`, `4d6kh3`, advantage/disadvantage as `2d20kh1` / `2d20kl1`), with clear error handling for invalid input.
- A quick-roll bar always reachable from the main UI, plus inline roll buttons in the initiative tracker: roll initiative for all combatants, roll an attack or damage from a monster's stat block action, roll a death/concentration save.
- Show individual die results as well as the total, not just the sum.
- Roll history panel (recent rolls), with an option to log a roll to the current session's notes.
- Rolling must feel instant. No animation delays that slow the DM down (a brief, optional visual flourish is fine if it can be disabled).

### 2. Monster library and encounter builder
- Browse and search the full monster library (SRD plus homebrew) with filters for CR, creature type, and source.
- Homebrew monster editor: create from scratch or duplicate-and-edit an existing monster.
- Encounter builder: add monsters with quantities, see total XP and the difficulty label for a chosen party level and size. Party size/level should be saved per campaign.
- If a monster the DM wants isn't in the library (SRD gap), offer a fast "add as homebrew" path from the empty search state, building on the Phase 1 "check your Monster Manual" message.

### 3. Saved encounters into the tracker
- One-click "Run encounter": loads every monster from a saved encounter into the initiative tracker as combatants, with HP rolled or set to average (a per-encounter toggle), numbered when there are duplicates (Goblin 1, Goblin 2...).
- Players/PCs added once per campaign should persist as a reusable party list that loads into the tracker alongside encounters.
- After combat, option to save the final state (who survived, notes) back to the session log.

### 4. Countdown timers
- Build on the Phase 1 stopwatch. Support **multiple named countdown timers** running at the same time (e.g. "Bless: 10 rounds", "Torch: 60:00").
- Timers can count in real seconds or in **combat rounds**. Round-based timers should tick down automatically when the initiative tracker advances a round, and visibly flag when they expire.
- Timers can be attached to a specific combatant (e.g. a spell effect) and are removed or flagged if that combatant is removed.
- The existing stopwatch stays as is.

### 5. Condition and effect reminders in the tracker
- Show a clear visual reminder when a combatant with active conditions starts their turn (e.g. a banner listing their conditions).
- Show which combatants are concentrating and prompt for a concentration check reminder when they take damage (reminder only; the DM resolves the roll).
- Keep this unobtrusive and dismissible. It must not slow down turn advancement.

### 6. Player-facing view
- A simplified, read-only second window designed to be shown on a second monitor, projector, or shared screen. It shows initiative order, whose turn it is, round number, and publicly visible conditions. It must **never** show DM notes, monster HP numbers, monster stat blocks, or hidden combatants.
- Per-combatant visibility controls: hidden combatants don't appear at all; monsters can show a coarse health state (e.g. "healthy / bloodied / near death") instead of numbers, with a DM toggle to turn that off.
- Updates live as the DM changes the tracker, with no manual refresh.
- Implement this as a second app window (local only). Do not build a network server or require devices on the same network in this phase.
- **Pop-out and second-monitor support.** A single "Pop out player view" button (and a shortcut/command-palette action) opens the player view as its own native window, separate from the main GM window.
  - The window must be freely movable and resizable, so it can be dragged onto a second monitor or projector like any normal window.
  - Provide a one-click full-screen toggle (and Esc to exit) that goes full-screen on whichever monitor the window currently sits on.
  - If more than one display is connected, let the GM choose which display to open it on (e.g. a small "Send to display..." menu listing connected monitors).
  - Remember the window's size, position, and display between launches. If the saved monitor is no longer connected, fall back gracefully to the primary display instead of opening off-screen.
  - Closing the player window must not affect the main window or lose any tracker state, and re-opening it should restore the current view instantly.
  - Keep the player window clean for a shared screen: hide menus, toolbars, and cursor chrome as far as the platform allows, and use large, high-contrast text readable from across a table. Include a light/dark option.

### 7. Generators
- Table-driven random generators: NPC names (by a few broad cultural/fantasy styles), tavern/inn names, shop names and inventories (flavor level, not full item pricing), rumors, simple weather, and a basic treasure roller scaled by CR tier.
- Each generator has a one-click "reroll" and a "save to campaign" action (e.g. turn a generated name into a new NPC stub, or a tavern name into a new Location).
- All generator tables are editable by the DM (see GeneratorTable above).

### 8. Command palette and keyboard shortcuts
- A global command palette (e.g. Ctrl/Cmd+K) to jump to any NPC, location, faction, quest, monster, spell, or rule by typing, and to trigger common actions (new note, roll dice, start timer, next turn).
- Keyboard shortcuts for the high-frequency tracker actions: next turn, previous turn, apply damage/healing to the selected combatant, toggle a condition.
- A discoverable shortcut reference screen.

### 9. Pinned reference panels
- Let the DM pin a monster stat block, spell, or rule entry into a side panel that stays visible next to the initiative tracker, so they aren't flipping between screens mid-combat.
- Support pinning at least a few entries at once, persisted for the session.

### 10. Emergency NPC generator
For the moment a player does something unexpected and the DM needs a named, playable character *right now*. This is a dedicated, fast-access feature, not just another entry in the generators list, and it must be usable in a few seconds mid-session.

- **One-action access.** Reachable from anywhere via a global shortcut, a command palette action ("Emergency NPC"), and a persistent button in the main UI. It opens a compact panel or overlay (not a full screen change) and **immediately shows a complete result with no setup**. Any options below are optional refinements applied after the first result appears.
- **What it generates** (table-driven, assembled from combinable pieces so results feel varied): a name, a one-line "who they are" (occupation or role), a short appearance detail, a voice or mannerism the DM can act out, what they want right now, a secret or complication, and a hook connecting them to the party or the current situation. Keep the whole result short enough to read at a glance. A few lines, not paragraphs.
- **Quick context filters (optional, one tap each):** setting type (city, village, wilderness/road, dungeon, noble court, underworld, etc.), attitude toward the party (friendly, neutral, hostile, scared, shady), and a broad naming style. A "surprise me" default requires no filters.
- **Lock and reroll.** Each field has its own reroll button and a lock toggle, so the DM can keep a name they like and reroll only the secret. A "reroll all unlocked" button and shortcut regenerate everything else in one action.
- **Species/ancestry is optional.** If included, draw only from SRD 5.2 species plus any the DM has added themselves, and allow turning it off entirely so results work for non-5e tables.
- **Save to campaign in one click.** Turn the result into a new NPC (Phase 1 NPC entity: name, description, personality/voice notes, tags) with an optional link to the current location and/or a faction. Also offer "copy as text" and "append to current session notes" (using the Phase 1 note system) so a quickly invented NPC isn't lost. Saved emergency NPCs get an "emergency" tag so the DM can find and flesh them out between sessions.
- **History.** Keep the last 20 or so generated NPCs in a short list so the DM can go back to one that was rerolled away or that they decided later they wanted.
- **Tables and content.** Uses the editable GeneratorTable system (see Data model), with separate tables per backstory field so the DM can add or edit entries. All built-in content must be **original, written for this app**, including names, and must not reuse names of published characters, real people, or trademarked settings.
- **Future-proofing:** structure the generator so its output is a plain object of named fields. Phase 3 may add an optional AI-written version behind the same interface. Do not build any AI generation now.

## Suggested build order

Dependencies mean a sensible order is: dice roller, then monster library/homebrew editor, then encounter builder, then saved-encounter loading into the tracker, then countdown timers and condition reminders (both hook into the tracker), then the player-facing view, then generators, then the emergency NPC generator (it reuses the generator tables and the NPC and note features), then the command palette and pinned panels. Wire the emergency NPC action into the command palette when that lands. If scope needs to be trimmed, the minimum useful Phase 2 is: dice roller, encounter-into-tracker, countdown timers, and the player-facing view.

## Non-goals for this build (explicitly exclude)

- Battle maps, grid combat, tokens, fog of war
- Player character sheet management
- Cloud accounts, multiplayer sync, or any required network connection
- AI-assisted content generation (still Phase 3)
- Import/export or content sharing between users (still Phase 3)
- Automatically resolving rules (applying damage from rolls, auto-ending conditions); the app reminds, the DM decides

## Deliverables

1. An updated architecture note covering any new libraries, the second-window approach for the player view, and the licensing decision on encounter difficulty thresholds.
2. Schema migrations for the changes above, with existing Phase 1 data preserved.
3. Working UI for all ten Phase 2 features above.
4. Updated README covering new features, keyboard shortcuts, and how to run it locally.

## Open questions to flag back to the user rather than assume

- Whether the player-facing view should later also support players' own devices over the local network (this build uses a second window only).
- Whether SRD 5.2 covers the encounter difficulty thresholds. Report what you found and how you handled it.
- Whether DMs want round-based timers to auto-expire (remove themselves) or only flag, if the answer isn't clear from testing. Default to flagging, not silently removing.
