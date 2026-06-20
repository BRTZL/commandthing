/**
 * Builds a detailed timeline for a single session by parsing its transcript:
 * prompts, assistant replies, tool calls (with target + ok/error status),
 * TodoWrite snapshots, and thinking. Used by the session detail page.
 *
 * On-demand only (answered over the WebSocket request/response channel), so the
 * heavier parse never runs in the broadcast loop.
 */

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { SessionDetail, SessionTimelineItem, TodoItem } from "../../shared/protocol.ts";
import { deriveState } from "./claudeWatcher.ts";
import type { HookStore } from "./hooks.ts";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");
const MAX_ITEMS = 150;
const MAX_FULL_READ = 3_000_000;
const TAIL_BYTES = 1_200_000;

export function getSessionDetail(id: string, hooks: HookStore, now = Date.now()): SessionDetail | null {
  if (!id) return null;
  const filePath = findTranscript(id);
  if (!filePath) return null;

  let mtimeMs = now;
  let size = 0;
  try {
    const st = statSync(filePath);
    mtimeMs = st.mtimeMs;
    size = st.size;
  } catch {
    return null;
  }

  const text = readTail(filePath, size);
  const lines = text ? text.split("\n") : [];

  const items: SessionTimelineItem[] = [];
  const toolIndexById = new Map<string, number>();
  const toolCounts: Record<string, number> = {};
  let title: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let model: string | null = null;
  let todos: TodoItem[] = [];
  let messageCount = 0;
  let seq = 0;

  for (const line of lines) {
    if (!line) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof o.aiTitle === "string" && o.aiTitle.trim()) title = o.aiTitle.trim();
    if (!cwd && typeof o.cwd === "string") cwd = o.cwd; // first cwd = project root
    if (typeof o.gitBranch === "string") gitBranch = o.gitBranch;
    const ts = o.timestamp ? Date.parse(o.timestamp) : null;
    const tsv = ts != null && !Number.isNaN(ts) ? ts : null;

    if (o.type === "user" && o.message) {
      const content = o.message.content;
      const results = Array.isArray(content) ? content.filter((c: any) => c && c.type === "tool_result") : [];
      if (o.toolUseResult || results.length > 0) {
        for (const r of results) {
          const idx = toolIndexById.get(r.tool_use_id);
          if (idx != null && items[idx]?.tool) items[idx].tool!.status = r.is_error ? "error" : "ok";
        }
      } else {
        const t = extractText(content);
        if (t?.trim()) {
          messageCount++;
          items.push({ id: `i${seq++}`, kind: "prompt", ts: tsv, title: "You", text: t.slice(0, 2000) });
        }
      }
    } else if (o.type === "assistant" && o.message) {
      if (typeof o.message.model === "string") model = o.message.model;
      const content = o.message.content;
      if (Array.isArray(content)) {
        let counted = false;
        for (const block of content) {
          if (!block) continue;
          if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
            items.push({
              id: `i${seq++}`,
              kind: "assistant",
              ts: tsv,
              title: "Claude",
              text: block.text.slice(0, 2000),
            });
            counted = true;
          } else if (block.type === "thinking" && block.thinking) {
            items.push({
              id: `i${seq++}`,
              kind: "thinking",
              ts: tsv,
              title: "Thinking",
              text: String(block.thinking).slice(0, 500),
            });
          } else if (block.type === "tool_use") {
            const name = String(block.name ?? "tool");
            toolCounts[name] = (toolCounts[name] ?? 0) + 1;
            if (name === "TodoWrite" && Array.isArray(block.input?.todos)) {
              todos = block.input.todos.map((t: any) => ({
                content: String(t.content ?? t.activeForm ?? ""),
                status: String(t.status ?? ""),
              }));
              items.push({ id: `i${seq++}`, kind: "todos", ts: tsv, title: "Updated tasks", todos });
            } else {
              const idx =
                items.push({
                  id: `i${seq++}`,
                  kind: "tool",
                  ts: tsv,
                  title: name,
                  tool: { name, target: toolTarget(block.input), status: "pending" },
                }) - 1;
              if (typeof block.id === "string") toolIndexById.set(block.id, idx);
            }
            counted = true;
          }
        }
        if (counted) messageCount++;
      }
    }
  }

  const { state, needsInput } = deriveState(mtimeMs, hooks.get(id), now);
  const projectPath = cwd ?? id;

  return {
    id,
    project: basename(projectPath) || projectPath,
    projectPath,
    title,
    gitBranch,
    model,
    state,
    needsInput,
    messageCount,
    toolCounts,
    todos,
    items: items.slice(-MAX_ITEMS),
    generatedAt: now,
  };
}

function findTranscript(id: string): string | null {
  if (!existsSync(PROJECTS_DIR)) return null;
  let dirs: string[] = [];
  try {
    dirs = readdirSync(PROJECTS_DIR);
  } catch {
    return null;
  }
  for (const proj of dirs) {
    const fp = join(PROJECTS_DIR, proj, `${id}.jsonl`);
    if (existsSync(fp)) return fp;
  }
  return null;
}

function extractText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text);
    if (parts.length) return parts.join("\n");
  }
  return null;
}

function toolTarget(input: any): string | null {
  if (!input || typeof input !== "object") return null;
  if (input.file_path) return basename(String(input.file_path));
  if (input.path) return basename(String(input.path));
  if (input.notebook_path) return basename(String(input.notebook_path));
  if (input.command) return String(input.command).replace(/\s+/g, " ").slice(0, 90);
  if (input.pattern) return String(input.pattern).slice(0, 70);
  if (input.url) return String(input.url).slice(0, 90);
  if (input.query) return String(input.query).slice(0, 70);
  if (input.description) return String(input.description).slice(0, 90);
  if (input.prompt) return String(input.prompt).replace(/\s+/g, " ").slice(0, 90);
  return null;
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
    const nl = text.indexOf("\n");
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
