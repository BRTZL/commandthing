#!/usr/bin/env bun
/**
 * Dump the device renderer's COMPOSITED layers + why each is composited, via CDP
 * LayerTree. Composited layers are what leak Wayland buffers on this firmware, so
 * this shows exactly which CSS to flatten. Navigate the device to the page you
 * want first (it inspects whatever is on screen).
 *
 * Usage: bun run scripts/cdp-layers.ts
 * Env:   CDP_PORT (2222)
 */
const CDP_PORT = Number(process.env.CDP_PORT ?? 2222);
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
let layers: any[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data as string);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)!(m.result);
    pending.delete(m.id);
  } else if (m.method === "LayerTree.layerTreeDidChange") {
    if (m.params.layers) layers = m.params.layers;
  }
};
const send = (method: string, params: any = {}) =>
  new Promise<any>((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send("DOM.enable");
await send("LayerTree.enable");
await new Promise((r) => setTimeout(r, 1800)); // let layerTreeDidChange settle

console.log(`composited layers: ${layers.length}`);
for (const L of layers) {
  const area = (L.width || 0) * (L.height || 0);
  if (area < 64) continue; // skip slivers
  let reasons: string[] = [];
  try {
    const r = await send("LayerTree.compositingReasons", { layerId: L.layerId });
    reasons = r.compositingReasons || r.compositingReasonIds || [];
  } catch {
    /* root layer may have none */
  }
  console.log(
    `  ${String(Math.round(L.width)).padStart(4)}x${String(Math.round(L.height)).padEnd(4)} @${Math.round(L.offsetX || 0)},${Math.round(L.offsetY || 0)}  ${reasons.join(", ") || "(root/none)"}`,
  );
}
ws.close();
