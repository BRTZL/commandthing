# Architecture

CommandThing separates host integrations from the constrained device renderer.

```text
Claude hooks ─┐
Claude logs  ─┤
Open Usage   ─┼─> apps/feeder (Bun, Mac) ── WebSocket ──> apps/dashboard (Car Thing)
Spotify      ─┘             │
                            └─ HTTP UI, health, artwork, and debug endpoints
```

## Workspace components

### `apps/dashboard`

A fixed 800×480 React application. Vite emits only a legacy SystemJS bundle targeting Chromium 69.
The UI receives state through one WebSocket and sends media/session-detail requests over the same
connection.

### `apps/feeder`

A Bun service that runs on the host computer. It watches Claude session transcripts and hook
signals, polls Open Usage, controls Spotify on macOS, serves the dashboard, broadcasts state, and
answers WebSocket requests.

### `packages/protocol`

The shared wire contract. Both apps depend on `@commandthing/protocol` using pnpm's `workspace:*`
protocol, preventing accidental resolution to a registry package during development.

### `packages/cli`

The npm distribution entry point. It packages the feeder, tunnel, device controller, and legacy
dashboard; installs them into a versioned application runtime; and manages hooks, launchd, logs,
and diagnostics. The CLI uses Node.js APIs so `npx commandthing` works on a standard Node install.

## Data transport

Dashboard state uses a nocturned-compatible event envelope:

```json
{
  "type": "event",
  "topic": "dashboard.update",
  "data": {}
}
```

The browser connects to `/ws` on its current origin. Vite development proxies that path to the
feeder. The runtime `?ws=` query parameter remains available for diagnostics.

## Ports

| Port | Owner | Purpose |
|---|---|---|
| `4000` | Feeder | UI, WebSocket, hooks, and APIs |
| `5173` | Vite | Development-only UI with hot reload |
| `6736` | Open Usage | Optional provider usage source |
| `2222` | Device tooling | Forwarded Chromium DevTools endpoint |

The feeder and tunnel read the configured server port. See [Configuration](configuration.md).

## Device constraints

- Chromium is approximately version 69; runtime APIs and CSS must be conservative.
- The device wall clock may be wrong. Relative times must use feeder timestamps.
- Mac-local services require the ADB reverse tunnel from the device.
- The UI must remain usable at exactly 800×480 with touch, buttons, and the dial.

## Security model

The feeder assumes a trusted local machine and USB connection. Port `4000` has no authentication
and can expose session titles, prompts, usage, and media state. Do not forward it to the public
internet or an untrusted LAN.
