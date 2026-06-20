/**
 * Mac-side feeder service.
 *
 * Responsibilities:
 *  - Watch ~/.claude for live sessions (claudeWatcher) + accept hook signals.
 *  - Pull calendar events (mock for now).
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
import { type DashboardState, emptyState, type NocturneEvent, WS_TOPIC } from "../../shared/protocol.ts";
import { CALENDAR_SOURCE, getCalendar } from "./calendar.ts";
import { buildSessions } from "./claudeWatcher.ts";
import { HookStore } from "./hooks.ts";
import { getSessionDetail } from "./sessionDetail.ts";
import { getUsage } from "./usage.ts";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0"; // bind all interfaces so the device can reach us over USB-net
const POLL_MS = Number(process.env.POLL_MS ?? 2000);
const DIST_DIR = join(import.meta.dir, "..", "..", "dashboard", "dist");

const hooks = new HookStore();
const clients = new Set<ServerWebSocket<unknown>>();
let current: DashboardState = emptyState(hostname());

function rebuild(): void {
  const now = Date.now();
  const next: DashboardState = {
    generatedAt: now,
    host: hostname(),
    sessions: buildSessions(hooks, now),
    calendar: getCalendar(now),
    calendarSource: CALENDAR_SOURCE,
    usage: getUsage(),
  };
  current = next;
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
function handleRequest(
  ws: ServerWebSocket<unknown>,
  msg: { id: string; method?: string; params?: any },
): void {
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
        handleRequest(ws, msg);
      }
    },
  },
});

rebuild();
setInterval(rebuild, POLL_MS);

console.log(`[feeder] http://localhost:${server.port}  ws://localhost:${server.port}/ws`);
console.log(`[feeder] polling ~/.claude every ${POLL_MS}ms; calendar source = ${CALENDAR_SOURCE}`);
console.log(`[feeder] hook receiver: POST http://localhost:${server.port}/hook`);
