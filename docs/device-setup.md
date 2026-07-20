# Device setup

CommandThing can be fully previewed in a browser. Physical deployment additionally requires a Car
Thing firmware image that provides a kiosk/browser and ADB access.

Changing firmware can erase data. Back up the device and follow current instructions from the
firmware/tool maintainers rather than relying on a version number copied into this repository.

Useful upstream resources:

- [Thing Labs](https://thinglabs.sh/)
- [Car Thing community wiki](https://carthing.wiki/)
- [Terbium flashing tool](https://terbium.app/)

## Expected connection

```text
Car Thing http://localhost:4000
        │
        └── adb reverse tcp:4000 tcp:4000 ──> Mac feeder on port 4000
```

The same tunnel carries the UI, WebSocket, artwork, and API traffic.

## Verify ADB

Install Android platform tools, connect the device, and check:

```bash
adb devices
```

The device must appear with state `device`. If it is absent, replug it and prefer a USB 2 hub when
using unreliable USB-C/Thunderbolt adapters.

## Start CommandThing

```bash
pnpm commandthing setup
```

The watchdog waits for the device, recreates the reverse rule after reconnects, and reloads the
kiosk after the feeder becomes healthy.

## Configure the kiosk

Point the device kiosk to `http://localhost:4000`. How the URL is configured depends on installed
firmware. Consult that firmware's current documentation before modifying its service configuration.

## Verify the device

```bash
pnpm commandthing device info
pnpm commandthing device open /usage
pnpm commandthing device screenshot
```

Confirm an 800×480 viewport, the Chromium/QtWebEngine user agent, hardware input, usage scrolling,
and media control.

## Daily workflow

Rerun `pnpm commandthing setup` after updating the checkout. It rebuilds and installs the runtime.
The ADB reverse rule is not persistent across reboots or USB disconnects, so the installed tunnel
service recreates it automatically.
