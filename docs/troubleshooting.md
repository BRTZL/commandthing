# Troubleshooting

## Dashboard says usage is unavailable

Confirm Open Usage and the feeder mirror:

```bash
curl http://localhost:6736/v1/usage
curl http://localhost:4000/api/usage
```

Change `openUsage.url` in `~/.commandthing/config.json` when the service uses another
address, then restart the feeder.

## Reset countdown shows thousands of days

The device wall clock is stale. Relative UI time must use the feeder's `fetchedAt` or `generatedAt`
timestamp and advance from there. Hard-reload after rebuilding to discard an older bundle.

## Browser preview has no live data

Run `pnpm dev`, or run `pnpm feeder` and `pnpm ui` separately. The dashboard needs a WebSocket
connection to port `4000`.

## Production page says the dashboard is not built

```bash
pnpm build
```

Then reload <http://localhost:4000>.

## Port 4000 is already in use

The launchd agent may already own it:

```bash
~/.commandthing/bin/commandthing stop
~/.commandthing/bin/commandthing start
```

## Device is absent from adb

Run `adb devices`. If the list is empty, also check macOS System Information's USB section. A device
missing from both places is a power, cable, hub, or USB-enumeration problem rather than a dashboard
problem: power-cycle it, reseat both ends of the data cable, and try a USB 2 hub. The reverse rule
disappears whenever the device or adb server restarts, but CommandThing recreates it automatically.

## Service says running but the dashboard is unreachable

Check the application-level health endpoint rather than relying only on launchd's process state:

```bash
curl --max-time 2 http://localhost:4000/health
~/.commandthing/bin/commandthing status
~/.commandthing/bin/commandthing restart
```

The installed feeder has an external health watchdog. After three consecutive failed health checks
it terminates the unhealthy child so launchd can start a clean process. Spotify polling is also
single-flight and time-limited so a stalled Apple Event cannot accumulate child processes.

## Kiosk does not recover after feeder restart

```bash
~/.commandthing/bin/commandthing restart
~/.commandthing/bin/commandthing device reload
```

The first command recreates the tunnel; the second forces the kiosk off its connection-error page.

## Mac and device layouts differ

Compare against the production page on port `4000`, not only Vite on `5173`. The device has an older
renderer and different font metrics. Review the Chromium rules in [Development](development.md).

## AI coding sessions never show authoritative state

```bash
npx commandthing@latest setup hooks
~/.commandthing/bin/commandthing doctor
```

Rerunning setup is safe and removes duplicate CommandThing entries.
For Codex, also open `/hooks` after setup and trust the newly written definitions.
