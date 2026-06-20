# Device Bring-Up — Car Thing on a Mac, via ADB (recommended path)

Run our dashboard on the physical Car Thing, fed live from this Mac, over
**ADB-over-USB** — which macOS speaks natively. No RNDIS, no custom firmware
build, no Raspberry Pi. This supersedes the old NCM-image plan (kept in git
history) — ADB is dramatically simpler on a Mac.

> ⚠️ **Nothing here has been run on the device.** We go step by step, and Claude
> won't flash/burn/reflash without your go-ahead. Physical + browser steps are
> yours; Claude runs the `adb`/CLI steps.

## The mechanism

```
  flash Thing Labs OS (runs adbd)  →  adb reverse tcp:4000 tcp:4000  →  kiosk shows http://localhost:4000
                                      (device localhost → this Mac's feeder, one tunnel for UI + WebSocket)
```

The current Nocturne firmware on the device only exposes RNDIS (Mac-invisible)
and no `adbd`, which is why nothing connected. **Thing Labs OS** runs a
persistent `adbd` alongside its kiosk — macOS `adb` connects with no driver — so
`adb reverse` + pointing the kiosk at `localhost:4000` just works. (It's the same
base DeskThing/GlanceThing use on Mac.)

## Division of labor

| You (physical / browser — Claude can't) | Claude (CLI / adb — with your OK) |
|---|---|
| Hold buttons 1+4, enter burn mode | Run the `superbird-tool` backup |
| Flash in `terbium.app` (Chrome/Edge) | `adb devices` / discriminator |
| Plug device in normally | Set kiosk URL, `adb reverse` + watchdog |
| Tell Claude when each is done | Verify render, iterate |

---

## Phase 0 — Backup (recommended; your call)

Lets you return to the firmware you have now. The device is **near-impossible to
permanently brick** (Amlogic BootROM USB-recovery sits below the OS), so this is
insurance, not a hard requirement. ~110 min.

- [ ] You: `brew install python3 libusb`; install superbird-tool (the **ThingLabsOSS** fork) + `pyamlboot`.
- [ ] You: enter **burn mode** — hold preset buttons **1 + 4** while plugging in USB-C (black screen = correct).
- [ ] Claude: `python superbird_tool.py --dump_device ./backup` (slow). Restore later via `--restore_device ./backup`.

## Phase 1 — Flash Thing Labs OS (you)

- [ ] Download **`8.9.2-thinglabs_norndis.zip`** from **thingify.tools** (the
      `norndis` variant — RNDIS confuses macOS adb) and **extract** it.
- [ ] Enter burn mode (buttons **1 + 4** while plugging in).
- [ ] Open **terbium.app** in **Chrome or Edge** (not Safari) → connect through
      the popups (`GX-CHIP`, then the Amlogic device) → **"Restore Local Folder"**
      → pick the extracted folder → flash (~5–10 min). No macOS driver needed.
- [ ] Let it reboot, then plug it into the Mac normally and tell Claude.

## Phase 2 — Confirm ADB (Claude)

- [ ] `adb devices` → expect the Car Thing listed as `device` (not `unauthorized`;
      no driver/whitelist needed on macOS).

## Phase 3 — Mac feeder + adb reverse (Claude)

Our build is already **Chromium-69-safe** (legacy-only SystemJS bundle) and the
feeder serves UI + WebSocket on **one port, 4000** — no changes needed.

- [ ] `bun run feeder` (serves `dist/` + `/ws` on `0.0.0.0:4000`).
- [ ] Reverse-tunnel **watchdog** (the rule dies on reboot/replug, so we keep it alive):
      ```bash
      while true; do adb wait-for-device; adb reverse tcp:4000 tcp:4000; sleep 2; done
      ```

## Phase 4 — Point the kiosk at the Mac (Claude)

The 8.9.2 image renders via either QtWebEngine or real Chromium — Claude runs a
30-second discriminator and configures accordingly:

```bash
adb shell cat /etc/supervisord.conf       # what launches the kiosk?
adb shell ls /usr/bin/chromium-browser/   # real chromium present?
```

- **Qt WebView** (likely; webapp at `/usr/share/qt-superbird-app/webapp/`):
  push our `dist/` into that dir (device serves the UI locally; the WebSocket
  still tunnels to the Mac via `adb reverse`), `mount -o remount,rw /`,
  `supervisorctl restart superbird`.
- **Real Chromium** (supervisord `--app=` flag): set `--app=http://localhost:4000`,
  restart the service.

Either way the dashboard ends up live on the device, fed by the Mac.

## Phase 5 — Verify & iterate

- [ ] Dashboard renders on real hardware (800×480, Chromium 69). Check the knob/
      buttons (arrive as keydowns; Back = Esc → board), the "needs-you" toast,
      the usage page.
- [ ] Iterate: `bun run ui:build` on the Mac → `adb push dist` (Qt) or just
      refresh (Chromium thin-client). The WebSocket auto-reconnects.

---

## Notes & flagged unknowns (from research)

- **adb reverse is not persistent** — dies on device reboot / USB replug / adb
  restart. The watchdog loop handles it; our client already auto-reconnects.
- **Qt-vs-Chromium on 8.9.2** is unresolved until we're on the device — the
  discriminator settles it in 30s.
- **adb auth**: expected to show `device` immediately (old insecure adbd, no RSA
  prompt) — flagged as strong inference, not documented.
- **No officially-hosted stock firmware** — your Phase-0 dump is the only sure
  restore path.
- Reflashing is reversible (Terbium can flash Nocturne / your backup again).

## Key sources
- Image + flash: thingify.tools · carthing.wiki/first-steps/flashing · terbium.app
- ADB base + tooling: github.com/ThingLabsOSS/superbird-tool · github.com/pajowu/superbird-custom-webapp
- adb-reverse + kiosk pattern: claudiuscoenen.de/2023/06/spotify-carthing-internet-access · err4o4/spotify-car-thing-reverse-engineering
