# Roll Ready: design context

Read this before any UI work (GM window, player view, new Phase 2 screens). It describes who the
app is for, how it should feel, and the visual rules that already exist. When it conflicts with
taste, follow this file; when it conflicts with `CLAUDE.md` conventions, `CLAUDE.md` wins.

## Who uses it, and where

- **A GM running an in-person game**, laptop open behind the screen, often with a **second display
  or TV showing the player view** to the table.
- GMs look at the app for a second or two between bits of narration, in dim light, while talking. They need
  to find the next thing at a glance and act with one click or one key.
- Prep (encounters, NPCs, notes) happens too, but the **at-the-table** case decides layout and
  density questions.
- Two audiences: the GM window is a working tool for one person up close. The player view is
  read from across a table by several people who don't control it.

## Personality: calm, quick, trusty

- **Calm**: nothing flashes, bounces or demands attention unless the GM has to act (concentration
  check, timer expiry, reminder banner). Alerts are rare, so they get noticed.
- **Quick**: the common action is always visible and keyboard-reachable. No confirmation dialogs
  for undoable actions; use a toast with undo instead. No loading spinners for local data.
- **Trusty**: state is never ambiguous. Autosave is quiet but visible somewhere. Numbers (HP, initiative,
  rolls) are always shown in full, not hidden behind hover. Hidden-from-players information
  is clearly marked as GM-only.

## Aesthetic: refine the current direction, don't replace it

A dark, warm "tabletop at night" look. Parchment-toned text on cool charcoal, a single gold accent,
serif headings for a little flavour, a plain sans-serif for everything functional.
Fantasy shows in typography and colour only, never in textures, ornaments, fake parchment,
dragons or skeuomorphism. No D&D or Wizards branding, iconography or trade dress.

### Typography (no external fonts; system stacks only)

- Headings: `Georgia, "Iowan Old Style", serif`, weight 600.
- UI and body: `"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`, base 14px.
- Numbers and dice: `ui-monospace, Consolas, monospace` with `font-variant-numeric: tabular-nums`
  wherever numbers line up in columns (initiative, HP, XP, roll history).
- Player view: much larger type (aim for legibility at 3 m; names ≥ 32px, round/turn ≥ 48px on
  a 1080p display), sans-serif, heavy weight for the active turn.

### Colour tokens (in `renderer/styles.css` `:root`)

| Token | Dark value | Role |
|---|---|---|
| `--bg` | `#15171c` | app background |
| `--panel` / `--panel2` | `#1c1f26` / `#232732` | surfaces, raised controls |
| `--line` / `--line2` | `#313645` / `#3d4356` | dividers, control borders |
| `--text` | `#e6e2d8` | primary text (13.9:1 on bg) |
| `--muted` | `#8f95a3` | secondary text (6.0:1 on bg, 5.0:1 on panel2) |
| `--accent` | `#d9a441` | the one accent: primary buttons, focus, active turn |
| `--accent2` | `#b3452f` | rust: decorative only, **not for text** (3.25:1) |
| `--good` / `--warn` / `--bad` | `#5fae6b` / `#d9a441` / `#cf4c3c` | status |
| `--blue` / `--violet` | `#6ea3d8` / `#a98bd6` | secondary categorisation (conditions, tags) |

Rules:
- Never hard-code a colour in a component; add or reuse a token. (The existing stylesheet has some
  literal hex values to clean up over time.)
- Gold means "this is the active or primary thing". Don't use it for decoration.
- Status is never conveyed by colour alone. Pair it with a label, an icon or a position
  (for example, coarse health in the player view is a word like "Bloodied", not just a red bar).

### Light mode (required)

- Implement as the same token names redefined under `:root[data-theme="light"]`, and follow
  `prefers-color-scheme` when the user hasn't chosen. GM window and player view each have a toggle.
- Direction: warm off-white paper (`~#f6f2e8`) background, near-black ink text, a darker gold
  accent that still passes AA as text on paper. Verify every token pair; don't just invert.

### Accessibility: WCAG 2.2 AA

- Text ≥ 4.5:1, large text and UI component boundaries ≥ 3:1, in both themes.
- Known gaps to fix: placeholder `#5d6370` on input bg is 3.05:1 (raise to ≥ 4.5:1);
  `--bad` `#cf4c3c` on bg is 4.06:1 (lighten slightly for text use); `--accent2` is not a text colour.
- Visible focus ring on every interactive element (2px `--accent` outline with offset); never
  `outline: none` without a replacement.
- Everything in the tracker works by keyboard; shortcuts are shown with `<kbd>` and listed in the
  `?` overlay.
- Respect `prefers-reduced-motion` (motion should be minimal anyway).

## Layout and density

- Dense but breathable: 4px spacing scale (4/8/12/16/24), radius `--radius` 5px.
- The tracker is the most important screen. The active combatant and the next action
  must be the most prominent things on it, and side panels (pins, timers, rolls) must never hide them.
- Prefer inline editing over modals; modals only for focused flows (end combat, emergency NPC).
- The emergency NPC overlay must be usable in a few seconds: big reroll, per-field lock, save.

## Player view

- Shows only `publicState()` data: no GM-only info, ever.
- Large, high-contrast list: round number, the active turn highlighted with the accent plus a
  marker (not colour alone), conditions as text chips, coarse health words.
- Chrome (full-screen and theme buttons) fades out when idle; cursor hides when idle.
- No animation beyond a short, gentle highlight when the turn changes.

## Copy

- Say "GM", never "DM". Short, plain, friendly; verbs on buttons ("Run encounter", "Roll").
- The CC-BY attribution in Settings → About stays verbatim.
