# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub Security Advisories instead of opening a
public issue. Include the affected version, reproduction steps, and expected impact when possible.

## Local network boundary

CommandThing serves local session, usage, media, and hook data without application-level
authentication. The default configuration therefore binds the feeder to `127.0.0.1`; the Car Thing
reaches it through the ADB reverse tunnel.

Binding the feeder to `0.0.0.0` or another LAN interface is an explicit opt-in and exposes those
endpoints to clients that can reach the host. Only do this on a trusted network or behind an
authenticated reverse proxy and host firewall rules.

CommandThing stores configuration, logs, runtime files, screenshots, and Claude settings backups
under `~/.commandthing`. Treat that directory as private local data.
