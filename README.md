# Car Thing Dashboard

A custom dashboard for the **Spotify Car Thing** (running [Nocturne](https://github.com/usenocturne) firmware) — a glanceable command center for parallel Claude Code work. It's a small multi-page app:

- **Board** (`/`) — live Claude Code sessions: project, AI title, model, git branch, subagent count, and a hook-driven **working / waiting / needs-you** state. Tap a card to drill in. A top-bar meter shows **today's AI spend**.
- **Session detail** (`/session/:id`) — a live timeline of that session: prompts, Claude replies, every **tool call** with its target + ok/error status, TodoWrite task lists, and per-tool counts.
- **Usage** (`/usage`) — per-provider spend/usage from the local **Open Usage** API (Claude, Codex, Copilot…): Session/Weekly bars, $ today / yesterday / 30-day, per-model breakdown, token bar charts.
- **Notifications** — a tappable toast + soft beep when any session flips to *needs-you*.
- **Calendar** tile — placeholder/mock for now (de-scoped).

Navigation is a hash router; the Car Thing **Back button (Esc)** goes back a level.

It's built **software-first**: everything runs and is previewable in a desktop browser today. The on-device step (flashing Nocturne, wiring the transport) is deliberately deferred — the code is designed to drop onto the device with near-zero change. All data flows over a **single WebSocket** (state broadcast + nocturned-style `request`/`response`), so there are no HTTP data calls that would break on the device.

## How it works

```
┌──────────────────────── your Mac ────────────────────────┐        ┌──── Car Thing (later) ────┐
│  Claude Code hooks ─┐                                     │        │   Nocturne kiosk Chromium  │
│  ~/.claude/*.jsonl ─┼─▶ feeder (server/, Bun)             │   ws   │   loads the dashboard      │
│  Calendar (mock) ───┘     watch + derive → WebSocket ─────┼───────▶│   subscribes "dashboard.   │
│                           {type:event,topic,data}         │        │    update" topic           │
│  dashboard (dashboard/, React/Vite) ◀── same WS in dev ───┘        └────────────────────────────┘
└───────────────────────────────────────────────────────────┘   transport later: BT connector / NCM gadget
```

The WebSocket envelope deliberately matches **nocturned**'s event shape
(`{"type":"event","topic":"dashboard.update","data":{…}}`). nocturned broadcasts
unknown topics straight to its UI clients, so the dashboard's WS client is
identical in local dev (talking to the feeder) and on the device.

## Run it (software-first, no device needed)

Requires [Bun](https://bun.sh).

```bash
# 1) one-time: install dashboard deps
cd dashboard && bun install && cd ..

# Option A — quick preview (feeder serves the built UI on one port)
bun run preview            # builds the UI, starts the feeder
# open http://localhost:4000 in Chrome or Edge

# Option B — live dev (HMR)
bun run feeder             # terminal 1: feeder on :4000 (WS at /ws)
bun run ui                 # terminal 2: Vite dev server on :5173 (auto-points at the feeder)
# open http://localhost:5173
```

For the full script reference, the device deploy loop, and the Chromium-69
coding rules, see **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

Useful endpoints on the feeder (`:4000`): `/health`, `/state` (JSON snapshot),
`/ws` (the live feed), `POST /hook` (Claude hook receiver), and HTTP debug
mirrors `/api/usage` + `/api/session/:id` (the UI itself uses the WS).

**Config (env):** `PORT` (4000), `POLL_MS` (2000), `OPEN_USAGE_URL`
(`http://localhost:6736/v1/usage`), `USAGE_REFRESH_MS` (30000). The dashboard
reads `VITE_WS_URL` (build-time) and a `?ws=` query override (runtime).

## Layout

```
shared/protocol.ts      Wire types shared by feeder + dashboard (the contract)
server/                 Mac-side feeder (Bun, zero runtime deps)
  src/index.ts            WebSocket (broadcast + request/response) + hook receiver
  src/claudeWatcher.ts    Parses ~/.claude transcripts → session summaries
  src/sessionDetail.ts    On-demand detailed timeline for one session
  src/usage.ts            Polls Open Usage API → spend/usage summary
  src/calendar.ts         MOCK calendar (de-scoped)
  src/hooks.ts            Hook signal store (authoritative session state)
dashboard/              On-device UI (React + Vite, built for Chromium 69)
  src/client.ts           Shared WS client (state events + request/response)
  src/router.ts           Tiny hash router (Back button = Esc)
  src/App.tsx             Shell: top bar + routed page + notification overlay
  src/pages/              BoardPage, SessionPage, UsagePage
scripts/claude-hook.sh  Forwards Claude hook payloads to the feeder
```

## Session state: how "waiting on you" is decided

- **Without hooks (default):** a recency heuristic from transcript mtime —
  wrote in the last 90s = `working`, last 30m = `waiting`, older = `idle`.
- **With hooks (recommended, accurate):** Claude Code hooks report real events
  and override the heuristic. `Stop`/`Notification` → **waiting on you**;
  `UserPromptSubmit`/tool use → `working`; `SessionEnd` clears it.

### Hooks setup (optional)

Add to `~/.claude/settings.json` (the feeder must be running):

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "/Users/bartuozel/Documents/workspace/spotify-carthing/scripts/claude-hook.sh" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "/Users/bartuozel/Documents/workspace/spotify-carthing/scripts/claude-hook.sh" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "/Users/bartuozel/Documents/workspace/spotify-carthing/scripts/claude-hook.sh" }] }],
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "/Users/bartuozel/Documents/workspace/spotify-carthing/scripts/claude-hook.sh" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "/Users/bartuozel/Documents/workspace/spotify-carthing/scripts/claude-hook.sh" }] }]
  }
}
```

## Deferred (intentionally)

These don't block software dev; resolve before the device phase:

1. **Google Calendar** — replace `server/src/calendar.ts` with a real fetch
   (OAuth on the Mac). `DashboardState.calendarSource` already flags mock data.
2. **On-device transport** — a Mac **cannot** USB-network to Nocturne (RNDIS has
   no macOS driver). Options: (a) Nocturne's **Bluetooth connector** macOS app
   `sendEvent("dashboard.update", …)` → nocturned → UI; (b) rebuild the USB
   gadget as **CDC-NCM** for native Mac USB networking. Either way the dashboard
   code is unchanged — only the feeder's output transport differs.
3. **Verify nocturned forwards unknown topics** — confirm `broadcast_event` in
   nocturned's `websocket.rs` relays the custom `dashboard.update` topic (vs.
   only known ones). Fallback: reuse the already-wired `notification.show`.

## Deploy to the device

One-time bring-up (flashing **Thing Labs OS**, kiosk setup): see
**[docs/DEVICE-BRINGUP.md](docs/DEVICE-BRINGUP.md)**. The device tunnels to this
Mac's feeder over USB (`adb reverse tcp:4000`) and loads `http://localhost:4000`
— no RNDIS, no custom firmware build, no Pi. The production build is
Chromium-69-safe (legacy-only SystemJS bundle).

Once it's flashed, the everyday loop is three commands (full details in
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**):

```bash
bun run device:connect     # terminal 1: keep the USB tunnel armed
bun run feeder             # terminal 2: the data server
bun run deploy             # build + reload the kiosk (repeat on each change)
bun run device:shot        # screenshot the screen -> device-shot.png
```
