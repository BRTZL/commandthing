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

export type SessionState = "working" | "waiting" | "background" | "failed" | "done" | "idle";

/** One T3 Code thread as shown on the board. */
export interface AgentSession {
  /** T3 thread id. */
  id: string;
  /** T3 project title. */
  project: string;
  /** Project workspace root. */
  projectPath: string;
  title: string | null;
  /** Selected model id (e.g. claude-opus-5-5). */
  model: string | null;
  gitBranch: string | null;
  /** Epoch ms of the most recent activity (max of file mtime and last event). */
  lastActivity: number;
  /**
   * working  = a run is active
   * waiting  = blocked on you (always needsInput)
   * background = its turn ended, but background work will wake it again
   * failed   = its latest run failed
   * done     = finished and not yet seen in T3
   * idle     = nothing to do
   */
  state: SessionState;
  /** T3's own status wording, e.g. "Pending Approval" or "Working". */
  statusLabel: string;
  /** True only when the agent cannot continue without an answer or approval. */
  needsInput: boolean;
  lastPrompt: string | null;
  permissionMode: string | null;
  /** Subagents currently running under this thread. */
  subagentCount: number;
}

export interface DashboardState {
  generatedAt: number;
  host: string;
  sessions: AgentSession[];
  /** Why sessions could not be read from T3 Code, if so. */
  sessionsError: string | null;
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
    sessionsError: null,
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
  statusLabel: string;
  needsInput: boolean;
  messageCount: number;
  toolCounts: Record<string, number>;
  todos: TodoItem[];
  items: SessionTimelineItem[];
  generatedAt: number;
}
