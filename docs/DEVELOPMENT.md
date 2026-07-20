# Development Guide

Day-to-day workflow for building, previewing, and deploying the Car Thing
dashboard. For the architecture overview see **[README.md](../README.md)**; for
the one-time device flashing see **[DEVICE-BRINGUP.md](DEVICE-BRINGUP.md)**.

## Prerequisites

- **[Bun](https://bun.sh)** — runs the feeder, the scripts, and the dashboard build.
- **adb** (`brew install android-platform-tools`) — only needed to talk to the
  physical device. Not needed for browser-only development.
- One-time: `cd dashboard && bun install`.

## The three loops

There are three ways to run the app, from fastest-iteration to most-faithful:

| Loop | Command | Where you look | Use it for |
|---|---|---|---|
| **Browser dev (HMR)** | `bun run feeder` + `bun run ui` | `http://localhost:5173` | Fast UI iteration; instant hot reload |
| **Production preview** | `bun run preview` | `http://localhost:4000` | Verifying the real Chromium-69 build on your Mac |
| **On device** | `bun run deploy` (see below) | the Car Thing | Final verification on real hardware |

### Browser dev (two terminals)

```bash
bun run feeder      # terminal 1 — data server on :4000 (WS at /ws, hook receiver)
bun run ui          # terminal 2 — Vite dev server on :5173 (hot reload)
# open http://localhost:5173
```

The `ui` script sets `VITE_WS_URL=ws://localhost:4000/ws`, so the dev server's UI
pulls live data from the feeder even though it's served from a different port.
(Without that, the page would try `ws://localhost:5173/ws` and get no data.)

> ⚠️ Vite dev is **modern, un-minified, no legacy transform** — it is *not* what
> runs on the device. It can render fine here and still break on Chromium 69.
> Always do a `bun run preview` (or deploy) pass before trusting a change.

### Production preview

```bash
bun run preview     # builds dashboard/dist, then serves it via the feeder on :4000
# open http://localhost:4000
```

This is the **exact bundle the device loads** (legacy SystemJS, CSS inlined),
just rendered by your Mac's modern Chrome instead of the device's Chromium 69.

## Scripts reference

```bash
# build
bun run build            # build the on-device UI bundle  -> dashboard/dist
bun run check            # Biome: lint + format + autofix (run before committing)
bun run lint             # Biome lint only
bun run format           # Biome format --write

# run the feeder (Mac data server, :4000)
bun run feeder           # serve dist/ + /ws + hook receiver
bun run feeder:dev       # same, restart on server-code changes

# local development (browser)
bun run ui               # Vite HMR dev server on :5173 (talks to the feeder)
bun run preview          # build + serve the production bundle on :4000

# device (Car Thing over adb)
bun run device:connect   # watchdog: keep `adb reverse tcp:4000` alive (run in its own terminal)
bun run deploy           # build + hard-reload the kiosk  ← the main one
bun run device:reload    # just reload the kiosk (no rebuild)
bun run device:shot      # screenshot the screen          -> device-shot.png
bun run device:open /usage   # navigate the kiosk to a route
bun run device:info      # print the kiosk's url / UA / viewport
```

## Deploying to the device

The kiosk loads the UI **from this Mac's feeder** over a USB tunnel — it doesn't
store the app. So "deploy" means *rebuild `dist` and tell the kiosk to reload*;
there's nothing to copy onto the device.

Two tunnels are involved (both over `adb`, i.e. over USB):

```
  reverse tcp:4000  →  device localhost:4000 reaches the Mac feeder   (UI + WebSocket)
  forward tcp:2222  →  Mac localhost:2222 reaches the device DevTools  (reload/screenshot)
```

`bun run device:connect` keeps the `reverse:4000` rule armed (it dies on every
replug/reboot). The `forward:2222` rule for DevTools is armed automatically by
the `device:*` scripts, so you usually don't think about it.

### First run / after a replug

```bash
# terminal 1 — keep the UI tunnel alive (leave this running)
bun run device:connect

# terminal 2 — keep the feeder running (leave this running)
bun run feeder

# whenever you change code:
bun run deploy           # build + reload the kiosk
bun run device:shot      # confirm it visually -> device-shot.png
```

If `adb devices` is empty, the Car Thing isn't enumerated — **replug the USB
cable** (this hardware is flaky on USB-3/Thunderbolt; an inline USB-2 hub is the
most reliable). The `device:*` scripts fail fast with a clear message in that case.

### Auto-start on login (launchd daemon)

So the dashboard "just works" after a reboot without launching anything by hand,
install two `launchd` LaunchAgents:

```bash
bun run daemon:install     # generate + start both agents (idempotent; re-run to refresh)
bun run daemon:uninstall   # stop + remove them
bun run daemon:logs        # tail both logs
```

- **`com.carthing.feeder`** — the feeder on `:4000` (serves `dist` + WS + media).
- **`com.carthing.tunnel`** — `scripts/connect.ts`: keeps `reverse:4000` armed and,
  on every (re)connect, reloads the kiosk once the feeder answers — so it
  auto-recovers from the "something went wrong" page if the device booted before
  the feeder was up.

Both are `RunAtLoad` + `KeepAlive` and run via `bun` (not a bash script): as a
launchd agent the watchdog runs from this repo under `~/Documents`, which macOS
TCC denies to a plain `/bin/bash` (`Operation not permitted`) — `bun` already has
the access the feeder relies on, so the watchdog rides along.

Caveats:
- **Login, not boot.** LaunchAgents start when *you log in*, not at the login
  screen. Fine for a desk setup that auto-logs-in; otherwise log in once.
- **The daemon owns `:4000`.** Before running the feeder by hand
  (`bun run feeder` / `feeder:dev`), `bun run daemon:uninstall` first, or they'll
  fight over the port.
- Logs land in `~/.carthing-com.carthing.{feeder,tunnel}.log` (in `$HOME`, not the
  repo — see below). Tail them with `bun run daemon:logs`.
- **Why the agents run from `$HOME`, not the repo:** the repo is under `~/Documents`,
  which is TCC-protected; a launchd agent can't `chdir` into (or write logs in) it
  and the whole job dies with `EX_CONFIG(78)` — which looks exactly like "the feeder
  never starts after a reboot." So the plists use `WorkingDirectory=$HOME` + absolute
  script paths (the feeder/watchdog resolve their own files by `import.meta`, so cwd
  is irrelevant). If the daemon ever shows `EX_CONFIG` again, that's the cause.

## Writing UI code: the Chromium-69 rules

The kiosk renders on a **~Chromium 69 / QtWebEngine 5.12.7** engine. The build is
transpiled+polyfilled for it (`@vitejs/plugin-legacy`, `renderModernChunks:
false`), but CSS and some runtime APIs are not polyfilled. Stay inside these
lines or the device blank-screens / mis-renders while your Mac browser looks fine:

- **Tailwind v3** (not v4). Colors are HSL-triplet CSS vars consumed as
  `hsl(var(--token) / <alpha-value>)`.
- **No `oklch()`** colors, **no flexbox `gap`** (use margins / `space-*`; grid
  `gap` is OK), no `:where()`/`:is()`.
- **Do not trust the device wall clock for relative times.** The Car Thing clock
  may be years out of date. Anchor countdowns and “time ago” labels to a feeder
  timestamp such as `DashboardState.generatedAt` or `UsageSummary.fetchedAt`,
  then advance that value locally. Do not subtract `Date.now()` from a
  server-provided timestamp.
- **Parse server timestamps explicitly.** Chromium 69's date parser is less
  consistent than current browsers. For the Open Usage ISO-8601 timestamps, use
  the legacy-safe parser in `UsagePage.tsx` (or normalize to epoch milliseconds
  in the feeder) instead of depending on `Date.parse()`.
- In any expression you `Runtime.evaluate` on the device, **no optional chaining
  (`?.`) / nullish coalescing (`??`)** — Chromium 69 can't parse them.
- Fonts are **system-only** (`-apple-system, …`). Your Mac shows San Francisco;
  the device has no Apple fonts and falls back to a generic sans — so text
  metrics differ between Mac and device. Bundle a webfont via `@font-face` if you
  need them to match exactly.

### Styling conventions (enforced)

- **Use the exact shadcn token names** — `background`, `foreground`,
  `card`/`card-foreground`, `popover`, `primary`/`primary-foreground`,
  `secondary`, `muted`/`muted-foreground`, `accent`/`accent-foreground`,
  `border`, `input`, `ring`, `destructive`/`destructive-foreground` — plus the
  app-specific state colors `working` / `waiting` / `idle` / `thinking`. Defined
  in `dashboard/src/index.css` + `dashboard/tailwind.config.js`.
- **Default Tailwind spacing scale only** (`p-2` = 8px, `p-4` = 16px…). No custom
  fractional spacing.
- **No arbitrary values** — never `text-[13px]`, `bg-[#1a1205]`, `rounded-[12px]`.
  (Arbitrary *variant selectors* like `[&::-webkit-scrollbar]:w-0` are fine.)
- **No string interpolation in `className`** — never ``className={`... ${cond ? a
  : b}`}``. Use the `cn()` helper (`dashboard/src/lib/cn.ts`) or `data-*`
  attribute variants instead:

  ```tsx
  // good — conditional via cn()
  className={cn("h-2.5 w-2.5 rounded-full", connected ? "bg-working" : "bg-destructive")}

  // good — variants keyed off a data attribute
  <div data-state={state} className="bg-idle data-[state=working]:bg-working" />
  ```

## Configuration (env)

Feeder (`server/`):

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | feeder HTTP/WS port |
| `HOST` | `0.0.0.0` | bind address (all interfaces, so the device tunnel reaches it) |
| `POLL_MS` | `2000` | session rescan interval |
| `OPEN_USAGE_URL` | `http://localhost:6736/v1/usage` | Open Usage API endpoint |
| `USAGE_REFRESH_MS` | `30000` | usage poll interval |

Dashboard (`dashboard/`):

| Var | Meaning |
|---|---|
| `VITE_WS_URL` | build-time WebSocket URL override (set by `bun run ui` for dev) |
| `?ws=` query param | runtime WebSocket URL override (e.g. `localhost:4000/?ws=ws://host:4000/ws`) |

Device scripts:

| Var | Default | Meaning |
|---|---|---|
| `CDP_PORT` | `2222` | device-side Chromium remote-debugging port (forwarded to the Mac) |

## Troubleshooting

- **Mac and device look different** — usually the **font** (see the Chromium-69
  rules above) plus DPI/viewport (the 800×480 shell centered in a big Retina
  window vs. filling the native panel). To compare apples-to-apples, view
  `http://localhost:4000` (production preview) on the Mac, not the `:5173` dev
  server. Hard-reload (⌘⇧R) if a tab predates your last build.
- **A reset countdown shows thousands of days** — the UI is using the device's
  stale wall clock. Base the countdown on the feeder's `fetchedAt` timestamp as
  described in the Chromium-69 rules above, then rebuild and hard-reload.
- **`adb devices` empty** — replug; prefer a USB-2 hub. After `adb kill-server`,
  the device may need a replug to re-enumerate.
- **Kiosk blank / not updating** — `bun run device:reload`; check `bun run
  feeder` is up and `device:connect` shows the reverse rule armed.
- **`device:*` says "no DevTools"** — the kiosk's Chromium isn't exposing the
  debug port, or adb isn't connected. Confirm `adb devices`, then retry.
