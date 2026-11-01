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
network access. 

## Set up CommandThing

```bash
npx commandthing@latest setup
```

Setup validates the shared configuration, stages the versioned runtime, lint-checks both macOS
LaunchAgents, starts them, and waits for the feeder health check. It commits
only after every step succeeds; otherwise it restores the prior runtime and service state.

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

## Remove hooks left by older versions

```bash
~/.commandthing/bin/commandthing remove hooks
```

This removes only hook commands recognized as CommandThing hooks from both tools and deletes the
generated forwarder. Setup does this automatically. Backups are created before changed files are written.

## Diagnose the host

```bash
~/.commandthing/bin/commandthing doctor
```

Doctor reports Node.js, adb, the T3 Code database, and feeder health. Missing `adb`
is expected when using browser preview without physical hardware.

## Manage configuration

```bash
~/.commandthing/bin/commandthing config init
~/.commandthing/bin/commandthing config path
~/.commandthing/bin/commandthing config show
```

See [Configuration](configuration.md) for the schema and generated-file locations.

## Test overrides

| Variable | Purpose |
|---|---|
| `COMMANDTHING_HOME` | Override the `~/.commandthing` data directory |
| `COMMANDTHING_CLAUDE_SETTINGS` | Override the Claude settings file |
| `COMMANDTHING_CODEX_HOOKS` | Override the Codex hooks file |
| `COMMANDTHING_FEEDER_URL` | Override the URL used by `commandthing hook` |
