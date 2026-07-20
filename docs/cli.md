# CommandThing CLI

The CLI is the machine-independent setup surface for users. Its source lives in `packages/cli` and
uses Node.js so npm can execute it without Bun.

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

## Install Claude hooks

```bash
pnpm commandthing setup hooks
```

Setup reads the feeder port from `~/.config/commandthing/config.json`. Use an explicit remote
address only when necessary:

```bash
pnpm commandthing setup hooks --feeder-url http://localhost:4000
```

Setup performs the following operations:

1. Validates the feeder URL.
2. Writes `~/.config/commandthing/bin/commandthing-hook.mjs`.
3. Backs up existing Claude settings under `~/.config/commandthing/backups/`.
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

Doctor reports Node.js, Bun, adb, Claude settings, installed hooks, and feeder health. Missing `adb`
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
| `COMMANDTHING_HOME` | Override the `~/.config/commandthing` data directory |
| `COMMANDTHING_CLAUDE_SETTINGS` | Override the Claude settings file |
| `COMMANDTHING_FEEDER_URL` | Override the URL used by `commandthing hook` |
| `CARTHING_FEEDER` | Legacy alias for `COMMANDTHING_FEEDER_URL` |
