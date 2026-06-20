/**
 * Wire protocol shared between the Mac-side feeder and the on-device dashboard.
 *
 * The envelope deliberately matches nocturned's WebSocket event shape
 * ({"type":"event","topic":...,"data":...}) so the dashboard's WS client is
 * byte-identical in local dev (talking to the feeder) and on the Car Thing
 * (talking to nocturned, which broadcasts unknown topics through to the UI).
 */

/** The single event topic our dashboard subscribes to. */
export const WS_TOPIC = "dashboard.update";

/** nocturned-compatible event envelope. */
export interface NocturneEvent<T = unknown> {
  type: "event";
  topic: string;
  data: T;
}

export type SessionState = "working" | "waiting" | "idle";

export interface ClaudeSession {
  /** Session UUID (the transcript filename, minus .jsonl). */
  id: string;
  /** Short display name — basename of the project working dir. */
  project: string;
  /** Full working directory of the session. */
  projectPath: string;
  /** AI-generated session title, if Claude produced one yet. */
  title: string | null;
  /** Model id from the latest assistant turn (e.g. claude-opus-4-8). */
  model: string | null;
  gitBranch: string | null;
  /** Epoch ms of the most recent activity (max of file mtime and last event). */
  lastActivity: number;
  /**
   * working  = streaming right now (very recent write / UserPromptSubmit hook)
   * waiting  = recently active, likely waiting on you (Stop/Notification hook)
   * idle     = quiet for a while
   */
  state: SessionState;
  /** True when a hook reported Claude is explicitly blocked on your input. */
  needsInput: boolean;
  lastPrompt: string | null;
  permissionMode: string | null;
  /** Number of subagent transcripts nested under this session. */
  subagentCount: number;
  /** "file" (recency heuristic) or "hook" (authoritative). */
  stateSource: "file" | "hook";
}

export interface DashboardState {
  generatedAt: number;
  host: string;
  sessions: ClaudeSession[];
  /** AI spend/usage across providers (from the local Open Usage API). */
  usage: UsageSummary | null;
  /** Spotify now-playing on the Mac, if available. */
  nowPlaying: NowPlaying | null;
}

export function emptyState(host = "unknown"): DashboardState {
  return {
    generatedAt: 0,
    host,
    sessions: [],
    usage: null,
    nowPlaying: null,
  };
}

/* ----------------------------- now playing (Spotify) ----------------------------- */

export type PlayerState = "playing" | "paused" | "stopped";

/** One time-synced lyric line; `t` is seconds from track start. */
export interface LyricLine {
  t: number;
  text: string;
}

export interface NowPlaying {
  source: "spotify";
  state: PlayerState;
  title: string;
  artist: string;
  album: string;
  /** Spotify track id (stable per song — keys the lyrics/artwork caches). */
  trackId: string;
  durationSec: number;
  /** Server-sampled position; the client interpolates between samples. */
  positionSec: number;
  /** 0–100. */
  volume: number;
  /** Raw Spotify CDN art URL; the device loads it via the feeder's /api/artwork proxy. */
  artworkUrl: string | null;
  /** Time-synced lyrics (LRCLIB), or null when none/instrumental. */
  lyrics: LyricLine[] | null;
  /** True once the lyrics lookup for this track has completed (loading vs none). */
  lyricsLoaded: boolean;
}

/** Control command the device sends back over the WS (method "media.control"). */
export interface MediaControl {
  action: "playpause" | "play" | "pause" | "next" | "previous" | "volume";
  /** Target volume 0–100 (only for action "volume"). */
  value?: number;
}

/* ----------------------------- usage (Open Usage) ----------------------------- */

export interface UsageFormat {
  kind: "percent" | "dollars" | "count" | string;
  suffix?: string;
}

/** One row in a provider's usage card (mirrors the Open Usage line shapes). */
export interface UsageLine {
  type: "progress" | "text" | "barChart" | string;
  label: string;
  // progress
  used?: number | null;
  limit?: number | null;
  format?: UsageFormat | null;
  resetsAt?: string | null;
  periodDurationMs?: number | null;
  color?: string | null;
  // text
  value?: string | null;
  subtitle?: string | null;
  // barChart
  points?: { label: string; value: number; valueLabel: string }[];
  note?: string | null;
}

export interface UsageProvider {
  providerId: string;
  displayName: string;
  plan: string | null;
  lines: UsageLine[];
  fetchedAt: string | null;
}

export interface UsageSummary {
  /** Sum of each provider's "Today" dollar figure, when parseable. */
  todayTotalUsd: number | null;
  /** Pre-formatted compact label for the top meter, e.g. "$45.81 today". */
  todayLabel: string;
  providers: UsageProvider[];
  fetchedAt: number;
  error: string | null;
}

/* ----------------------------- session detail ----------------------------- */

export type TimelineKind = "prompt" | "assistant" | "tool" | "todos" | "thinking" | "notification";

export interface TodoItem {
  content: string;
  status: string; // pending | in_progress | completed
}

export interface SessionTimelineItem {
  id: string;
  kind: TimelineKind;
  ts: number | null;
  title: string;
  text?: string | null;
  tool?: { name: string; target?: string | null; status?: "ok" | "error" | "pending" | null };
  todos?: TodoItem[];
}

export interface SessionDetail {
  id: string;
  project: string;
  projectPath: string;
  title: string | null;
  gitBranch: string | null;
  model: string | null;
  state: SessionState;
  needsInput: boolean;
  messageCount: number;
  toolCounts: Record<string, number>;
  todos: TodoItem[];
  items: SessionTimelineItem[];
  generatedAt: number;
}
