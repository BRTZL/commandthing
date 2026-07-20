/**
 * Mac-side feeder service.
 *
 * Responsibilities:
 *  - Watch ~/.claude for live sessions (claudeWatcher) + accept hook signals.
 *  - Poll the local Open Usage API for AI spend.
 *  - Broadcast a DashboardState over a WebSocket using nocturned's event
 *    envelope, so the same dashboard works here and on the Car Thing.
 *  - Serve the built dashboard from apps/dashboard/dist for browser preview.
 *
 * Run from the workspace root with: pnpm feeder (PORT=4000 by default)
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hostname } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DashboardState,
  emptyState,
  type MediaControl,
  type NocturneEvent,
  type NowPlaying,
  WS_TOPIC,
} from "@commandthing/protocol";
import WebSocket, { WebSocketServer } from "ws";
import { buildSessions } from "./claudeWatcher.ts";
import { config, configPath } from "./config.ts";
import { HookStore } from "./hooks.ts";
import { ensureLyrics, getNowPlaying, mediaControl } from "./media.ts";
import { getSessionDetail } from "./sessionDetail.ts";
import { getUsage } from "./usage.ts";

const { port: PORT, host: HOST } = config.server;
const { sessionsMs: POLL_MS, mediaMs: MEDIA_MS } = config.refresh;
const moduleDir = dirname(fileURLToPath(import.meta.url));
const packagedDist = join(moduleDir, "dashboard");
const DIST_DIR = existsSync(join(packagedDist, "index.html"))
  ? packagedDist
  : join(moduleDir, "..", "..", "dashboard", "dist");

const hooks = new HookStore();
const clients = new Set<WebSocket>();
let current: DashboardState = emptyState(hostname());
let nowPlaying: NowPlaying | null = null;
const artCache = new Map<string, Buffer>(); // proxied Spotify album art

function rebuild(): void {
  const now = Date.now();
  const next: DashboardState = {
    generatedAt: now,
    host: hostname(),
    sessions: buildSessions(hooks, now),
    usage: getUsage(),
    nowPlaying,
  };
  current = next;
  broadcast();
}

/** Sample Spotify (+ attach cached lyrics) and broadcast. Runs every MEDIA_MS. */
async function refreshMedia(): Promise<void> {
  const np = await getNowPlaying();
  if (np?.trackId) {
    const ly = ensureLyrics(np);
    np.lyrics = ly.lines;
    np.lyricsLoaded = ly.loaded;
  }
  nowPlaying = np;
  current = { ...current, nowPlaying };
  broadcast();
}

function envelope(): NocturneEvent<DashboardState> {
  return { type: "event", topic: WS_TOPIC, data: current };
}

function broadcast(): void {
  if (clients.size === 0) return;
  const payload = JSON.stringify(envelope());
  for (const ws of clients) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    } catch {
      /* dropped on next close */
    }
  }
}

/** nocturned-style request/response over the same socket (ports to the device). */
async function handleRequest(
  ws: WebSocket,
  msg: { id: string; method?: string; params?: any },
): Promise<void> {
  try {
    if (msg.method === "session.detail") {
      const detail = getSessionDetail(String(msg.params?.id ?? ""), hooks);
      if (!detail) {
        ws.send(JSON.stringify({ type: "error", id: msg.id, error: "session not found" }));
        return;
      }
      ws.send(JSON.stringify({ type: "response", id: msg.id, result: detail }));
      return;
    }
    if (msg.method === "media.control") {
      await mediaControl(msg.params as MediaControl);
      await refreshMedia(); // push the new state right away so the UI feels instant
      ws.send(JSON.stringify({ type: "response", id: msg.id, result: { ok: true } }));
      return;
    }
    ws.send(JSON.stringify({ type: "error", id: msg.id, error: `unknown method: ${msg.method}` }));
  } catch (e: any) {
    ws.send(JSON.stringify({ type: "error", id: msg.id, error: String(e?.message ?? e) }));
  }
}

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

function send(res: ServerResponse, status: number, body: string | Buffer, headers = {}): void {
  res.writeHead(status, headers);
  res.end(body);
}

function json(res: ServerResponse, value: unknown, status = 200): void {
  send(res, status, JSON.stringify(value), { "content-type": "application/json; charset=utf-8" });
}

async function requestJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  if (!existsSync(DIST_DIR)) {
    send(
      res,
      200,
      "Dashboard not built yet. Run `pnpm build` at the workspace root, then reload. " +
        "The WebSocket feed is live at /ws.",
      { "content-type": "text/plain; charset=utf-8" },
    );
    return;
  }
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const root = resolve(DIST_DIR);
  let file = resolve(root, rel);
  if (!file.startsWith(`${root}/`) || !existsSync(file)) file = join(root, "index.html");
  send(res, 200, await readFile(file), {
    "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
  });
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
  try {
    if (url.pathname === "/health") {
      json(res, {
        ok: true,
        clients: clients.size,
        sessions: current.sessions.length,
        generatedAt: current.generatedAt,
      });
      return;
    }

    if (url.pathname === "/state") {
      json(res, current);
      return;
    }

    // Album-art proxy: the device has no internet, so it loads Spotify CDN art
    // through here. Restricted to the Spotify image host; cached in memory.
    if (url.pathname === "/api/artwork") {
      const u = url.searchParams.get("u") ?? "";
      if (!u.startsWith("https://i.scdn.co/")) {
        send(res, 400, "bad art url");
        return;
      }
      const headers = { "content-type": "image/jpeg", "cache-control": "max-age=86400" };
      const hit = artCache.get(u);
      if (hit) {
        send(res, 200, hit, headers);
        return;
      }
      try {
        const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
        artCache.set(u, buf);
        send(res, 200, buf, headers);
      } catch {
        send(res, 502, "art fetch failed");
      }
      return;
    }

    // HTTP mirrors of the WS data (handy for curl/debugging; UI uses the WS).
    if (url.pathname === "/api/usage") {
      json(res, getUsage());
      return;
    }
    if (url.pathname.startsWith("/api/session/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/session/".length));
      const detail = getSessionDetail(id, hooks);
      if (!detail) {
        send(res, 404, "session not found");
        return;
      }
      json(res, detail);
      return;
    }

    if (url.pathname === "/hook" && req.method === "POST") {
      const body = await requestJson(req);
      const changed = hooks.ingest(body);
      if (changed) rebuild();
      json(res, { ok: changed });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error("[feeder] request failed", error);
    if (!res.headersSent) send(res, 500, "internal server error");
    else res.end();
  }
}

const server = createServer((req, res) => {
  void handleHttp(req, res);
});
const webSockets = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  webSockets.handleUpgrade(req, socket, head, (ws) => webSockets.emit("connection", ws, req));
});

webSockets.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify(envelope()));
  ws.on("close", () => clients.delete(ws));
  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg && msg.type === "request" && typeof msg.id === "string") {
      void handleRequest(ws, msg);
    }
  });
});

await new Promise<void>((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(PORT, HOST, () => resolveListen());
});

rebuild();
setInterval(rebuild, POLL_MS);
refreshMedia();
setInterval(refreshMedia, MEDIA_MS);

console.log(`[feeder] http://localhost:${PORT}  ws://localhost:${PORT}/ws`);
console.log(`[feeder] config: ${configPath}${existsSync(configPath) ? "" : " (defaults)"}`);
console.log(`[feeder] polling ~/.claude every ${POLL_MS}ms`);
console.log(`[feeder] hook receiver: POST http://localhost:${PORT}/hook`);
