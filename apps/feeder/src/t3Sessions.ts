/**
 * Read-only view of T3 Code threads, taken from T3's own SQLite projections.
 *
 * T3 already tracks every provider's run state, so the dashboard shows what T3's
 * sidebar shows. The status rules mirror `resolveThreadStatusPill` in T3 Code.
 * The projection tables are T3 internals: a schema change surfaces as
 * `T3Snapshot.error` on the board instead of an empty list that looks healthy.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type {
  AgentSession,
  SessionDetail,
  SessionState,
  SessionTimelineItem,
  TodoItem,
} from "@commandthing/protocol";

const MAX_SESSIONS = 12;
const MAX_ITEMS = 150;

export const DEFAULT_T3_DB = join(homedir(), ".t3", "userdata", "statev2.sqlite");

export interface T3Snapshot {
  sessions: AgentSession[];
  error: string | null;
}

export interface ThreadStatusInput {
  pendingKind: string | null;
  activityStatus: string | null;
  latestStatus: string | null;
  completedAt: string | null;
  lastVisitedAt: string | null;
  /** Subagents, monitors, or tasks still running. Plain shell commands do not count. */
  backgroundWork?: number;
  pullRequestWatches?: number;
}

export interface ThreadStatus {
  state: SessionState;
  needsInput: boolean;
  label: string;
}

export function deriveThreadStatus(input: ThreadStatusInput): ThreadStatus {
  if (input.pendingKind) {
    const label = input.pendingKind === "user_input" ? "Awaiting Input" : "Pending Approval";
    return { state: "waiting", needsInput: true, label };
  }
  if (input.activityStatus === "running" || input.activityStatus === "waiting") {
    return { state: "working", needsInput: false, label: "Working" };
  }
  if (input.activityStatus || input.latestStatus === "queued") {
    return { state: "working", needsInput: false, label: "Connecting" };
  }
  const settled = input.latestStatus !== null && input.latestStatus !== "rolled_back";
  if ((settled && input.backgroundWork) || input.pullRequestWatches) {
    return { state: "background", needsInput: false, label: "Waiting" };
  }
  if (input.latestStatus === "failed") return { state: "failed", needsInput: false, label: "Failed" };
  if (input.latestStatus === "interrupted" || input.latestStatus === "cancelled") {
    return { state: "idle", needsInput: false, label: "Stopped" };
  }
  const unseen =
    input.latestStatus === "completed" &&
    (!input.lastVisitedAt || !input.completedAt || input.completedAt > input.lastVisitedAt);
  return unseen
    ? { state: "done", needsInput: false, label: "Completed" }
    : { state: "idle", needsInput: false, label: "Idle" };
}

const ACTIVITY_STATUSES = "('preparing','starting','running','waiting')";

const THREAD_COLUMNS = `
  t.thread_id AS id,
  t.title AS title,
  t.runtime_mode AS runtimeMode,
  t.updated_at AS updatedAt,
  p.title AS projectTitle,
  p.workspace_root AS workspaceRoot,
  json_extract(t.payload_json, '$.modelSelection.model') AS model,
  json_extract(t.payload_json, '$.branch') AS branch,
  json_extract(t.payload_json, '$.lastVisitedAt') AS lastVisitedAt,
  json_extract(t.payload_json, '$.settledOverride') AS settledOverride,
  json_extract(t.payload_json, '$.snoozedUntil') AS snoozedUntil,
  (SELECT r.status FROM orchestration_v2_projection_runs r
    WHERE r.thread_id = t.thread_id AND r.status IN ${ACTIVITY_STATUSES}
    ORDER BY r.ordinal DESC LIMIT 1) AS activityStatus,
  latest.status AS latestStatus,
  latest.requested_at AS requestedAt,
  latest.completed_at AS completedAt,
  COALESCE(
    (SELECT q.kind FROM orchestration_v2_projection_runtime_requests q
      WHERE q.thread_id = t.thread_id AND q.status = 'pending'
      ORDER BY q.created_at DESC LIMIT 1),
    (SELECT 'user_input' FROM orchestration_v2_projection_runs r
      CROSS JOIN orchestration_v2_projection_turn_items s
      WHERE r.thread_id = t.thread_id AND r.status IN ${ACTIVITY_STATUSES}
        AND s.thread_id = t.thread_id AND s.run_id = r.run_id
        AND s.type = 'secret_request' AND s.status = 'waiting'
      LIMIT 1)
  ) AS pendingKind,
  (
    EXISTS (SELECT 1 FROM orchestration_v2_projection_turn_items i
      LEFT JOIN orchestration_v2_projection_runs ir ON ir.run_id = i.run_id
      WHERE i.thread_id = t.thread_id AND i.type IN ('subagent', 'dynamic_tool')
        AND i.status IN ('pending', 'running', 'waiting')
        AND ir.status IS NOT 'rolled_back'
        AND json_extract(i.payload_json, '$.input.persistent') IS NOT 1)
    OR EXISTS (SELECT 1 FROM orchestration_v2_projection_provider_threads pt,
        json_each(pt.payload_json, '$.pendingBackgroundTasks') task
      WHERE pt.thread_id = t.thread_id
        AND (t.active_provider_thread_id IS NULL OR pt.provider_thread_id = t.active_provider_thread_id)
        AND json_extract(task.value, '$.kind') IS NOT 'command')
  ) AS backgroundWork,
  EXISTS (SELECT 1 FROM json_each(t.payload_json, '$.pullRequests') pr
    WHERE json_extract(pr.value, '$.watch') IS NOT NULL
      AND json_extract(pr.value, '$.source') IS NOT 'stack-dismissed') AS pullRequestWatches,
  (SELECT COUNT(*) FROM orchestration_v2_projection_subagents a
    WHERE a.thread_id = t.thread_id AND a.status = 'running') AS subagentCount,
  (SELECT substr(json_extract(m.payload_json, '$.text'), 1, 200)
    FROM orchestration_v2_projection_messages m
    WHERE m.thread_id = t.thread_id AND m.role = 'user'
    ORDER BY m.created_at DESC LIMIT 1) AS lastPrompt
`;

const THREAD_FROM = `
  FROM orchestration_v2_projection_threads t
  LEFT JOIN projection_projects p ON p.project_id = t.project_id
  LEFT JOIN orchestration_v2_projection_runs latest ON latest.run_id = (
    SELECT r.run_id FROM orchestration_v2_projection_runs r
    WHERE r.thread_id = t.thread_id ORDER BY r.ordinal DESC LIMIT 1
  )
`;

interface ThreadRow extends ThreadStatusInput {
  id: string;
  title: string;
  runtimeMode: string | null;
  updatedAt: string;
  projectTitle: string | null;
  workspaceRoot: string | null;
  model: string | null;
  branch: string | null;
  settledOverride: string | null;
  snoozedUntil: string | null;
  requestedAt: string | null;
  subagentCount: number;
  lastPrompt: string | null;
}

interface ItemRow {
  id: string;
  type: string;
  status: string;
  updatedAt: string | null;
  title: string | null;
  text: string | null;
  input: string | null;
  toolName: string | null;
  fileName: string | null;
  prompt: string | null;
  steps: string | null;
  failure: string | null;
}

const RANK: Record<SessionState, number> = {
  waiting: 0,
  working: 1,
  background: 2,
  failed: 3,
  done: 4,
  idle: 5,
};

export class T3Source {
  private db: DatabaseSync | null = null;
  private threads: StatementSync | null = null;
  private thread: StatementSync | null = null;
  private items: StatementSync | null = null;
  private messages: StatementSync | null = null;

  constructor(
    private readonly dbPath = process.env.COMMANDTHING_T3_DB || DEFAULT_T3_DB,
    private readonly runtimePath = join(dirname(dbPath), "server-runtime.json"),
  ) {}

  snapshot(now = Date.now()): T3Snapshot {
    const stopped = this.serverProblem();
    if (stopped) return { sessions: [], error: stopped };
    try {
      this.open();
      const rows = this.threads!.all() as unknown as ThreadRow[];
      const sessions = rows
        .filter((row) => isOnBoard(row, now))
        .map(toSession)
        .sort((a, b) => RANK[a.state] - RANK[b.state] || b.lastActivity - a.lastActivity)
        .slice(0, MAX_SESSIONS);
      return { sessions, error: null };
    } catch (error) {
      this.close();
      return { sessions: [], error: `T3 database: ${message(error)}` };
    }
  }

  detail(id: string, now = Date.now()): SessionDetail | null {
    if (!id) return null;
    this.open();
    const row = this.thread!.get(id) as unknown as ThreadRow | undefined;
    if (!row) return null;
    const session = toSession(row);
    const rows = (this.items!.all(id, MAX_ITEMS) as unknown as ItemRow[]).reverse();
    const counted = this.messages!.get(id) as unknown as { count: number };

    const toolCounts: Record<string, number> = {};
    let todos: TodoItem[] = [];
    const items: SessionTimelineItem[] = [];
    for (const row of rows) {
      const item = toTimelineItem(row);
      if (!item) continue;
      if (item.tool) toolCounts[item.tool.name] = (toolCounts[item.tool.name] ?? 0) + 1;
      if (item.todos) todos = item.todos;
      items.push(item);
    }

    return {
      id,
      project: session.project,
      projectPath: session.projectPath,
      title: session.title,
      gitBranch: session.gitBranch,
      model: session.model,
      state: session.state,
      statusLabel: session.statusLabel,
      needsInput: session.needsInput,
      messageCount: counted.count,
      toolCounts,
      todos,
      items,
      generatedAt: now,
    };
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      /* already closed */
    }
    this.db = null;
  }

  /** Run rows go stale when T3 exits, so "Working" must not outlive the server. */
  private serverProblem(): string | null {
    if (!existsSync(this.dbPath)) return `T3 database not found at ${this.dbPath}`;
    try {
      const { pid } = JSON.parse(readFileSync(this.runtimePath, "utf8")) as { pid: number };
      process.kill(pid, 0);
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return null;
      return "T3 Code is not running";
    }
  }

  private open(): void {
    if (this.db) return;
    const db = new DatabaseSync(this.dbPath, { readOnly: true });
    try {
      db.exec("PRAGMA busy_timeout = 250");
      this.threads = db.prepare(`
        SELECT ${THREAD_COLUMNS} ${THREAD_FROM}
        WHERE t.deleted_at IS NULL AND t.archived_at IS NULL
          AND json_extract(t.payload_json, '$.lineage.relationshipToParent') IS NOT 'subagent'
          AND (
            json_extract(t.payload_json, '$.settledOverride') IS NOT 'settled'
            OR EXISTS (SELECT 1 FROM orchestration_v2_projection_runs r
              WHERE r.thread_id = t.thread_id AND r.status IN ${ACTIVITY_STATUSES})
            OR EXISTS (SELECT 1 FROM orchestration_v2_projection_runtime_requests q
              WHERE q.thread_id = t.thread_id AND q.status = 'pending')
          )`);
      this.thread = db.prepare(`SELECT ${THREAD_COLUMNS} ${THREAD_FROM} WHERE t.thread_id = ?`);
      this.items = db.prepare(`
        SELECT i.turn_item_id AS id, i.type AS type, i.status AS status, i.updated_at AS updatedAt,
          json_extract(i.payload_json, '$.title') AS title,
          substr(json_extract(i.payload_json, '$.text'), 1, 2000) AS text,
          substr(json_extract(i.payload_json, '$.input'), 1, 300) AS input,
          json_extract(i.payload_json, '$.toolName') AS toolName,
          json_extract(i.payload_json, '$.fileName') AS fileName,
          substr(json_extract(i.payload_json, '$.prompt'), 1, 300) AS prompt,
          json_extract(i.payload_json, '$.steps') AS steps,
          json_extract(i.payload_json, '$.failure.message') AS failure
        FROM orchestration_v2_projection_turn_items i
        WHERE i.thread_id = ?
        ORDER BY i.ordinal DESC LIMIT ?`);
      this.messages = db.prepare(
        "SELECT COUNT(*) AS count FROM orchestration_v2_projection_messages WHERE thread_id = ?",
      );
      this.db = db;
    } catch (error) {
      db.close();
      throw error;
    }
  }
}

function isOnBoard(row: ThreadRow, now: number): boolean {
  const snoozed = row.snoozedUntil !== null && Date.parse(row.snoozedUntil) > now;
  return !snoozed || row.pendingKind !== null || row.activityStatus !== null;
}

function toSession(row: ThreadRow): AgentSession {
  const status = deriveThreadStatus(row);
  const root = row.workspaceRoot ?? "";
  const activity = row.activityStatus
    ? row.requestedAt
    : (row.completedAt ?? row.requestedAt ?? row.updatedAt);
  return {
    id: row.id,
    project: row.projectTitle ?? (basename(root) || "T3 Code"),
    projectPath: root,
    title: row.title || null,
    model: row.model,
    gitBranch: row.branch,
    lastActivity: Date.parse(activity ?? row.updatedAt) || 0,
    state: status.state,
    statusLabel: status.label,
    needsInput: status.needsInput,
    lastPrompt: row.lastPrompt,
    permissionMode: row.runtimeMode,
    subagentCount: row.subagentCount,
  };
}

function toTimelineItem(row: ItemRow): SessionTimelineItem | null {
  const ts = row.updatedAt ? Date.parse(row.updatedAt) || null : null;
  const base = { id: row.id, ts };
  const tool = (name: string, target: string | null): SessionTimelineItem => ({
    ...base,
    kind: "tool",
    title: name,
    tool: { name, target, status: toolStatus(row.status) },
  });
  switch (row.type) {
    case "user_message":
      return { ...base, kind: "prompt", title: "You", text: row.text };
    case "assistant_message":
      return row.text?.trim() ? { ...base, kind: "assistant", title: "Agent", text: row.text } : null;
    case "reasoning":
      return row.text?.trim()
        ? { ...base, kind: "thinking", title: "Thinking", text: row.text.slice(0, 500) }
        : null;
    case "command_execution":
      return tool("Shell", oneLine(row.input));
    case "dynamic_tool":
      return tool(row.toolName ?? "Tool", oneLine(row.input));
    case "file_change":
      return tool("Edit", row.fileName ? basename(row.fileName) : null);
    case "web_search":
      return tool("Search", row.title);
    case "subagent":
      return tool("Subagent", row.title);
    case "approval_request":
      return tool("Approval", oneLine(row.prompt));
    case "user_input_request":
      return tool("Question", row.title);
    case "todo_list":
      return { ...base, kind: "todos", title: "Updated tasks", todos: parseSteps(row.steps) };
    case "error":
      return { ...base, kind: "notification", title: "Error", text: row.failure ?? row.title };
    default:
      return null;
  }
}

function toolStatus(status: string): "ok" | "error" | "pending" {
  if (status === "completed") return "ok";
  if (status === "failed" || status === "cancelled" || status === "interrupted") return "error";
  return "pending";
}

function oneLine(value: string | null): string | null {
  return value ? value.replace(/\s+/g, " ").slice(0, 90) : null;
}

function parseSteps(raw: string | null): TodoItem[] {
  try {
    const steps = JSON.parse(raw ?? "[]") as { text?: string; status?: string }[];
    return steps.map((step) => ({ content: String(step.text ?? ""), status: String(step.status ?? "") }));
  } catch {
    return [];
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
