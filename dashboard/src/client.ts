import { type DashboardState, WS_TOPIC } from "./dashboardTypes";

/**
 * Single WebSocket client used app-wide. Handles:
 *  - the live state broadcast ({type:event, topic:"dashboard.update"})
 *  - nocturned-style request/response ({type:request} → {type:response|error})
 * with auto-reconnect. One socket, shared by every page.
 */

function resolveUrl(): string {
  const param = new URLSearchParams(window.location.search).get("ws");
  if (param) return param;
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

type StateCb = (s: DashboardState) => void;
type StatusCb = (connected: boolean) => void;

interface Pending {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  timer: number;
}

class DashboardClient {
  private url = resolveUrl();
  private socket: WebSocket | null = null;
  private stopped = false;
  private backoff = 500;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private sendQueue: string[] = [];
  private stateCbs = new Set<StateCb>();
  private statusCbs = new Set<StatusCb>();
  private lastState: DashboardState | null = null;
  private connected = false;

  constructor() {
    this.open();
  }

  onState(cb: StateCb): () => void {
    this.stateCbs.add(cb);
    if (this.lastState) cb(this.lastState);
    return () => this.stateCbs.delete(cb);
  }

  onStatus(cb: StatusCb): () => void {
    this.statusCbs.add(cb);
    cb(this.connected);
    return () => this.statusCbs.delete(cb);
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = `r${++this.seq}`;
      const payload = JSON.stringify({ type: "request", id, method, params });
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        const i = this.sendQueue.indexOf(payload);
        if (i >= 0) this.sendQueue.splice(i, 1);
        reject(new Error("request timed out"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      // Queue and flush — if the socket isn't open yet, it sends on connect.
      this.sendQueue.push(payload);
      this.flush();
    });
  }

  private flush(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    while (this.sendQueue.length) {
      const m = this.sendQueue.shift()!;
      try {
        this.socket.send(m);
      } catch {
        this.sendQueue.unshift(m);
        break;
      }
    }
  }

  private open(): void {
    this.socket = new WebSocket(this.url);
    this.socket.onopen = () => {
      this.backoff = 500;
      this.setConnected(true);
      this.flush();
    };
    this.socket.onmessage = (e) => this.onMessage(e);
    this.socket.onclose = () => {
      this.setConnected(false);
      this.rejectAll();
      if (this.stopped) return;
      this.backoff = Math.min(this.backoff * 2, 5000);
      window.setTimeout(() => this.open(), this.backoff);
    };
    this.socket.onerror = () => {
      try {
        this.socket?.close();
      } catch {
        /* onclose reconnects */
      }
    };
  }

  private onMessage(e: MessageEvent): void {
    let msg: any;
    try {
      msg = JSON.parse(e.data as string);
    } catch {
      return;
    }
    if (msg.type === "event" && msg.topic === WS_TOPIC) {
      this.lastState = msg.data as DashboardState;
      this.stateCbs.forEach((cb) => {
        cb(msg.data);
      });
      return;
    }
    if ((msg.type === "response" || msg.type === "error") && typeof msg.id === "string") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      window.clearTimeout(p.timer);
      if (msg.type === "response") p.resolve(msg.result);
      else p.reject(new Error(msg.error || "request error"));
    }
  }

  private setConnected(c: boolean): void {
    this.connected = c;
    this.statusCbs.forEach((cb) => {
      cb(c);
    });
  }

  private rejectAll(): void {
    this.sendQueue = [];
    for (const [, p] of this.pending) {
      window.clearTimeout(p.timer);
      p.reject(new Error("disconnected"));
    }
    this.pending.clear();
  }
}

export const client = new DashboardClient();
