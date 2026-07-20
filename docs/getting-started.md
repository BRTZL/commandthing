# Getting started

This guide runs CommandThing from source on a Mac. You can preview the entire dashboard before
connecting a Car Thing.

## Requirements

- macOS
- Node.js 18 or newer
- pnpm 10 (the repository pins the expected version in `package.json`)
- Bun
- Optional: Android platform tools (`adb`) for a physical device
- Optional: Open Usage on port `6736` for provider usage data

If pnpm is unavailable, enable the package-manager shim included with Node:

```bash
corepack enable
corepack install
```

## Install

```bash
git clone https://github.com/BRTZL/commandthing.git
cd commandthing
pnpm install
```

Create the machine-level config. This also creates `~/.config/commandthing`:

```bash
pnpm commandthing config init
```

CommandThing does not require a project `.env` file. See [Configuration](configuration.md) for
ports, Open Usage, logs, and other local data.

## Production preview

Build the exact legacy bundle used by the device, then start the feeder:

```bash
pnpm build
pnpm feeder
```

Open <http://localhost:4000>. Useful endpoints include:

- `/health` — feeder health and client count
- `/state` — current dashboard state
- `/api/usage` — cached Open Usage response
- `/ws` — dashboard event and request transport

## Live development

Run both services with one command:

```bash
pnpm dev
```

Open <http://localhost:5173>. Vite serves the UI with hot reload while the feeder remains on port
`4000`.

## Claude Code hooks

Install CommandThing's hooks safely:

```bash
pnpm commandthing setup hooks
```

The CLI creates a small stable forwarder under `~/.config/commandthing`, backs up Claude settings,
and merges its entries with existing hooks. See [CLI](cli.md) for removal and diagnostics.

## Next steps

- Connect hardware using [Device setup](device-setup.md).
- Learn the development scripts in [Development](development.md).
- Check [Troubleshooting](troubleshooting.md) if usage or the feeder is unavailable.
