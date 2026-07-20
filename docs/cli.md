# CommandThing CLI

The CLI is the machine-independent setup surface for users. Its source lives in `packages/cli` and
uses Node.js for both the command surface and installed host runtime.

It is the only supported operational interface. Runtime modules are bundled into the npm package;
they are not standalone repository scripts. Root pnpm commands are limited to development,
building, testing, and invoking `pnpm commandthing` before the package is published.

## Current invocation

The package is not on npm yet. From a source checkout, run:

```bash
pnpm commandthing --help
```

After the first npm release, the equivalent command will be:

```bash
npx commandthing@latest --help
```

Do not put the `npx` form in automated hooks. Setup installs a stable local forwarder so hooks stay
fast and continue working offline.

## Set up CommandThing

```bash
pnpm commandthing setup
```

Setup installs the versioned runtime under `~/.commandthing/runtime`, installs Claude hooks, creates
the macOS LaunchAgents, starts them, and waits for the feeder health check. It is safe to rerun for
an update or repair. Pass `--skip-hooks` when Claude integration is not wanted.

After setup, manage the installation with:

```bash
pnpm commandthing status
pnpm commandthing logs
pnpm commandthing start
pnpm commandthing stop
pnpm commandthing restart
pnpm commandthing uninstall
```

Normal uninstall keeps config, logs, screenshots, and backups. `uninstall --purge` removes the
entire `~/.commandthing` directory.

## Device control

```bash
pnpm commandthing device info
pnpm commandthing device reload
pnpm commandthing device open /usage
pnpm commandthing device screenshot
```

Device commands run the versioned controller installed by setup, ensuring the CLI and background
services always use the same runtime version.

Advanced maintainer operations are grouped under `commandthing diagnostics`; see
[Development](development.md) for the available commands.

## Install only Claude hooks

```bash
pnpm commandthing setup hooks
```

Hook setup reads the feeder port from `~/.commandthing/config.json`. Use an explicit remote
address only when necessary:

```bash
pnpm commandthing setup hooks --feeder-url http://localhost:4000
```

Setup performs the following operations:

1. Validates the feeder URL.
2. Writes `~/.commandthing/bin/commandthing-hook.mjs`.
3. Backs up existing Claude settings under `~/.commandthing/backups/`.
4. Atomically merges CommandThing into each supported Claude hook event.
5. Removes older CommandThing hook entries so rerunning setup is idempotent.

Unrelated Claude settings and hooks are preserved.

## Remove Claude hooks

```bash
pnpm commandthing remove hooks
```

This removes only hook commands recognized as CommandThing hooks and deletes the generated
forwarder. A settings backup is created before the change.

## Diagnose the host

```bash
pnpm commandthing doctor
```

Doctor reports Node.js, adb, Claude settings, installed hooks, and feeder health. Missing `adb`
is expected when using browser preview without physical hardware.

## Manage configuration

```bash
pnpm commandthing config init
pnpm commandthing config path
pnpm commandthing config show
```

See [Configuration](configuration.md) for the schema and generated-file locations.

## Forward one hook manually

```bash
printf '%s' '{"session_id":"test","hook_event_name":"SessionStart"}' \
  | pnpm commandthing hook
```

The hook command intentionally exits successfully when the feeder is stopped so it can never block
Claude Code.

## Test overrides

| Variable | Purpose |
|---|---|
| `COMMANDTHING_HOME` | Override the `~/.commandthing` data directory |
| `COMMANDTHING_CLAUDE_SETTINGS` | Override the Claude settings file |
| `COMMANDTHING_FEEDER_URL` | Override the URL used by `commandthing hook` |
| `CARTHING_FEEDER` | Legacy alias for `COMMANDTHING_FEEDER_URL` |
