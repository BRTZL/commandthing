# Architecture

CommandThing separates host integrations from the constrained device renderer.

```text
T3 Code database   ─┐
Open Usage         ─┼─> apps/feeder (Node.js, Mac) ── WebSocket ──> apps/dashboard (Car Thing)
Spotify            ─┘             │
                                  └─ HTTP UI, health, artwork, and debug endpoints
```

## Workspace components

### `apps/dashboard`

A fixed 800×480 React application. Vite emits only a legacy SystemJS bundle targeting Chromium 69.
The UI receives state through one WebSocket and sends media/session-detail requests over the same
connection.

### `apps/feeder`

A Node.js service that runs on the host computer. It reads active threads from T3 Code's SQLite database
read-only, polls Open Usage, controls Spotify on macOS, serves the dashboard, broadcasts state, and
answers WebSocket requests.

### `packages/protocol`

The shared wire contract. Both apps depend on `@commandthing/protocol` using pnpm's `workspace:*`
protocol, preventing accidental resolution to a registry package during development.

### `packages/cli`

The npm distribution entry point. It packages the feeder, tunnel, device controller, and legacy
dashboard; installs them into a versioned application runtime; and manages launchd, logs,
and diagnostics. The CLI owns the shared machine-configuration schema consumed by the bundled
feeder, preventing installer/runtime default drift.

Runtime TypeScript and build entries live inside this package because they exist solely to produce
and operate the CLI distribution. There is deliberately no top-level `scripts/` directory and no
parallel user-facing script interface.

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
| `4000` | Feeder | UI, WebSocket, and APIs |
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

The feeder assumes a trusted local machine and USB connection. Port `4000` has no application-level
authentication and can expose session titles, prompts, usage, and media state, so it binds to
`127.0.0.1` by default. The ADB reverse tunnel reaches that loopback listener. LAN binding is an
explicit opt-in and must not be used on an untrusted network.

Service upgrades are staged. The CLI validates config and launchd plists, preserves the current
runtime and agents, boots the new version, waits for health, and commits only after the feeder is
healthy. Failure restores the previous runtime and running services. Launchd calls a stable shell
launcher that can find another supported Node 22+ installation if the originally used Node binary
is removed.
