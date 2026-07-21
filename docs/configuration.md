# Configuration and local data

CommandThing keeps all machine-specific application data outside the source checkout. The default
location is `~/.commandthing`:

```text
~/.commandthing/
  config.json
  bin/          Offline CLI, service launchers, and generated hook forwarder
  backups/      Up to five recent backups for each managed hook file
  cli/          Installed versioned management CLI
  logs/         Rotating feeder, tunnel, and diagnostic logs
  runtime/      Installed versioned feeder, tunnel, and dashboard files
  screenshots/  Device screenshots
```

No `.env` file is required. Create the config with:

```bash
npx commandthing@latest config init
~/.commandthing/bin/commandthing config path
~/.commandthing/bin/commandthing config show
```

## Config file

The generated `config.json` uses these defaults:

```json
{
  "server": {
    "host": "127.0.0.1",
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
Unknown fields, malformed URLs, and invalid ports are rejected instead of silently ignored.

The loopback host is a security boundary. The ADB reverse tunnel can reach it without exposing the
API to the LAN. Setting `host` to `0.0.0.0` is an explicit opt-in that should be used only on a
trusted network or behind an authenticated proxy and firewall rules.

## Location override

`COMMANDTHING_HOME` overrides the entire CommandThing data directory, and `COMMANDTHING_CONFIG`
overrides the config file path. These are process-level escape hatches for packaging and tests, not
values that belong in a project `.env` file. Runtime settings such as the host, port, and polling
intervals are accepted only through `config.json`, so every component reads the same values.

## Sensitive data

The default config contains addresses and polling intervals, not credentials. Do not add API keys
or tokens unless CommandThing explicitly documents a field for them. The whole config directory is
local machine state and must never be copied into the repository.
