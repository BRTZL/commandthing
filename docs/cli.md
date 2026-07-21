# CommandThing CLI

The CLI is the machine-independent setup surface for users. Its source lives in `packages/cli` and
uses Node.js for both the command surface and installed host runtime.

It is the only supported operational interface. Runtime modules are bundled into the npm package;
they are not standalone repository scripts. Root pnpm commands are limited to development,
building, testing, and invoking the local CLI from a source checkout.

## Invocation

```bash
npx commandthing@latest --help
```

Use `npx commandthing@latest setup` for installation and updates. Setup also installs
`~/.commandthing/bin/commandthing` for operational commands that must work without registry or
network access. Automated hooks use their own stable local forwarder.

## Set up CommandThing

```bash
npx commandthing@latest setup
```

Setup validates the shared configuration, stages the versioned runtime, lint-checks both macOS
LaunchAgents, starts them, installs Claude Code and Codex hooks, and waits for the feeder health check. It commits
only after every step succeeds; otherwise it restores the prior runtime and service state. Pass
`--skip-hooks` when AI coding integration is not wanted.

After setup, manage the installation with:

```bash
~/.commandthing/bin/commandthing status
~/.commandthing/bin/commandthing logs
~/.commandthing/bin/commandthing start
~/.commandthing/bin/commandthing stop
~/.commandthing/bin/commandthing restart
~/.commandthing/bin/commandthing uninstall
```

Normal uninstall keeps config, logs, screenshots, and backups. `uninstall --purge` removes the
entire `~/.commandthing` directory.

## Device control

```bash
~/.commandthing/bin/commandthing device info
~/.commandthing/bin/commandthing device reload
~/.commandthing/bin/commandthing device open /usage
~/.commandthing/bin/commandthing device screenshot
```

Device commands run the versioned controller installed by setup, ensuring the CLI and background
services always use the same runtime version.

Advanced maintainer operations are grouped under `commandthing diagnostics`; see
[Development](development.md) for the available commands.

## Install only AI coding hooks

```bash
~/.commandthing/bin/commandthing setup hooks
```

Hook setup reads the feeder port from `~/.commandthing/config.json`. Use an explicit remote
address only when necessary:

```bash
~/.commandthing/bin/commandthing setup hooks --feeder-url http://localhost:4000
```

Setup performs the following operations:

1. Validates the feeder URL.
2. Writes `~/.commandthing/bin/commandthing-hook.mjs`.
3. Backs up changed Claude and Codex hook files under `~/.commandthing/backups/`, retaining the latest five of each.
4. Atomically merges CommandThing into supported events in `~/.claude/settings.json` and `~/.codex/hooks.json`.
5. Removes older CommandThing hook entries so rerunning setup is idempotent.

Unrelated settings and hooks are preserved. Codex asks you to review exact hook definitions before
trusting them. After setup changes Codex hooks, open `/hooks` in Codex and approve the new entries.

## Remove AI coding hooks

```bash
~/.commandthing/bin/commandthing remove hooks
```

This removes only hook commands recognized as CommandThing hooks from both tools and deletes the
generated forwarder. Backups are created before changed files are written.

## Diagnose the host

```bash
~/.commandthing/bin/commandthing doctor
```

Doctor reports Node.js, adb, Claude settings, Codex hooks, the installed forwarder, and feeder health. Missing `adb`
is expected when using browser preview without physical hardware.

## Manage configuration

```bash
~/.commandthing/bin/commandthing config init
~/.commandthing/bin/commandthing config path
~/.commandthing/bin/commandthing config show
```

See [Configuration](configuration.md) for the schema and generated-file locations.

## Forward one hook manually

```bash
printf '%s' '{"session_id":"test","hook_event_name":"SessionStart"}' \
  | ~/.commandthing/bin/commandthing hook
```

The hook command intentionally exits successfully when the feeder is stopped so it can never block
Claude Code or Codex.

## Test overrides

| Variable | Purpose |
|---|---|
| `COMMANDTHING_HOME` | Override the `~/.commandthing` data directory |
| `COMMANDTHING_CLAUDE_SETTINGS` | Override the Claude settings file |
| `COMMANDTHING_CODEX_HOOKS` | Override the Codex hooks file |
| `COMMANDTHING_FEEDER_URL` | Override the URL used by `commandthing hook` |
