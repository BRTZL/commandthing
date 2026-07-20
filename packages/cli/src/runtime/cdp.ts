import WebSocket from "ws";
import { run } from "./process.ts";

export interface CdpClient {
  send(method: string, params?: unknown): Promise<any>;
  close(): void;
  socket: WebSocket;
}

export async function connectCdp(port = Number(process.env.CDP_PORT ?? 2222)): Promise<CdpClient> {
  const forwarded = await run("adb", ["forward", `tcp:${port}`, `tcp:${port}`]);
  if (forwarded !== 0) throw new Error(`could not forward the device DevTools port ${port}`);

  let list: any[];
  try {
    list = await (await fetch(`http://localhost:${port}/json/list`)).json();
  } catch {
    throw new Error(`no DevTools endpoint on localhost:${port}; is the kiosk running?`);
  }
  const page = list.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ?? list[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("no debuggable page target found on the device");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let id = 0;
  const pending = new Map<number, (value: any) => void>();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)?.(message.result);
      pending.delete(message.id);
    }
  });
  const send = (method: string, params: unknown = {}) =>
    new Promise<any>((resolve) => {
      const requestId = ++id;
      pending.set(requestId, resolve);
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  return { send, close: () => socket.close(), socket };
}
