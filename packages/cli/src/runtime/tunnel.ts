import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../../../apps/feeder/src/config.ts";
import { capture, run } from "./process.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message: string) =>
  console.log(`[commandthing] ${new Date().toTimeString().slice(0, 8)} ${message}`);

async function feederUp(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function recoverKiosk(port: number): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await feederUp(port)) {
      const packagedDevice = join(fileURLToPath(new URL(".", import.meta.url)), "device.js");
      if (existsSync(packagedDevice)) await run(process.execPath, [packagedDevice, "reload"]);
      return;
    }
    await sleep(2000);
  }
}

export async function runTunnel(): Promise<void> {
  const port = config.server.port;
  log(`watchdog up - waiting for an adb device to arm reverse tcp:${port} ...`);
  while (true) {
    await run("adb", ["wait-for-device"]);
    if ((await run("adb", ["reverse", `tcp:${port}`, `tcp:${port}`])) !== 0) {
      log("reverse failed (device offline/unauthorized?) - retrying");
      await sleep(2000);
      continue;
    }
    log(`reverse armed: device localhost:${port} -> mac :${port}`);
    void recoverKiosk(port);
    while (true) {
      try {
        if ((await capture("adb", ["get-state"])).trim() !== "device") break;
      } catch {
        break;
      }
      await sleep(2000);
    }
    log("device disconnected - re-arming on reconnect");
  }
}
