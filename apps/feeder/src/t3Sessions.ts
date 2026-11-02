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
  SessionChanges,
  SessionDetail,
  SessionFocus,
  SessionPullRequest,
  SessionState,
  SessionTimelineItem,
  TodoItem,
} from "@commandthing/protocol";

const MAX_SESSIONS = 12;
const MAX_ITEMS = 150;
const MAX_PULL_REQUESTS = 2;
const MAX_CHANGED_FILES = 3;

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
  /** Subagents, background tasks, or anything the agent marked awaited. Plain commands and monitors do not count. */
  backgroundWork?: number;
  /** Unmerged pull requests the agent is watching. */
  pullRequestWatches?: number;
  /** The active run is only waiting on another thread (t3_thread_wait, or delegate_task in wait mode). */
  blockedOnThreadWait?: number;
  /** Messages from a guest share that nobody has answered. */
  guestRequests?: number;
  /** Plan mode, with a proposed plan waiting to be accepted. */
  planReady?: number;
}

export interface ThreadStatus {
  state: SessionState;
  needsInput: boolean;
  label: string;
}

const SETTLED = new Set(["cancelled", "completed", "failed", "interrupted"]);

/** Mirrors `resolveThreadStatusPill` in T3 Code's Sidebar.logic.ts, in the same order. */
export function deriveThreadStatus(input: ThreadStatusInput): ThreadStatus {
  if (input.pendingKind) {
    const label = input.pendingKind === "user_input" ? "Awaiting Input" : "Pending Approval";
    return { state: "waiting", needsInput: true, label };
  }
  if (input.guestRequests) return { state: "waiting", needsInput: true, label: "Guest Request" };
  const running = input.activityStatus === "running";
  if ((running && !input.blockedOnThreadWait) || input.activityStatus === "waiting") {
    return { state: "working", needsInput: false, label: "Working" };
  }
  if ((input.activityStatus && !running) || input.latestStatus === "queued") {
    return { state: "working", needsInput: false, label: "Connecting" };
  }
  // T3 counts background work only once the latest run has settled; a thread with no runs
  // can still be held by a watched pull request.
  const settled =
    input.latestStatus === null || SETTLED.has(input.latestStatus) || input.latestStatus === "waiting";
  const held =
    (input.latestStatus !== null && settled && input.backgroundWork) || (settled && input.pullRequestWatches);
  if ((running && input.blockedOnThreadWait) || (!input.activityStatus && held)) {
    return { state: "background", needsInput: false, label: "Waiting" };
  }
  if (input.latestStatus === "failed" && isAfter(input.completedAt, input.lastVisitedAt, true)) {
    return { state: "failed", needsInput: false, label: "Failed" };
  }
  if (input.planReady && input.latestStatus !== null && SETTLED.has(input.latestStatus)) {
    return { state: "done", needsInput: false, label: "Plan Ready" };
  }
  // A thread never opened in T3 shows no "Completed" pill, so it stays idle here too.
  if (input.completedAt && input.lastVisitedAt && isAfter(input.completedAt, input.lastVisitedAt, true)) {
    return { state: "done", needsInput: false, label: "Completed" };
  }
  return { state: "idle", needsInput: false, label: "Idle" };
}

/** Whether `a` is later than `b`; `fallback` when either is missing or unparsable. */
function isAfter(a: string | null, b: string | null, fallback: boolean): boolean {
  const left = a ? Date.parse(a) : Number.NaN;
  const right = b ? Date.parse(b) : Number.NaN;
  if (Number.isNaN(left) || Number.isNaN(right)) return fallback;
  return left > right;
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
        AND (json_extract(task.value, '$.awaited') = 1
          OR json_extract(task.value, '$.kind') IN ('subagent', 'background_task')))
  ) AS backgroundWork,
  EXISTS (SELECT 1 FROM json_each(t.payload_json, '$.pullRequests') pr
    WHERE json_extract(pr.value, '$.watch') IS NOT NULL
      AND json_extract(pr.value, '$.source') IS NOT 'stack-dismissed'
      AND json_extract(pr.value, '$.snapshot.state') IS NOT 'merged') AS pullRequestWatches,
  (SELECT COUNT(*) > 0 AND SUM(NOT (w.type = 'dynamic_tool' AND (
        json_extract(w.payload_json, '$.toolName') LIKE '%t3_thread_wait'
        OR (json_extract(w.payload_json, '$.toolName') LIKE '%delegate_task'
          AND json_extract(w.payload_json, '$.input.mode') = 'wait')))) = 0
    FROM orchestration_v2_projection_turn_items w
    WHERE w.thread_id = t.thread_id
      AND w.run_id = (SELECT r.run_id FROM orchestration_v2_projection_runs r
        WHERE r.thread_id = t.thread_id AND r.status = 'running' ORDER BY r.ordinal DESC LIMIT 1)
      AND w.type IN ('command_execution', 'dynamic_tool', 'subagent', 'file_change', 'file_search',
        'web_search', 'compaction')
      AND w.status IN ('running', 'waiting')
      AND NOT (w.type = 'subagent' AND json_extract(w.payload_json, '$.origin') IS 'app_owned')
  ) AS blockedOnThreadWait,
  (SELECT COUNT(*) FROM json_each(t.payload_json, '$.guestShare.messages') g
    WHERE json_extract(g.value, '$.status') = 'pending') AS guestRequests,
  (json_extract(t.payload_json, '$.interactionMode') IS 'plan' AND EXISTS (
    SELECT 1 FROM orchestration_v2_projection_plans pl
    WHERE pl.thread_id = t.thread_id AND pl.kind = 'proposed_plan' AND pl.status = 'active')) AS planReady,
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

interface CheckpointRow {
  capturedAt: string;
  files: string;
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
  questions: string | null;
  reason: string | null;
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
  private links: StatementSync | null = null;
  private checkpoint: StatementSync | null = null;

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
    const focus = buildFocus(session, rows);
    const links = this.links!.get(id) as { raw: string | null } | undefined;
    const checkpoint = this.checkpoint!.get(id) as unknown as CheckpointRow | undefined;
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
      lastActivity: session.lastActivity,
      subagentCount: session.subagentCount,
      focus,
      todos: latestTodos(rows),
      ...selectPullRequests(links?.raw ?? null),
      changes: checkpoint ? toChanges(checkpoint) : null,
      items: buildTimeline(rows, focus),
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
          json_extract(i.payload_json, '$.questions') AS questions,
          substr(json_extract(i.payload_json, '$.reason'), 1, 200) AS reason,
          json_extract(i.payload_json, '$.failure.message') AS failure
        FROM orchestration_v2_projection_turn_items i
        WHERE i.thread_id = ?
        ORDER BY i.ordinal DESC LIMIT ?`);
      // The payload is what T3 keeps syncing; projection_thread_pull_requests stopped updating.
      this.links = db.prepare(`
        SELECT json_extract(payload_json, '$.pullRequests') AS raw
        FROM orchestration_v2_projection_threads WHERE thread_id = ?`);
      this.checkpoint = db.prepare(`
        SELECT c.captured_at AS capturedAt, json_extract(c.payload_json, '$.files') AS files
        FROM orchestration_v2_projection_checkpoints c
        LEFT JOIN orchestration_v2_projection_runs r ON r.run_id = c.run_id
        WHERE c.thread_id = ? AND c.status = 'ready' AND r.status IS NOT 'rolled_back'
          AND json_array_length(c.payload_json, '$.files') > 0
        ORDER BY c.captured_at DESC LIMIT 1`);
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

const REQUEST_TYPES = new Set(["approval_request", "user_input_request", "secret_request"]);

function toolCall(row: ItemRow): { name: string; target: string | null } | null {
  switch (row.type) {
    case "command_execution":
      return { name: "Shell", target: oneLine(row.input) };
    case "dynamic_tool":
      return { name: row.toolName ?? "Tool", target: oneLine(row.input) };
    case "file_change":
      return { name: "Edit", target: row.fileName ? basename(row.fileName) : null };
    case "web_search":
      return { name: "Search", target: row.title };
    case "subagent":
      return { name: "Subagent", target: row.title };
    default:
      return null;
  }
}

function isActive(status: string): boolean {
  return status === "pending" || status === "running" || status === "waiting";
}

function isFailed(status: string): boolean {
  return status === "failed" || status === "cancelled" || status === "interrupted";
}

interface PullRequestLink {
  number: number;
  source?: string;
  linkedAt?: string;
  snapshot?: {
    state: SessionPullRequest["state"];
    title: string;
    isDraft?: boolean;
    checksState?: SessionPullRequest["checks"];
    reviewDecision?: SessionPullRequest["review"];
    mergeability?: string;
    additions?: number;
    deletions?: number;
    changedFiles?: number;
  } | null;
}

function urgency(pr: SessionPullRequest): number {
  if (pr.checks === "failing") return 0;
  if (pr.conflicting) return 1;
  if (pr.review === "changes-requested") return 2;
  if (pr.checks === "pending") return 3;
  return 4;
}

/** Open pull requests, most urgent first. With none open, only the latest one still matters. */
function selectPullRequests(raw: string | null): {
  pullRequests: SessionPullRequest[];
  hiddenPullRequests: number;
} {
  const links = parseJsonArray<PullRequestLink>(raw)
    .filter((link) => link.snapshot && link.source !== "stack-dismissed")
    .sort((a, b) => (b.linkedAt ?? "").localeCompare(a.linkedAt ?? ""));
  const all = links.map((link): SessionPullRequest => {
    const pr = link.snapshot!;
    return {
      number: link.number,
      title: pr.title,
      state: pr.state,
      isDraft: pr.isDraft === true,
      checks: pr.checksState ?? null,
      review: pr.reviewDecision ?? null,
      conflicting: pr.mergeability === "conflicting",
      additions: pr.additions ?? null,
      deletions: pr.deletions ?? null,
      changedFiles: pr.changedFiles ?? null,
    };
  });
  const open = all.filter((pr) => pr.state === "open").sort((a, b) => urgency(a) - urgency(b));
  if (open.length === 0) return { pullRequests: all.slice(0, 1), hiddenPullRequests: 0 };
  return {
    pullRequests: open.slice(0, MAX_PULL_REQUESTS),
    hiddenPullRequests: Math.max(0, open.length - MAX_PULL_REQUESTS),
  };
}

function toChanges(row: CheckpointRow): SessionChanges {
  const files = parseJsonArray<{ path: string; additions?: number; deletions?: number }>(row.files)
    .map((file) => ({
      path: file.path.split("/").slice(-2).join("/"),
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    }))
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
  return {
    capturedAt: Date.parse(row.capturedAt) || 0,
    fileCount: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    files: files.slice(0, MAX_CHANGED_FILES),
  };
}

function lastReply(rows: ItemRow[]): ItemRow | null {
  return rows.findLast((row) => row.type === "assistant_message" && row.text?.trim()) ?? null;
}

function buildFocus(session: AgentSession, rows: ItemRow[]): SessionFocus | null {
  if (session.needsInput) {
    const request = rows.findLast((row) => REQUEST_TYPES.has(row.type));
    if (request?.type === "approval_request") {
      return {
        kind: "request",
        title: "Approve this?",
        text: oneLine(request.prompt, 200),
        detail: request.reason,
      };
    }
    const question = parseQuestions(request?.questions ?? null)[0];
    return {
      kind: "request",
      title: question?.header || "Question for you",
      text: question?.question ?? request?.title ?? "Open T3 Code to respond.",
      options: question?.options?.map((option) => String(option.label ?? "")).filter(Boolean),
    };
  }
  if (session.state === "working" || session.state === "background") {
    const types = session.state === "background" ? ["subagent", "dynamic_tool"] : null;
    const running = rows.findLast(
      (row) => isActive(row.status) && toolCall(row) && (!types || types.includes(row.type)),
    );
    const call = running && toolCall(running);
    if (call) return { kind: "activity", title: call.name, text: call.target };
    return {
      kind: "activity",
      title: session.state === "working" ? "Thinking" : "Background work",
      text: null,
    };
  }
  if (session.state === "failed") {
    const failure = rows.findLast((row) => row.type === "error");
    return { kind: "error", title: "Run failed", text: failure?.failure ?? failure?.title ?? null };
  }
  const reply = lastReply(rows);
  return reply ? { kind: "reply", title: "Last reply", text: reply.text } : null;
}

function latestTodos(rows: ItemRow[]): TodoItem[] {
  const list = rows.findLast((row) => row.type === "todo_list");
  return list ? parseSteps(list.steps) : [];
}

/** Conversation in order, with runs of tool calls collapsed and reasoning left out. */
function buildTimeline(rows: ItemRow[], focus: SessionFocus | null): SessionTimelineItem[] {
  // The focus card already shows this row, so it is not repeated below.
  const skip =
    focus?.kind === "reply"
      ? lastReply(rows)
      : focus?.kind === "error"
        ? rows.findLast((row) => row.type === "error")
        : null;
  const items: SessionTimelineItem[] = [];
  for (const row of rows) {
    const ts = row.updatedAt ? Date.parse(row.updatedAt) || null : null;
    const call = toolCall(row);
    if (call) {
      let group = items.at(-1);
      if (group?.kind !== "tools") {
        group = {
          id: row.id,
          kind: "tools",
          ts,
          tools: { counts: [], lastTarget: null, failed: 0, running: false },
        };
        items.push(group);
      }
      const tools = group.tools!;
      const counted = tools.counts.find((entry) => entry.name === call.name);
      if (counted) counted.count += 1;
      else tools.counts.push({ name: call.name, count: 1 });
      tools.lastTarget = call.target ?? tools.lastTarget;
      if (isFailed(row.status)) tools.failed += 1;
      tools.running = isActive(row.status);
      group.ts = ts;
    } else if (row === skip) {
    } else if (row.type === "user_message" && row.text?.trim()) {
      items.push({ id: row.id, kind: "prompt", ts, text: row.text });
    } else if (row.type === "assistant_message" && row.text?.trim()) {
      items.push({ id: row.id, kind: "assistant", ts, text: row.text });
    } else if (row.type === "error") {
      items.push({ id: row.id, kind: "error", ts, text: row.failure ?? row.title });
    }
  }
  const last = items.at(-1)?.tools;
  if (focus?.kind === "activity" && last?.running && last.counts.length === 1 && last.counts[0].count === 1) {
    items.pop();
  }
  return items;
}

function oneLine(value: string | null, length = 90): string | null {
  return value ? value.replace(/\s+/g, " ").slice(0, length) : null;
}

function parseJsonArray<T>(raw: string | null): T[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseQuestions(raw: string | null) {
  return parseJsonArray<{ header?: string; question?: string; options?: { label?: string }[] }>(raw);
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
