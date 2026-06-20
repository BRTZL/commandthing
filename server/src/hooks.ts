/**
 * In-memory store of the latest Claude Code hook signal per session.
 *
 * Claude Code hooks deliver a JSON payload (on stdin) that includes
 * `session_id` and `hook_event_name`. A tiny shell hook forwards that payload
 * to the feeder's POST /hook endpoint; we map the event name to a session
 * state. These signals are authoritative over the file-recency heuristic.
 */

import type { SessionState } from "../../shared/protocol.ts";

export interface HookSignal {
  state: SessionState;
  needsInput: boolean;
  ts: number;
}

export class HookStore {
  private map = new Map<string, HookSignal>();

  /** Returns the latest signal for a session, if any. */
  get(sessionId: string): HookSignal | undefined {
    return this.map.get(sessionId);
  }

  /**
   * Ingests a raw Claude Code hook payload. Returns true if it mutated state.
   * Unknown shapes are ignored gracefully.
   */
  ingest(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false;
    const p = payload as Record<string, unknown>;
    const sessionId = (p.session_id ?? p.sessionId) as string | undefined;
    const event = (p.hook_event_name ?? p.event) as string | undefined;
    if (!sessionId || !event) return false;

    const mapped = mapEvent(event, p);
    if (!mapped) {
      this.map.delete(sessionId); // e.g. SessionEnd
      return true;
    }
    this.map.set(sessionId, { ...mapped, ts: Date.now() });
    return true;
  }
}

function mapEvent(
  event: string,
  payload: Record<string, unknown>,
): { state: SessionState; needsInput: boolean } | null {
  switch (event) {
    case "UserPromptSubmit":
    case "PreToolUse":
    case "PostToolUse":
      return { state: "working", needsInput: false };
    case "SessionStart":
      return { state: "working", needsInput: false };
    case "Stop":
      // Claude finished its turn — it's now waiting for you.
      return { state: "waiting", needsInput: true };
    case "Notification": {
      // Notifications often mean "needs your input / permission".
      const msg = String(payload.message ?? "").toLowerCase();
      const needsInput =
        msg.includes("waiting") || msg.includes("permission") || msg.includes("input") || msg === "";
      return { state: "waiting", needsInput };
    }
    case "SessionEnd":
      return null;
    default:
      return { state: "working", needsInput: false };
  }
}
