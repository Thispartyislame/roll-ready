# Roll Ready: product context

Read this and `DESIGN.md` before any UI work (GM window, player view, new Phase 2 screens). Together
they describe who the app is for, how it should feel, and the visual rules that already exist. When
they conflict with taste, follow these files; when they conflict with `CLAUDE.md` conventions,
`CLAUDE.md` wins.

## Who uses it, and where

- A GM running an in-person game, laptop open behind the screen, often with a second display or TV
  showing the player view to the table.
- GMs look at the app for a second or two between bits of narration, in dim light, while talking.
  They need to find the next thing at a glance and act with one click or one key.
- Prep (encounters, NPCs, notes) happens too, but the at-the-table case decides layout and density
  questions.
- Two audiences: the GM window is a working tool for one person up close. The player view is read
  from across a table by several people who don't control it.

## Personality: calm, quick, trusty

- **Calm:** nothing flashes, bounces or demands attention unless the GM has to act (concentration
  check, timer expiry, reminder banner). Alerts are rare, so they get noticed.
- **Quick:** the common action is always visible and keyboard-reachable. No confirmation dialogs for
  undoable actions; use a toast with undo instead. No loading spinners for local data.
- **Trusty:** state is never ambiguous. Autosave is quiet but visible somewhere. Numbers (HP,
  initiative, rolls) are always shown in full, not hidden behind hover. Hidden-from-players
  information is clearly marked as GM-only.

## Copy

- Say "GM", never "DM". Short, plain, friendly; verbs on buttons ("Run encounter", "Roll").
- The CC-BY attribution in Settings → About stays verbatim.
