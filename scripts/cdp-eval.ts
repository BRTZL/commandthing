#!/usr/bin/env bun
/**
 * One-off CDP eval against the device kiosk. Prints the JSON-stringified value of
 * an expression evaluated in the page (Chromium ~69 — keep it ES5-ish).
 *
 * Usage: bun run scripts/cdp-eval.ts '<expression>'
 * Env:   CDP_PORT (2222)
 */
const CDP_PORT = Number(process.env.CDP_PORT ?? 2222);
const expr = process.argv[2] ?? "1";

await Bun.spawn(["adb", "forward", `tcp:${CDP_PORT}`, `tcp:${CDP_PORT}`], {
  stdout: "ignore",
  stderr: "ignore",
}).exited;

const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
const page = list.find((t: any) => t.type === "page" && t.webSocketDebuggerUrl) ?? list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
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

await send("Runtime.enable");
const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
console.log(JSON.stringify(r?.result?.value ?? r?.result ?? null));
ws.close();
