#!/usr/bin/env bun
/**
 * adb-reverse watchdog (Bun). Keeps `adb reverse tcp:PORT tcp:PORT` alive so the
 * Car Thing's localhost:PORT reaches this Mac's feeder, re-arming on every
 * (re)connect (the rule dies on device reboot / USB replug / adb-server restart).
 *
 * On each (re)connect it also nudges the kiosk to reload once the feeder answers.
 * Why: if the device boots before the feeder is up, the kiosk lands on a
 * connection-error page ("something went wrong") and the app never loads — so its
 * own WS auto-reconnect can't recover it; only a page reload does.
 *
 * Bun (not a bash script) on purpose: as a launchd agent this runs from the repo
 * under ~/Documents, which macOS TCC denies to a plain /bin/bash ("Operation not
 * permitted"). The bun runtime already has the access the feeder relies on, so
 * the watchdog rides along the same way.
 *
 * Usage: bun run scripts/connect.ts [port]   (default 4000)
 */

const PORT = Number(process.argv[2] ?? 4000);
const REPO = new URL("..", import.meta.url).pathname; // trailing slash

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(`[carthing] ${new Date().toTimeString().slice(0, 8)} ${m}`);

/** Run a command, resolving to its exit code (output discarded). */
function run(cmd: string[]): Promise<number> {
  return Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" }).exited;
}

async function adbState(): Promise<string> {
  const p = Bun.spawn(["adb", "get-state"], { stdout: "pipe", stderr: "ignore" });
  await p.exited;
  return (await new Response(p.stdout).text()).trim();
}

async function feederUp(): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${PORT}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Poll the feeder for ~60s, then reload the kiosk once it answers. Guards the
 *  cold-boot race where reverse arms before the feeder has bound the port. */
async function recoverKiosk(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (await feederUp()) {
      await run([process.execPath, "run", `${REPO}scripts/device.ts`, "reload"]);
      return;
    }
    await sleep(2000);
  }
}

log(`watchdog up - waiting for an adb device to arm reverse tcp:${PORT} ...`);
while (true) {
  await run(["adb", "wait-for-device"]);
  if ((await run(["adb", "reverse", `tcp:${PORT}`, `tcp:${PORT}`])) === 0) {
    log(`reverse armed: device localhost:${PORT} -> mac :${PORT}`);
    void recoverKiosk();
  } else {
    log("reverse failed (device offline/unauthorized?) - retrying");
    await sleep(2000);
    continue;
  }
  // Hold until the device drops, then loop to re-arm.
  while ((await adbState()) === "device") await sleep(2000);
  log("device disconnected - re-arming on reconnect");
}
