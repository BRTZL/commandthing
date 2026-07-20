# CommandThing

**Turn a Spotify Car Thing into a personal command center.**

CommandThing is a self-hosted dashboard for repurposed Spotify Car Thing hardware. It runs a small
host service on your Mac and renders an 800×480 interface on the device for AI sessions, usage,
music controls, and focus tools.

## Features

- Live Claude Code session states, prompts, tools, and todos
- Claude, Codex, and OpenCode usage summaries with reset countdowns
- Spotify now-playing, playback controls, volume, artwork, and synchronized lyrics
- Focus timer and hardware-button navigation
- A legacy-only production build for the Car Thing's Chromium 69-era browser
- One WebSocket connection between the host service and dashboard

## Project status

Source installation and device deployment work today. The `commandthing` CLI is included and can
configure Claude hooks without repository-specific paths.

The npm package has **not been published yet**. Until the first release, use `pnpm commandthing`
inside a clone instead of `npx commandthing@latest`.

## Quick start from source

Requirements: macOS, Node.js 18 or newer, and pnpm. ADB is optional until connecting hardware.

```bash
git clone https://github.com/BRTZL/commandthing.git
cd commandthing
pnpm install
pnpm commandthing setup
```

Open <http://localhost:4000>. The Usage page also expects the optional Open Usage service at
`http://localhost:6736/v1/usage`.

Machine settings, runtime files, logs, backups, and screenshots live under `~/.commandthing`; project
`.env` files are not needed.

Setup builds and installs the self-contained runtime, configures Claude Code hooks, and starts the
background services. Check it at any time with:

```bash
pnpm commandthing status
```

## Monorepo

```text
apps/
  dashboard/       React + Vite UI compiled for Chromium 69
  feeder/          Node.js host service and WebSocket server
packages/
  cli/             CLI, installed runtime sources, and runtime build tooling
  protocol/        Shared dashboard/feeder wire contracts
docs/              Installation, architecture, development, and release guides
```

pnpm manages the workspace and dependencies. The published CLI bundles the host runtime, device
controller, and diagnostics so installed users need only Node.js.

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/getting-started.md)
- [Configuration and local data](docs/configuration.md)
- [CLI and Claude hooks](docs/cli.md)
- [Device setup](docs/device-setup.md)
- [Architecture](docs/architecture.md)
- [Development](docs/development.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Publishing and releases](docs/publishing.md)

## Important security note

The feeder exposes session, usage, hook, and media endpoints without authentication. It is intended
for localhost and a trusted USB/ADB connection. Do not expose port `4000` to an untrusted network.

## Naming

CommandThing is independent software for discontinued Spotify Car Thing hardware. Spotify is not
affiliated with or responsible for this project.
