import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { deriveThreadStatus, T3Source } from "./t3Sessions.ts";

const IDLE = {
  pendingKind: null,
  activityStatus: null,
  latestStatus: null,
  completedAt: null,
  lastVisitedAt: null,
};

test("status follows T3's sidebar precedence", () => {
  assert.equal(
    deriveThreadStatus({ ...IDLE, pendingKind: "command", activityStatus: "running" }).label,
    "Pending Approval",
  );
  const input = deriveThreadStatus({ ...IDLE, pendingKind: "user_input" });
  assert.deepEqual(input, { state: "waiting", needsInput: true, label: "Awaiting Input" });
  assert.equal(deriveThreadStatus({ ...IDLE, activityStatus: "running" }).state, "working");
  assert.equal(deriveThreadStatus({ ...IDLE, activityStatus: "starting" }).label, "Connecting");
  assert.equal(deriveThreadStatus({ ...IDLE, latestStatus: "failed" }).label, "Failed");
  const background = deriveThreadStatus({ ...IDLE, latestStatus: "completed", backgroundWork: 1 });
  assert.deepEqual(background, { state: "background", needsInput: false, label: "Waiting" });
  assert.equal(deriveThreadStatus({ ...IDLE, pullRequestWatches: 1 }).label, "Waiting");
  assert.equal(deriveThreadStatus({ ...IDLE, backgroundWork: 1 }).label, "Idle");
  assert.equal(
    deriveThreadStatus({ ...IDLE, activityStatus: "running", backgroundWork: 1 }).label,
    "Working",
  );
});

test("a completed run stays unseen until the thread is visited", () => {
  const completed = { ...IDLE, latestStatus: "completed", completedAt: "2026-01-02T00:00:00.000Z" };
  assert.equal(deriveThreadStatus({ ...completed, lastVisitedAt: "2026-01-01T00:00:00.000Z" }).state, "done");
  assert.equal(deriveThreadStatus({ ...completed, lastVisitedAt: "2026-01-03T00:00:00.000Z" }).state, "idle");
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "t3-source-"));
  const dbPath = join(dir, "statev2.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE orchestration_v2_projection_threads (thread_id TEXT, project_id TEXT, title TEXT,
      runtime_mode TEXT, active_provider_thread_id TEXT, updated_at TEXT, archived_at TEXT, deleted_at TEXT, payload_json TEXT);
    CREATE TABLE projection_projects (project_id TEXT, title TEXT, workspace_root TEXT);
    CREATE TABLE orchestration_v2_projection_runs (run_id TEXT, thread_id TEXT, ordinal INT, status TEXT,
      requested_at TEXT, completed_at TEXT);
    CREATE TABLE orchestration_v2_projection_runtime_requests (thread_id TEXT, kind TEXT, status TEXT, created_at TEXT);
    CREATE TABLE orchestration_v2_projection_provider_threads (provider_thread_id TEXT, thread_id TEXT, payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_subagents (thread_id TEXT, status TEXT);
    CREATE TABLE orchestration_v2_projection_messages (thread_id TEXT, role TEXT, created_at TEXT, payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_turn_items (turn_item_id TEXT, thread_id TEXT, run_id TEXT, ordinal INT,
      type TEXT, status TEXT, updated_at TEXT, payload_json TEXT);
    INSERT INTO projection_projects VALUES ('p', 'carthing', '/work/carthing');
  `);
  const thread = db.prepare(
    "INSERT INTO orchestration_v2_projection_threads VALUES (?, 'p', ?, 'full-access', NULL, '2026-01-01T00:00:00.000Z', ?, NULL, ?)",
  );
  const payload = (extra: object) =>
    JSON.stringify({ modelSelection: { model: "opus" }, branch: "main", ...extra });
  thread.run("working", "Working one", null, payload({}));
  thread.run("blocked", "Blocked one", null, payload({}));
  thread.run("settled", "Settled one", null, payload({ settledOverride: "settled" }));
  thread.run("child", "Child", null, payload({ lineage: { relationshipToParent: "subagent" } }));
  thread.run("archived", "Archived", "2026-01-01T00:00:00.000Z", payload({}));
  thread.run("monitoring", "Monitoring", null, payload({}));
  thread.run("shell", "Dev server left running", null, payload({}));
  thread.run("snoozed", "Snoozed", null, payload({ snoozedUntil: "2999-01-01T00:00:00.000Z" }));
  db.exec(`
    INSERT INTO orchestration_v2_projection_runs VALUES ('r1', 'working', 1, 'running', '2026-01-01T00:00:00.000Z', NULL);
    INSERT INTO orchestration_v2_projection_runs VALUES ('r2', 'blocked', 1, 'running', '2026-01-01T00:00:00.000Z', NULL);
    INSERT INTO orchestration_v2_projection_runs VALUES ('r3', 'monitoring', 1, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO orchestration_v2_projection_runs VALUES ('r4', 'shell', 1, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO orchestration_v2_projection_provider_threads VALUES ('pt1', 'monitoring', '{"pendingBackgroundTasks":[{"taskId":"a","kind":"monitor"}]}');
    INSERT INTO orchestration_v2_projection_provider_threads VALUES ('pt2', 'shell', '{"pendingBackgroundTasks":[{"taskId":"b","kind":"command"}]}');
    INSERT INTO orchestration_v2_projection_runtime_requests VALUES ('blocked', 'user_input', 'pending', '2026-01-01T00:00:00.000Z');
    INSERT INTO orchestration_v2_projection_subagents VALUES ('working', 'running');
    INSERT INTO orchestration_v2_projection_messages VALUES ('working', 'user', '2026-01-01T00:00:00.000Z', '{"text":"fix it"}');
    INSERT INTO orchestration_v2_projection_turn_items VALUES
      ('i1', 'working', 'r1', 1, 'user_message', 'completed', NULL, '{"text":"fix it"}'),
      ('i0', 'working', 'r1', 2, 'reasoning', 'completed', NULL, '{"text":"hmm"}'),
      ('i4', 'working', 'r1', 2, 'command_execution', 'completed', NULL, '{"input":"ls"}'),
      ('i2', 'working', 'r1', 3, 'command_execution', 'running', NULL, '{"input":"pnpm\\n test"}'),
      ('q1', 'blocked', 'r2', 1, 'user_input_request', 'waiting', NULL, '{"questions":[{"header":"Deploy","question":"Ship it now?","options":[{"label":"Yes"},{"label":"No"}]}]}'),
      ('m1', 'shell', 'r4', 1, 'assistant_message', 'completed', NULL, '{"text":"All done"}'),
      ('i3', 'working', 'r1', 4, 'todo_list', 'running', NULL, '{"steps":[{"text":"ship","status":"pending"}]}');
  `);
  db.close();
  writeFileSync(join(dir, "server-runtime.json"), JSON.stringify({ pid: process.pid }));
  return { dir, dbPath };
}

test("board lists active root threads with blocked ones first", () => {
  const { dir, dbPath } = fixture();
  const source = new T3Source(dbPath);
  try {
    const { sessions, error } = source.snapshot();
    assert.equal(error, null);
    assert.deepEqual(
      sessions.map((s) => s.id),
      ["blocked", "working", "monitoring", "shell"],
    );
    assert.equal(sessions[0].needsInput, true);
    assert.equal(sessions[1].statusLabel, "Working");
    assert.equal(sessions[2].statusLabel, "Waiting");
    assert.equal(sessions[3].statusLabel, "Completed");
    assert.equal(sessions[1].subagentCount, 1);
    assert.equal(sessions[1].lastPrompt, "fix it");
    assert.equal(sessions[1].project, "carthing");
  } finally {
    source.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detail maps turn items to a timeline", () => {
  const { dir, dbPath } = fixture();
  const source = new T3Source(dbPath);
  try {
    source.snapshot();
    const detail = source.detail("working");
    assert.deepEqual(
      detail?.items.map((item) => item.kind),
      ["prompt", "tools"],
    );
    assert.deepEqual(detail?.items[1].tools, {
      counts: [{ name: "Shell", count: 2 }],
      lastTarget: "pnpm test",
      failed: 0,
      running: true,
    });
    assert.deepEqual(detail?.focus, { kind: "activity", title: "Shell", text: "pnpm test" });
    assert.deepEqual(detail?.todos, [{ content: "ship", status: "pending" }]);
    const blocked = source.detail("blocked");
    assert.deepEqual(blocked?.focus, {
      kind: "request",
      title: "Deploy",
      text: "Ship it now?",
      options: ["Yes", "No"],
    });
    const failed = source.detail("shell");
    assert.equal(failed?.focus?.kind, "reply");
    assert.equal(failed?.focus?.text, "All done");
    assert.deepEqual(failed?.items, []);
    assert.equal(source.detail("missing"), null);
  } finally {
    source.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("problems are reported instead of an empty healthy board", () => {
  const { dir, dbPath } = fixture();
  const source = new T3Source(dbPath);
  try {
    writeFileSync(join(dir, "server-runtime.json"), JSON.stringify({ pid: 2 ** 22 + 1 }));
    assert.equal(source.snapshot().error, "T3 Code is not running");
    writeFileSync(join(dir, "server-runtime.json"), JSON.stringify({ pid: process.pid }));
    const db = new DatabaseSync(dbPath);
    db.exec("DROP TABLE orchestration_v2_projection_runs");
    db.close();
    assert.match(source.snapshot().error ?? "", /^T3 database:/);
    assert.match(new T3Source(join(dir, "nope.sqlite")).snapshot().error ?? "", /not found/);
  } finally {
    source.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
