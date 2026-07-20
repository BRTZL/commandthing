/**
 * Watches ~/.claude/projects for live Claude Code sessions and derives a
 * compact per-session state by parsing each transcript (.jsonl).
 *
 * Design notes:
 *  - Subagent transcripts live at <project>/<sessionId>/subagents/agent-*.jsonl.
 *    Those are NOT sessions — they're counted toward their parent session.
 *  - Parsing is cached by (mtime,size); unchanged files are not re-read.
 *  - State is a recency heuristic, OVERRIDDEN by hook signals when present
 *    (hooks are the only reliable "waiting on you" source).
 */

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ClaudeSession, SessionState } from "@commandthing/protocol";
import type { HookStore } from "./hooks.ts";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

const WORKING_WINDOW_MS = 90_000; // wrote within 90s => actively working
const WAITING_WINDOW_MS = 30 * 60_000; // within 30m => recently active
const ACTIVE_WINDOW_MS = 12 * 60 * 60_000; // surface sessions touched in last 12h
const MAX_SESSIONS = 12;

const MAX_FULL_READ = 2_000_000; // read whole file under 2MB
const TAIL_BYTES = 256_000; // otherwise read the last 256KB

interface ParsedMeta {
  title: string | null;
  cwd: string | null;
  gitBranch: string | null;
  model: string | null;
  lastPrompt: string | null;
  permissionMode: string | null;
  lastEventTs: number | null;
}

function emptyMeta(): ParsedMeta {
  return {
    title: null,
    cwd: null,
    gitBranch: null,
    model: null,
    lastPrompt: null,
    permissionMode: null,
    lastEventTs: null,
  };
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  meta: ParsedMeta;
}
const cache = new Map<string, CacheEntry>();

interface SessionFile {
  path: string;
  dir: string;
  id: string;
  mtimeMs: number;
  size: number;
  subagents: number;
}

function listSessionFiles(): SessionFile[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  const out: SessionFile[] = [];
  for (const projDir of safeReaddir(PROJECTS_DIR)) {
    const projPath = join(PROJECTS_DIR, projDir);
    let pst: ReturnType<typeof statSync>;
    try {
      pst = statSync(projPath);
    } catch {
      continue;
    }
    if (!pst.isDirectory()) continue;

    for (const entry of safeReaddir(projPath)) {
      if (!entry.endsWith(".jsonl")) continue;
      const filePath = join(projPath, entry);
      let fst: ReturnType<typeof statSync>;
      try {
        fst = statSync(filePath);
      } catch {
        continue;
      }
      if (!fst.isFile()) continue;
      const id = entry.replace(/\.jsonl$/, "");

      // Count nested subagent transcripts (don't treat them as sessions).
      const subDir = join(projPath, id, "subagents");
      let subagents = 0;
      if (existsSync(subDir)) {
        subagents = safeReaddir(subDir).filter((f) => f.endsWith(".jsonl")).length;
      }

      out.push({ path: filePath, dir: projDir, id, mtimeMs: fst.mtimeMs, size: fst.size, subagents });
    }
  }
  return out;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readTail(filePath: string, size: number): string {
  if (size <= MAX_FULL_READ) {
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      return "";
    }
  }
  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const buf = Buffer.alloc(TAIL_BYTES);
    const read = readSync(fd, buf, 0, TAIL_BYTES, size - TAIL_BYTES);
    let text = buf.toString("utf8", 0, read);
    const nl = text.indexOf("\n"); // drop partial first line
    if (nl >= 0) text = text.slice(nl + 1);
    return text;
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function parseFile(filePath: string, size: number): ParsedMeta {
  const meta = emptyMeta();
  const text = readTail(filePath, size);
  if (!text) return meta;

  for (const line of text.split("\n")) {
    if (!line) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }

    if (typeof o.aiTitle === "string" && o.aiTitle.trim()) meta.title = o.aiTitle.trim();
    // First cwd wins — the session's origin (project root), stable against
    // later shell `cd`s that show up in tool-event cwd fields.
    if (!meta.cwd && typeof o.cwd === "string") meta.cwd = o.cwd;
    if (typeof o.gitBranch === "string") meta.gitBranch = o.gitBranch;
    if (typeof o.permissionMode === "string") meta.permissionMode = o.permissionMode;
    if (o.message && typeof o.message.model === "string") meta.model = o.message.model;

    if (o.type === "last-prompt" && typeof o.lastPrompt === "string") {
      meta.lastPrompt = o.lastPrompt.slice(0, 240);
    } else if (o.type === "user" && o.message && !o.toolUseResult) {
      const text = extractUserText(o.message.content);
      if (text) meta.lastPrompt = text.slice(0, 240);
    }

    const ts = o.timestamp ? Date.parse(o.timestamp) : Number.NaN;
    if (!Number.isNaN(ts)) meta.lastEventTs = ts;
  }
  return meta;
}

function extractUserText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const block = content.find((c: any) => c && c.type === "text" && typeof c.text === "string");
    if (block) return (block as any).text;
  }
  return null;
}

function decodeDir(dir: string): string {
  // "-Users-someone-Documents-workspace-foo" -> "/Users/.../foo" is ambiguous
  // (dashes in real names), so this is only a last-resort label.
  return dir.replace(/^-/, "/").replace(/-/g, "/");
}

// A hook lands just after the write that triggered it (Stop fires once the
// final message is flushed), so allow this much slack before treating a newer
// transcript as evidence the session moved past the hook.
const HOOK_LEAD_MS = 5_000;

export function deriveState(
  mtimeMs: number,
  hook: ReturnType<HookStore["get"]>,
  now: number,
): { state: SessionState; needsInput: boolean; source: "file" | "hook" } {
  // Hooks are authoritative — but only while they're the latest thing we know
  // about the session. If the transcript was written AFTER the hook fired, the
  // session moved on and we missed the follow-up hook (claude-hook.sh drops
  // POSTs on its 1s timeout), so the file is fresher. Trusting it here
  // self-heals a stale "needs you"/"done" once the session keeps going.
  const hookFresh = hook && now - hook.ts < ACTIVE_WINDOW_MS;
  const fileMovedPastHook = hook && mtimeMs > hook.ts + HOOK_LEAD_MS;
  if (hookFresh && !fileMovedPastHook) {
    return { state: hook.state, needsInput: hook.needsInput, source: "hook" };
  }
  const age = now - mtimeMs;
  if (age < WORKING_WINDOW_MS) return { state: "working", needsInput: false, source: "file" };
  if (age < WAITING_WINDOW_MS) return { state: "waiting", needsInput: false, source: "file" };
  return { state: "idle", needsInput: false, source: "file" };
}

/**
 * Display groups, top to bottom:
 *   0 needs you — blocked on you (a question / permission prompt)
 *   1 working   — actively streaming right now (live, worth watching)
 *   2 your turn — finished its turn, awaiting your next prompt
 *   3 other     — idle / quietly-recent (file-heuristic waiting)
 * Within a group, sessions sort newest-first by last message (lastActivity).
 */
function sortGroup(s: ClaudeSession): number {
  if (s.needsInput) return 0; // needs you
  if (s.state === "working") return 1; // working (live)
  if (s.state === "done") return 2; // your turn
  return 3; // idle / file-heuristic waiting
}

export function buildSessions(hooks: HookStore, now = Date.now()): ClaudeSession[] {
  const sessions: ClaudeSession[] = [];

  for (const f of listSessionFiles()) {
    if (now - f.mtimeMs > ACTIVE_WINDOW_MS) continue;

    let entry = cache.get(f.path);
    if (!entry || entry.mtimeMs !== f.mtimeMs || entry.size !== f.size) {
      entry = { mtimeMs: f.mtimeMs, size: f.size, meta: parseFile(f.path, f.size) };
      cache.set(f.path, entry);
    }
    const meta = entry.meta;
    const projectPath = meta.cwd ?? decodeDir(f.dir);
    const { state, needsInput, source } = deriveState(f.mtimeMs, hooks.get(f.id), now);

    sessions.push({
      id: f.id,
      project: basename(projectPath) || projectPath,
      projectPath,
      title: meta.title,
      model: meta.model,
      gitBranch: meta.gitBranch,
      lastActivity: Math.max(f.mtimeMs, meta.lastEventTs ?? 0),
      state,
      needsInput,
      lastPrompt: meta.lastPrompt,
      permissionMode: meta.permissionMode,
      subagentCount: f.subagents,
      stateSource: source,
    });
  }

  sessions.sort((a, b) => {
    const g = sortGroup(a) - sortGroup(b);
    return g !== 0 ? g : b.lastActivity - a.lastActivity; // newest message first
  });

  return sessions.slice(0, MAX_SESSIONS);
}
