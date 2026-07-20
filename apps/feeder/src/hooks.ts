/**
 * In-memory store of the latest Claude Code hook signal per session.
 *
 * Claude Code hooks deliver a JSON payload (on stdin) that includes
 * `session_id` and `hook_event_name`. A tiny shell hook forwards that payload
 * to the feeder's POST /hook endpoint; we map the event name to a session
 * state. These signals are authoritative over the file-recency heuristic.
 */

import type { SessionState } from "@commandthing/protocol";

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

/**
 * Tools that always block on a human — using one means Claude is genuinely
 * asking you something, not just running work. These flip a session to the
 * warning-level "needs you" state; every other tool is plain `working`.
 */
const BLOCKING_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);

function mapEvent(
  event: string,
  payload: Record<string, unknown>,
): { state: SessionState; needsInput: boolean } | null {
  switch (event) {
    case "UserPromptSubmit":
    case "PostToolUse":
    case "SessionStart":
      return { state: "working", needsInput: false };
    case "PreToolUse": {
      // Most tools are just work; a couple block on you (a question / plan
      // approval) and are a real "needs you".
      const tool = String(payload.tool_name ?? payload.toolName ?? "");
      return BLOCKING_TOOLS.has(tool)
        ? { state: "waiting", needsInput: true }
        : { state: "working", needsInput: false };
    }
    case "Stop":
      // Claude finished its turn — your move now, but it isn't blocked on
      // anything. This is "done"/your-turn, NOT a warning.
      return { state: "done", needsInput: false };
    case "Notification": {
      // Prefer Claude Code's structured notification_type (documented, stable).
      // permission_prompt = blocked on you (real needs-you); idle_prompt =
      // "done, waiting for your next prompt" = your-turn, NOT a warning.
      const type = String(payload.notification_type ?? payload.notificationType ?? "");
      if (type === "permission_prompt") return { state: "waiting", needsInput: true };
      if (type === "idle_prompt") return { state: "done", needsInput: false };
      // Older clients omit the type — fall back to a conservative message
      // heuristic (better to over-surface a permission prompt than miss one).
      const msg = String(payload.message ?? "").toLowerCase();
      const needsInput =
        msg.includes("permission") || msg.includes("waiting") || msg.includes("input") || msg === "";
      return needsInput ? { state: "waiting", needsInput: true } : { state: "done", needsInput: false };
    }
    case "SessionEnd":
      return null;
    default:
      return { state: "working", needsInput: false };
  }
}
