# Roll Ready: design context

Read this and `PRODUCT.md` before any UI work (GM window, player view, new Phase 2 screens). When
this file conflicts with taste, follow this file; when it conflicts with `CLAUDE.md` conventions,
`CLAUDE.md` wins.

## Aesthetic: refine the current direction, don't replace it

A dark, warm "tabletop at night" look. Parchment-toned text on cool charcoal, a single gold accent,
serif headings for a little flavour, a plain sans-serif for everything functional. Fantasy shows in
typography and colour only, never in textures, ornaments, fake parchment, dragons or skeuomorphism.
No D&D or Wizards branding, iconography or trade dress.

## Typography (no external fonts; system stacks only)

- **Headings:** `Georgia, "Iowan Old Style", serif`, weight 600.
- **UI and body:** `"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`,
  base 14px.
- **Numbers and dice:** `ui-monospace, Consolas, monospace` with
  `font-variant-numeric: tabular-nums` wherever numbers line up in columns (initiative, HP, XP, roll
  history).
- **Player view:** much larger type (aim for legibility at 3 m; names ≥ 32px, round/turn ≥ 48px on a
  1080p display), sans-serif, heavy weight for the active turn.

## Colour tokens (in `renderer/styles.css` `:root`)

| Token | Dark value | Role |
|---|---|---|
| `--bg` | `#15171c` | app background |
| `--panel` / `--panel2` | `#1c1f26` / `#232732` | surfaces, raised controls |
| `--line` / `--line2` | `#313645` / `#3d4356` | dividers, control borders |
| `--text` | `#e6e2d8` | primary text (13.9:1 on bg) |
| `--muted` | `#8f95a3` | secondary text (6.0:1 on bg, 5.0:1 on panel2) |
| `--strong` / `--soft` | `#cfc8b8` / `#b9bfcc` | sub-headings; chip and log text |
| `--placeholder` | `#8b91a0` | placeholder text (≥ 4.5:1 on `--input`) |
| `--control` | `#6a7186` | borders of inputs and buttons (≥ 3:1 on every surface) |
| `--input` / `--sunken` / `--hair` / `--chip` | `#12141a` / `#181a20` / `#23262f` / `#2a2f3c` | field fill, recessed areas, row dividers, neutral chips |
| `--accent` / `--on-accent` | `#d9a441` / `#1a1408` | the one accent: primary buttons, focus, active turn; text on it |
| `--accent2` | `#b3452f` | rust: decorative only, not for text (3.25:1) |
| `--good` / `--warn` / `--bad` / `--orange` | `#5fae6b` / `#d9a441` / `#e2685a` / `#e8823a` | status |
| `--blue` / `--violet` / `--info` | `#6ea3d8` / `#a98bd6` / `#9aa0f0` | secondary categorisation (conditions, tags, concentration) |

Tinted chips and banners are derived, not hand-picked: `--x-bg` is 20% of the colour mixed into
`--bg`, `--x-fg` is 45% mixed into `--text` (`--accent-bg`, `--accent-bg2`, `--good-bg`/`-fg`, and so
on). Light values for every token are in `:root[data-theme="light"]` in the same file.

Rules:

- Never hard-code a colour in a component; add or reuse a token. (Both stylesheets now contain no
  colour literals outside the token blocks.)
- Gold means "this is the active or primary thing". Don't use it for decoration.
- Status is never conveyed by colour alone. Pair it with a label, an icon or a position (for
  example, coarse health in the player view is a word like "Bloodied", not just a red bar).

## Light mode (required)

- Implement as the same token names redefined under `:root[data-theme="light"]`, and follow
  `prefers-color-scheme` when the user hasn't chosen. GM window and player view each have a toggle.
  (Built: `js/theme.js` for the GM window, with the toggle at the bottom of the sidebar and in
  Settings → Appearance; the player view's is in its own window and in the tracker's Player view menu.)
- Direction: warm off-white paper (~`#f6f2e8`) background, near-black ink text, a darker gold accent
  that still passes AA as text on paper. Verify every token pair; don't just invert.

## Accessibility: WCAG 2.2 AA

- Text ≥ 4.5:1, large text and UI component boundaries ≥ 3:1, in both themes.
- Fixed gaps, for the record: placeholder was 3.05:1 (now `--placeholder`); `--bad` was 4.06:1 on bg
  (lightened to `#e2685a`); `--accent2` is no longer used as a text colour.
- When adding a colour pair, check it in both themes. Easy ones to miss: muted text on a tinted or
  highlighted row.
- Visible focus ring on every interactive element (2px `--accent` outline with offset); never
  `outline: none` without a replacement.
- Everything in the tracker works by keyboard; shortcuts are shown with `<kbd>` and listed in the
  `?` overlay.
- Respect `prefers-reduced-motion` (motion should be minimal anyway).

## Layout and density

- Dense but breathable: 4px spacing scale (4/8/12/16/24), radius `--radius` 5px.
- The tracker is the most important screen. The active combatant and the next action must be the
  most prominent things on it, and side panels (pins, timers, rolls) must never hide them.
- Prefer inline editing over modals; modals only for focused flows (end combat, emergency NPC).
- The emergency NPC overlay must be usable in a few seconds: big reroll, per-field lock, save.

## Player view

- Shows only `publicState()` data: no GM-only info, ever.
- Large, high-contrast list: round number, the active turn highlighted with the accent plus a marker
  (not colour alone), conditions as text chips, coarse health words.
- Chrome (full-screen and theme buttons) fades out when idle; cursor hides when idle.
- No animation beyond a short, gentle highlight when the turn changes.
