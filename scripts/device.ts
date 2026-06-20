#!/usr/bin/env bun
/**
 * Device control over Chrome DevTools Protocol (CDP).
 *
 * The Car Thing kiosk runs Chromium with remote debugging exposed on the device
 * at :CDP_PORT. We reach it from the Mac by `adb forward tcp:CDP_PORT
 * tcp:CDP_PORT` (this script arms that itself), then drive the page over a CDP
 * WebSocket.
 *
 * Usage:
 *   bun run scripts/device.ts reload            # hard-reload the kiosk (picks up a fresh `dist`)
 *   bun run scripts/device.ts shot [out.png]    # screenshot the screen (default: device-shot.png)
 *   bun run scripts/device.ts open <hash>       # navigate, e.g. `open /usage` or `open /session/<id>`
 *   bun run scripts/device.ts info              # print page url / UA / viewport
 *
 * Env: CDP_PORT (2222) — the device-side remote-debugging port.
 *
 * Notes:
 *  - Expressions sent to the device are evaluated by Chromium ~69 — keep them
 *    ES5-ish (no optional chaining / nullish coalescing).
 *  - If `adb` shows no device, this exits non-zero with a clear message; replug
 *    the Car Thing and retry.
 */

const CDP_PORT = Number(process.env.CDP_PORT ?? 2222);
const [cmd, arg] = process.argv.slice(2);

function die(msg: string): never {
  console.error(`device: ${msg}`);
  process.exit(1);
}

/** Ensure `adb forward tcp:CDP_PORT tcp:CDP_PORT` is in place (idempotent). */
async function ensureForward(): Promise<void> {
  const p = Bun.spawn(["adb", "forward", `tcp:${CDP_PORT}`, `tcp:${CDP_PORT}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await p.exited;
  if (code !== 0) {
    const err = await new Response(p.stderr).text();
    die(`could not arm 'adb forward tcp:${CDP_PORT}' — is the device on adb?\n  ${err.trim()}`);
  }
}

/** Find the kiosk page target's CDP WebSocket URL. */
async function pageTarget(): Promise<string> {
  let list: any[];
  try {
    list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
  } catch {
    return die(`no DevTools on localhost:${CDP_PORT} — is the kiosk running and adb connected?`);
  }
  const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl) ?? list[0];
  if (!page?.webSocketDebuggerUrl) die("no debuggable page target found on the device");
  return page.webSocketDebuggerUrl;
}

/** Minimal CDP client: open socket, send commands, await results by id. */
async function connect(wsUrl: string) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = () => r(null)));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m.result);
      pending.delete(m.id);
    }
  };
  const send = (method: string, params: any = {}) =>
    new Promise<any>((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function main() {
  if (!cmd || !["reload", "shot", "open", "info"].includes(cmd)) {
    die("usage: device.ts <reload|shot [out.png]|open <hash>|info>");
  }
  await ensureForward();
  const { send, close } = await connect(await pageTarget());
  await send("Page.enable");

  if (cmd === "reload") {
    await send("Page.reload", { ignoreCache: true });
    console.log("device: reloaded");
  } else if (cmd === "shot") {
    const out = arg ?? "device-shot.png";
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (!r?.data) die("screenshot returned no data");
    await Bun.write(out, Buffer.from(r.data, "base64"));
    console.log(`device: saved ${out}`);
  } else if (cmd === "open") {
    if (!arg) die("open needs a hash route, e.g. `open /usage`");
    const hash = arg.startsWith("#") ? arg : `#${arg}`;
    await send("Runtime.enable");
    await send("Runtime.evaluate", {
      expression: `location.hash=${JSON.stringify(hash)}`,
    });
    console.log(`device: opened ${hash}`);
  } else if (cmd === "info") {
    await send("Runtime.enable");
    const expr =
      "JSON.stringify({url:location.href,ua:navigator.userAgent,dpr:window.devicePixelRatio,size:window.innerWidth+'x'+window.innerHeight})";
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    console.log("device:", r?.result?.value ?? "(no result)");
  }

  close();
}

main();
