# Troubleshooting

## Dashboard says usage is unavailable

Confirm Open Usage and the feeder mirror:

```bash
curl http://localhost:6736/v1/usage
curl http://localhost:4000/api/usage
```

Set `OPEN_USAGE_URL` when the service uses another address.

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
pnpm daemon:uninstall
pnpm feeder
```

## Device is absent from adb

Run `adb devices`, replug the device, and try a USB 2 hub. The reverse rule disappears whenever the
device or adb server restarts.

## Kiosk does not recover after feeder restart

```bash
pnpm device:connect
pnpm device:reload
```

The first command recreates the tunnel; the second forces the kiosk off its connection-error page.

## Mac and device layouts differ

Compare against the production page on port `4000`, not only Vite on `5173`. The device has an older
renderer and different font metrics. Review the Chromium rules in [Development](development.md).

## Claude sessions never show authoritative state

```bash
pnpm commandthing setup hooks
pnpm commandthing doctor
```

Rerunning setup is safe and removes duplicate CommandThing entries.
