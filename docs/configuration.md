# Configuration and local data

CommandThing keeps machine-specific settings and generated files outside the source checkout. The
default location is `~/.config/commandthing`:

```text
~/.config/commandthing/
  config.json
  bin/          Generated hook forwarders
  backups/      Claude settings backups
  logs/         Feeder, tunnel, and diagnostic logs
  screenshots/  Device screenshots
```

No `.env` file is required. Create the config with:

```bash
pnpm commandthing config init
pnpm commandthing config path
pnpm commandthing config show
```

After the npm release, replace `pnpm commandthing` with `npx commandthing@latest`.

## Config file

The generated `config.json` uses these defaults:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 4000
  },
  "openUsage": {
    "url": "http://localhost:6736/v1/usage",
    "refreshMs": 30000
  },
  "refresh": {
    "sessionsMs": 2000,
    "mediaMs": 1000
  }
}
```

Restart the feeder and tunnel after changing the port or host. The dashboard uses the same origin
as the feeder, and Vite proxies development requests automatically, so it needs no separate URL.

## Location overrides

CommandThing honors `XDG_CONFIG_HOME`; when set, the directory is
`$XDG_CONFIG_HOME/commandthing`. `COMMANDTHING_HOME` overrides the entire CommandThing directory,
and `COMMANDTHING_CONFIG` overrides the config file path. These are process-level escape hatches
for packaging and tests, not values that belong in a project `.env` file.

The feeder still accepts `HOST`, `PORT`, `OPEN_USAGE_URL`, `USAGE_REFRESH_MS`, `POLL_MS`, and
`MEDIA_MS` for compatibility with older installations. A process environment value takes
precedence over `config.json`. New installations should use the config file so every component
reads the same settings.

## Sensitive data

The default config contains addresses and polling intervals, not credentials. Do not add API keys
or tokens unless CommandThing explicitly documents a field for them. The whole config directory is
local machine state and must never be copied into the repository.
