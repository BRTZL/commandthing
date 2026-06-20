# Plan: Tailwind migration (Chromium-69-safe)

Migrate the dashboard from hand-written `styles.css` to **Tailwind CSS v3** with
shadcn-style HSL design tokens, swap the custom hash router for **react-router
(HashRouter)**, and replace the custom toast with **sonner** — all while staying
renderable on the device's **Chromium 69** (2018) engine.

## Hard constraints (every task)

- **Tailwind v3, NOT v4.** v4 emits `oklch()`, `@property`, `@layer` — none render
  on Chromium 69. Use `tailwindcss@^3.4` + `postcss` + `autoprefixer`.
- **No `oklch`** anywhere. Tokens are **HSL** (`hsl(var(--token))`), shadcn-style.
- **No flex `gap` utilities** (`gap-*` on a flex container is broken on Chrome 69).
  Use `space-x-*`/`space-y-*` (margin-based) or CSS grid (`grid` + `gap-*` is fine
  on grid since Chrome 66). This mirrors the existing hand-CSS discipline.
- **Avoid** `aspect-*`, `backdrop-*`, `inset-0`-style shorthand that emits the
  `inset:` property, and arbitrary modern color functions.
- The production build already uses `@vitejs/plugin-legacy` (legacy-only, chrome69
  target). Tailwind output passes through it; keep it that way.
- After each task **`bun run build` must pass** and **`bunx biome check .`** must
  be error-free (the repo's strict Biome config; `useExhaustiveDependencies`
  warnings on bind-once effects are pre-existing and acceptable).

## Design tokens (define once, Task 1)

Define shadcn-style HSL CSS variables on `:root`, mapped from the current palette,
and wire them into `tailwind.config.js` `theme.extend.colors` as `hsl(var(--x))`.

| token | current hex | role |
|---|---|---|
| `--background` | `#0b0c10` | app background |
| `--card` | `#14161e` | panel |
| `--card-2` | `#1a1d28` | raised panel / cards |
| `--border` | `#2a2f3d` | borders/lines |
| `--foreground` | `#eef0f6` | primary text |
| `--muted` | `#9298ab` | muted text |
| `--accent` | `#7aa2f7` | accent / selection / primary |
| `--working` | `#3ddc91` | session state |
| `--waiting` | `#f7b948` | session state |
| `--idle` | `#5b6172` | session state |

Convert each hex to an `H S% L%` triplet for the variable (so `hsl(var(--accent))`
works, and opacity modifiers like `bg-accent/30` work).

## Tasks

### Task 1 — Tailwind setup + token theme + spike (SessionCard)  [DEVICE GATE]
Install Tailwind v3 + postcss + autoprefixer. Add `tailwind.config.js` (content:
`./index.html`, `./src/**/*.{ts,tsx}`) and `postcss.config.js`. Replace the
`@import`-less top of styling: create `src/index.css` with `@tailwind base;
@tailwind components; @tailwind utilities;` plus the `:root` token block, and
import it from `main.tsx`. **Keep the existing `styles.css` imported too** so the
not-yet-converted components keep working (coexistence during migration).
Convert **only `SessionCard.tsx`** to Tailwind utility classes using the tokens
(remove its dependence on `.card*` rules; leave those rules in `styles.css` for
now — they'll be deleted when the board is converted). `bun run build` passes.
> Controller verifies on the actual device that Tailwind renders before Task 2.

### Task 2 — App shell + TopBar/tabs + BoardPage
Convert the shell containers (`.device`, `.page`, `.topbar` in `App.tsx`),
`TopBar.tsx` (tab bar, cost chip, clock, conn dot), and `BoardPage.tsx` (board
layout, `session-list` incl. its `padding-bottom`, the `.empty` state) to
Tailwind. Delete the corresponding now-unused rules from `styles.css`. Preserve
the `.card.selected` scroll behavior (the `.card.selected` query selector in
BoardPage must still match — keep a `selected` class or switch the query to a
data attribute). `bun run build` passes.

### Task 3 — SessionPage + UsagePage + PlaceholderPage
Convert the session detail (`SessionPage.tsx`: header, chips, timeline items,
todos), `UsagePage.tsx` (provider cards, progress bars, text rows, bar chart),
and `PlaceholderPage.tsx` to Tailwind. Delete their rules from `styles.css`. Keep
the `dial-scroll` class on the scroll containers (App's wheel handler queries it).
`bun run build` passes.

### Task 4 — Router → react-router HashRouter
Add `react-router-dom`. Replace `src/router.ts` with react-router `HashRouter` +
`Routes`, preserving exactly: routes for the 4 tabs + `/session/:id`, the
`goToTab`/`openSession`/`goBack` helpers (reimplement over react-router's
navigation), and `useRoute()` semantics consumed by `App.tsx`/`TopBar.tsx`. The
hardware nav (preset→tab, dial-press→open, back→goBack) must keep working
unchanged. `bun run build` passes.

### Task 5 — sonner for toasts  [DEVICE GATE]
Add `sonner`. Replace the custom `NotificationOverlay` toast UI with sonner's
`<Toaster />` + `toast(...)`, preserving the behavior: fire a tappable toast (that
opens the session) when a session transitions into needs-you (not on first load).
Keep the transition-detection logic; only swap the presentation.
> Controller verifies sonner renders on the device's Chromium 69. If it doesn't,
> fall back to the existing custom toast styled with Tailwind.

### Task 6 — Remove custom CSS + final cleanup
Delete any remaining rules in `styles.css` (ideally delete the file; keep only
Tailwind base/tokens in `index.css`). Confirm no component references removed
classes. `bun run build` + `bunx biome check .` clean. Controller does a final
on-device verification of all tabs + nav.

## Notes for implementers
- This is a Vite + React + TypeScript app built with Bun. Build: `bun run build`
  (in `dashboard/`). Lint/format: `bunx biome check .` (repo root).
- Do **not** touch `server/` (the feeder) or the `hardware.ts` 8890 logic.
- Keep class lists readable; extract a small helper or `clsx`-style join only if a
  component already needs conditional classes (don't add a dependency for it —
  template strings are fine).
- The app is always dark; no light-mode/theme-toggle needed.
