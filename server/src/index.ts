/**
 * Mac-side feeder service.
 *
 * Responsibilities:
 *  - Watch ~/.claude for live sessions (claudeWatcher) + accept hook signals.
 *  - Poll the local Open Usage API for AI spend.
 *  - Broadcast a DashboardState over a WebSocket using nocturned's event
 *    envelope, so the same dashboard works here and on the Car Thing.
 *  - Optionally serve the built dashboard (dashboard/dist) for browser preview.
 *
 * Run: bun run server/src/index.ts   (PORT=4000 by default)
 */

import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import {
  type DashboardState,
  emptyState,
  type MediaControl,
  type NocturneEvent,
  type NowPlaying,
  WS_TOPIC,
} from "../../shared/protocol.ts";
import { buildSessions } from "./claudeWatcher.ts";
import { HookStore } from "./hooks.ts";
import { ensureLyrics, getNowPlaying, mediaControl } from "./media.ts";
import { getSessionDetail } from "./sessionDetail.ts";
import { getUsage } from "./usage.ts";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0"; // bind all interfaces so the device can reach us over USB-net
const POLL_MS = Number(process.env.POLL_MS ?? 2000);
const MEDIA_MS = Number(process.env.MEDIA_MS ?? 1000); // now-playing samples faster than sessions
const DIST_DIR = join(import.meta.dir, "..", "..", "dashboard", "dist");

const hooks = new HookStore();
const clients = new Set<ServerWebSocket<unknown>>();
let current: DashboardState = emptyState(hostname());
let nowPlaying: NowPlaying | null = null;
const artCache = new Map<string, ArrayBuffer>(); // proxied Spotify album art

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
      ws.send(payload);
    } catch {
      /* dropped on next close */
    }
  }
}

/** nocturned-style request/response over the same socket (ports to the device). */
async function handleRequest(
  ws: ServerWebSocket<unknown>,
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

async function serveStatic(pathname: string): Promise<Response> {
  if (!existsSync(DIST_DIR)) {
    return new Response(
      "Dashboard not built yet. Run `bun run dev` in dashboard/ for HMR, " +
        "or `bun run build` then reload. The WebSocket feed is live at /ws.",
      { status: 200, headers: { "content-type": "text/plain" } },
    );
  }
  const rel = pathname === "/" ? "/index.html" : pathname;
  let file = Bun.file(join(DIST_DIR, rel));
  if (!(await file.exists())) file = Bun.file(join(DIST_DIR, "index.html")); // SPA fallback
  return new Response(file);
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined as unknown as Response;
      return new Response("websocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        clients: clients.size,
        sessions: current.sessions.length,
        generatedAt: current.generatedAt,
      });
    }

    if (url.pathname === "/state") {
      return Response.json(current);
    }

    // Album-art proxy: the device has no internet, so it loads Spotify CDN art
    // through here. Restricted to the Spotify image host; cached in memory.
    if (url.pathname === "/api/artwork") {
      const u = url.searchParams.get("u") ?? "";
      if (!u.startsWith("https://i.scdn.co/")) return new Response("bad art url", { status: 400 });
      const headers = { "content-type": "image/jpeg", "cache-control": "max-age=86400" };
      const hit = artCache.get(u);
      if (hit) return new Response(hit, { headers });
      try {
        const buf = await (await fetch(u)).arrayBuffer();
        artCache.set(u, buf);
        return new Response(buf, { headers });
      } catch {
        return new Response("art fetch failed", { status: 502 });
      }
    }

    // HTTP mirrors of the WS data (handy for curl/debugging; UI uses the WS).
    if (url.pathname === "/api/usage") {
      return Response.json(getUsage());
    }
    if (url.pathname.startsWith("/api/session/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/session/".length));
      const detail = getSessionDetail(id, hooks);
      if (!detail) return new Response("session not found", { status: 404 });
      return Response.json(detail);
    }

    if (url.pathname === "/hook" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      const changed = hooks.ingest(body);
      if (changed) rebuild();
      return Response.json({ ok: changed });
    }

    return serveStatic(url.pathname);
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      ws.send(JSON.stringify(envelope()));
    },
    close(ws) {
      clients.delete(ws);
    },
    message(ws, raw) {
      let msg: any;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        return;
      }
      if (msg && msg.type === "request" && typeof msg.id === "string") {
        void handleRequest(ws, msg);
      }
    },
  },
});

rebuild();
setInterval(rebuild, POLL_MS);
refreshMedia();
setInterval(refreshMedia, MEDIA_MS);

console.log(`[feeder] http://localhost:${server.port}  ws://localhost:${server.port}/ws`);
console.log(`[feeder] polling ~/.claude every ${POLL_MS}ms`);
console.log(`[feeder] hook receiver: POST http://localhost:${server.port}/hook`);
