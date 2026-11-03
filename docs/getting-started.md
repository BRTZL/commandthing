# Getting started

This guide installs CommandThing on a Mac. You can preview the entire dashboard before connecting a
Car Thing.

## Requirements

- macOS
- Node.js 26 or newer
- Optional: Android platform tools (`adb`) for a physical device
- Optional: Open Usage on port `6736` for provider usage data

## Install

```bash
npx commandthing@latest setup
```

It creates `~/.commandthing`, installs the packaged runtime, starts the macOS
services, and waits for the dashboard to become healthy. CommandThing does not require a project
`.env` file. See [Configuration](configuration.md) for ports, Open Usage, logs, and other local data.

Setup also installs `~/.commandthing/bin/commandthing` for offline day-to-day management. Use
`npx commandthing@latest setup` again when installing an update; use the local command for status,
logs, restart, device control, and diagnostics.

## Browser preview

Open <http://localhost:4000>. Useful endpoints include:

- `/health` — feeder health and client count
- `/state` — current dashboard state
- `/api/usage` — cached Open Usage response
- `/ws` — dashboard event and request transport

## Development from source

Clone the repository and run the development services with pnpm:

```bash
git clone https://github.com/BRTZL/commandthing.git
cd commandthing
pnpm install
pnpm dev
```

Open <http://localhost:5173>. Vite serves the UI with hot reload while the feeder remains on port
`4000`.

## T3 Code sessions

The board shows active T3 Code threads by reading T3's database read-only, so T3 Code must be running
on the same Mac. No hooks are needed. See [Troubleshooting](troubleshooting.md) if the board reports a problem.

## Next steps

- Connect hardware using [Device setup](device-setup.md).
- Learn the contributor workflow in [Development](development.md).
- Check [Troubleshooting](troubleshooting.md) if usage or the feeder is unavailable.
