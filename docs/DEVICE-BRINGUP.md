# Device Bring-Up — Car Thing + Nocturne (Mac-only, custom NCM image)

Goal: run our dashboard on the physical Spotify Car Thing, fed live from this
Mac, **with no Raspberry Pi and no extra hardware** — just a USB-C cable.

> ⚠️ **Nothing in this document has been run.** It's the plan. Each phase that
> touches the device or builds firmware is destructive/irreversible-ish; we go
> through them together, one at a time. Claude will not execute these without
> asking first.

---

## The architecture we're building toward

**Thin client.** The Car Thing becomes a dumb kiosk browser pointed at the
feeder running on this Mac. The Mac serves *both* the UI and the live data; the
device just renders it.

```
  Mac (this repo)                              Car Thing (Nocturne)
  ┌───────────────────────────┐   USB-C       ┌──────────────────────────┐
  │ feeder (Bun) :4000         │  CDC-NCM      │ kiosk Chromium 69        │
  │  • serves dashboard dist/  │◀──────────────│  loads http://172.16.42.1│
  │  • WebSocket /ws (state +  │  172.16.42.1  │       :4000              │
  │    session.detail + usage) │   ⇄ .2        │  ws://172.16.42.1:4000/ws│
  └───────────────────────────┘               └──────────────────────────┘
```

**Why a custom image is required:** stock Nocturne exposes the USB network only
as **RNDIS**, which macOS has no driver for. The fix is a one-function change in
the firmware's USB gadget (`rndis` → **`ncm`**, which macOS supports natively) +
the matching kernel option. That change can only be made by rebuilding the
Nocturne image, which is why this is the "custom image" path.

**Why thin-client (vs. bundling the UI in the image):** once the Mac↔device IP
link works, pointing the kiosk at the Mac means **UI changes are just a rebuild
on the Mac** — no reflash, no on-device file copy. The image we build is
generic (gadget + kiosk URL only); all the app logic stays on the Mac.

---

## Prerequisites

- **macOS on Apple Silicon**, with **Chrome or Edge** (Terbium uses WebUSB; Safari won't work).
- **An arm64 Linux build environment** for Buildroot (Buildroot cannot run on macOS):
  - Recommended: **OrbStack** (fast, native arm64 Linux on Mac) — or Lima, Docker Desktop, or a UTM Ubuntu VM.
  - ~15 GB free disk; first build is **~30–90 min**.
- A **data-capable USB-C cable** and the Car Thing.
- This repo, with the feeder runnable (`bun run feeder`).

---

## Phase 0 — Safety backup (recommended, ~once)

Lets you return to genuine **stock Spotify** firmware later (Spotify's signed
image isn't otherwise obtainable). Bricking is hard to make permanent — the
Amlogic **BootROM USB-recovery mode sits below U-Boot and can't be overwritten**
— but a backup is the real safety net.

- [ ] Install **superbird-tool** (Mac-native, Apple-Silicon-supported): `github.com/Car-Thing-Hax-Community/superbird-tool`
- [ ] Enter burn mode: **hold preset buttons 1 + 4 while plugging in USB-C** (screen stays black; device enumerates as `GX-CHIP`).
- [ ] `python superbird_tool.py --dump_device ./carthing-stock-backup` — **slow (~110 min)**; it's the only path back to stock.

---

## Phase 1 — Repo prep on the Mac (Claude does this on your go-ahead)

Small, safe, local changes so the build produces a device-correct dashboard.
None of these touch the device.

- [ ] **Make the production WS URL location-relative.** Move the dev-only
      `VITE_WS_URL=ws://localhost:4000/ws` into `dashboard/.env.development`, and
      leave it unset for production builds. The client already falls back to
      `ws://<page-origin>/ws`, so a device loading `http://172.16.42.1:4000`
      auto-connects to `ws://172.16.42.1:4000/ws` — and local preview still works.
- [ ] Add an `ifconfig`/networksetup helper script to bring the Mac's NCM
      interface up at `172.16.42.1` (Phase 5).
- [ ] `bun run ui:build` → `dashboard/dist/` (the feeder serves this).

The feeder already binds `0.0.0.0:4000` (so the device can reach it) — done.

---

## Phase 2 — Set up the Linux build environment

- [ ] Install OrbStack; create an **arm64** Ubuntu/Debian machine.
- [ ] Install Buildroot host deps (git, build-essential, the toolchain the
      defconfig expects — Nocturne uses host `gcc-15`/`g++-15`; install what its
      `scripts/build.sh` checks for).
- [ ] `git clone https://github.com/usenocturne/nocturne` and check out the
      **v4.0.6** tag (match the current release).
- [ ] Skim `scripts/build.sh` + `Justfile` to confirm the exact build invocation
      before changing anything.

---

## Phase 3 — Patch the image (the two changes)

> Read each file first and confirm the current contents — the snippets below are
> the *intent*; exact lines must match the real v4.0.6 source.

### 3a. USB gadget: RNDIS → NCM
File: `external/board/nocturne/rootfs_overlay/etc/init.d/S49usbgadget`
- [ ] Replace the configfs **`functions/rndis.usb0`** function with
      **`functions/ncm.usb0`** (and its symlink into `configs/c.1`). Keep the
      addressing: device `172.16.42.2/24`, host gateway `172.16.42.1`.
- [ ] Ensure the kernel builds the NCM gadget function: **`CONFIG_USB_CONFIGFS_NCM=y`**
      (pulls in `CONFIG_USB_F_NCM`). Add it to the kernel config /
      `configs/nocturne_defconfig`'s linux fragment if missing. **This is the
      single most likely thing to need a kernel rebuild — verify it's present.**

### 3b. Kiosk URL → the Mac
File: `external/board/nocturne/rootfs_overlay/etc/supervisord.conf` (`[program:chromium]`)
- [ ] Add to its `environment=` line:
      **`NOCTURNE_CHROMIUM_URL="http://172.16.42.1:4000"`**
      (`bin/start-chromium` reads this; default is `http://localhost:8080`).
- [ ] Leave `NOCTURNE_CHROMIUM_WAIT_URL` at its local default so the kiosk still
      launches when the Mac/feeder is momentarily down (it'll show our reconnect state).

> Note: the nocturne-ui README's `--app=...` edit is **stale** — the URL now
> comes from the env var, not a `--app` flag.

*(Optional 3c — offline fallback: also drop `dashboard/dist/*` into the overlay
at `etc/nocturne/ui` so the device shows something if the Mac is absent. Skip for
pure thin-client.)*

---

## Phase 4 — Build the image

- [ ] Run the Nocturne build (`./scripts/build.sh` or the `Justfile` target). It
      fetches stock GPU/Chromium blobs and cross-compiles. **~30–90 min.**
- [ ] Output: a flashable image/folder under `output/` (the artifact Terbium loads).

---

## Phase 5 — Flash via Terbium (back on the Mac)

- [ ] Copy the built image out of the Linux VM to the Mac.
- [ ] Enter burn mode: **hold buttons 1 + 4 while plugging in USB-C**.
- [ ] Open **terbium.app** in **Chrome/Edge** → device shows as `GX-CHIP` →
      choose the local image folder → flash (**~5–10 min**). No macOS driver needed.

---

## Phase 6 — Bring up the Mac NCM link

- [ ] After the device boots, a new **USB Ethernet** interface appears on the Mac.
- [ ] Assign it `172.16.42.1/24` (System Settings → Network → that interface →
      Manual `172.16.42.1` / `255.255.255.0`, or
      `sudo ifconfig <ifN> 172.16.42.1 255.255.255.0 up`).
- [ ] Verify: `ping 172.16.42.2` (the device).

---

## Phase 7 — Run & verify

- [ ] On the Mac: `bun run feeder` (serves `dist/` + WS on `0.0.0.0:4000`).
- [ ] The device kiosk loads `http://172.16.42.1:4000` → dashboard → connects
      `ws://172.16.42.1:4000/ws` → **live data on the real screen.**
- [ ] Verify on real **Chromium 69**: layout at 800×480, the knob/buttons arrive
      as keydowns (Back = Esc → board), the "needs-you" toast, the usage page.
- [ ] **Iterate:** edit UI → `bun run ui:build` → refresh the kiosk (or it
      reconnects). No reflash needed.

---

## Risks & honest unknowns

1. **NCM is unverified for this exact device.** macOS supports CDC-NCM natively,
   but no published Nocturne NCM build was found. The kernel option
   (`CONFIG_USB_CONFIGFS_NCM`) is the crux — confirm it's compiled in; otherwise
   it's a kernel-config rebuild. Validate the Mac actually enumerates the interface.
2. **Buildroot host-package friction** is normal — follow the build errors.
3. **Fallbacks if NCM doesn't cooperate:**
   - **Mac-native ADB deploy** (no live data, but proves the UI on real hardware):
     flash stock Nocturne → `superbird-tool --boot_adb_kernel a` → `adb shell`,
     `mount -o remount,rw /`, `adb push dist/. /etc/nocturne/ui/` → reboot.
   - **Raspberry Pi / Linux bridge** (the sanctioned Nocturne host): NATs the
     device onto the LAN; kiosk points at the Mac's LAN IP. Most robust if available.

---

## Recommended de-risking first step (cheap, before the big build)

Validate **Chromium-69 rendering on real hardware** without building an image:

- [ ] Flash **stock Nocturne** via Terbium.
- [ ] `superbird-tool --boot_adb_kernel a` → `adb shell` → `mount -o remount,rw /`
      → `adb push dist/. /etc/nocturne/ui/` → reboot.
- [ ] The dashboard renders (it'll show the reconnecting state — no live data yet),
      confirming the UI/layout/inputs work on the device before we invest in the
      NCM image build.

---

## Source references (from research, v4.0.6 / June 2026)

- Firmware/build: `github.com/usenocturne/nocturne` — `scripts/build.sh`, `Justfile`, `configs/nocturne_defconfig`
- Gadget: `.../rootfs_overlay/etc/init.d/S49usbgadget` (RNDIS today)
- Kiosk: `.../rootfs_overlay/bin/start-chromium` (`NOCTURNE_CHROMIUM_URL`), `.../etc/supervisord.conf`
- Daemon: `nocturned` serves `/etc/nocturne/ui` at `127.0.0.1:8080`, WebSocket at `127.0.0.1:5000`
- Flasher: `terbium.app` (WebUSB; Chrome/Edge) · Low-level/ADB: `github.com/Car-Thing-Hax-Community/superbird-tool`
- Device SSH (if ever on a Linux/Pi host): `root@172.16.42.2`, password `nocturne`, rootfs is read-only (`mount -o remount,rw /`)
