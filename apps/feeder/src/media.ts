/**
 * Spotify now-playing + control via AppleScript (osascript), plus time-synced
 * lyrics from LRCLIB.
 *
 * AppleScript (not the system MediaRemote API, which is locked down on recent
 * macOS) is reliable and needs no auth — only the one-time macOS Automation
 * permission for this process to control Spotify. The device has no internet, so
 * the feeder is also where artwork + lyrics are fetched.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LyricLine, MediaControl, NowPlaying } from "@commandthing/protocol";

const execFileAsync = promisify(execFile);

/** Run an AppleScript (one statement per arg). Returns trimmed stdout or null. */
async function osa(...lines: string[]): Promise<string | null> {
  const args: string[] = [];
  for (const l of lines) args.push("-e", l);
  try {
    // Apple Events can occasionally stop answering (for example while macOS is
    // showing an Automation permission prompt). Without a timeout, the one-second
    // media poll would keep spawning osascript children until the feeder became
    // unresponsive.
    const { stdout } = await execFileAsync("osascript", args, {
      encoding: "utf8",
      timeout: 3000,
      killSignal: "SIGKILL",
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** Query Spotify's current track. null = Spotify not running / not scriptable. */
export async function getNowPlaying(): Promise<NowPlaying | null> {
  const out = await osa(
    'if application "Spotify" is not running then return "notrunning"',
    'tell application "Spotify"',
    "set pstate to (player state as string)",
    'if pstate is "stopped" then return "stopped"',
    "set t to current track",
    "return pstate & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (artwork url of t) & tab & (duration of t) & tab & (player position) & tab & (sound volume) & tab & (id of t)",
    "end tell",
  );
  if (!out || out === "notrunning") return null;
  if (out === "stopped") return stopped();

  const p = out.split("\t");
  if (p.length < 9) return null;
  // `player position` comes back as a real formatted with the system locale's
  // decimal separator (e.g. "72,627" on a comma locale) — normalize before parsing.
  const num = (s: string) => Number(String(s).replace(",", "."));
  return {
    source: "spotify",
    state: p[0] === "playing" ? "playing" : "paused",
    title: p[1],
    artist: p[2],
    album: p[3],
    artworkUrl: p[4] || null,
    durationSec: Math.round(num(p[5]) / 1000) || 0,
    // Millisecond precision: lyric lines are timed to centiseconds, and rounding
    // to whole seconds put the device up to half a second off.
    positionSec: Math.round(num(p[6]) * 1000) / 1000 || 0,
    volume: Math.round(num(p[7])) || 0,
    trackId: p[8],
    lyrics: null,
    lyricsLoaded: false,
  };
}

function stopped(): NowPlaying {
  return {
    source: "spotify",
    state: "stopped",
    title: "",
    artist: "",
    album: "",
    trackId: "",
    durationSec: 0,
    positionSec: 0,
    volume: 0,
    artworkUrl: null,
    lyrics: null,
    lyricsLoaded: false,
  };
}

const CONTROL: Record<string, string> = {
  playpause: "playpause",
  play: "play",
  pause: "pause",
  next: "next track",
  previous: "previous track",
};

export async function mediaControl(c: MediaControl): Promise<void> {
  if (c.action === "volume") {
    const v = Math.max(0, Math.min(100, Math.round(c.value ?? 50)));
    await osa(`tell application "Spotify" to set sound volume to ${v}`);
    return;
  }
  const cmd = CONTROL[c.action];
  if (cmd) await osa(`tell application "Spotify" to ${cmd}`);
}

/* ------------------------------- lyrics (LRCLIB) ------------------------------- */

export interface LyricsResult {
  loaded: boolean;
  lines: LyricLine[] | null;
}

type LrclibResponse =
  | { ok: true; data: any }
  | { ok: false; transient: boolean; retryAfterMs: number | null };
type Lookup =
  | { kind: "found"; lines: LyricLine[] }
  | { kind: "none" }
  | { kind: "retry"; afterMs: number | null };

const PENDING: LyricsResult = { loaded: false, lines: null };
const NONE: LyricsResult = { loaded: true, lines: null };
/** Waits between lookups when LRCLIB is overloaded or unreachable (~1 min in total). */
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15_000, 30_000];
const CACHE_LIMIT = 500;

/** Settled results by trackId, oldest first. */
const lyricsCache = new Map<string, LyricsResult>();

function parseLrc(lrc: string): LyricLine[] {
  const stampRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const out: LyricLine[] = [];
  for (const raw of lrc.split("\n")) {
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    stampRe.lastIndex = 0;
    let m = stampRe.exec(raw);
    while (m !== null) {
      const frac = m[3] ? Number(`0.${m[3]}`) : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text });
      m = stampRe.exec(raw);
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function retryAfterMs(header: string | null): number | null {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) * 1000 : null;
}

async function lrclib(path: string): Promise<LrclibResponse> {
  try {
    const r = await fetch(`https://lrclib.net${path}`, {
      headers: { "User-Agent": "commandthing (local Car Thing dashboard)" },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) return { ok: true, data: await r.json() };
    // LRCLIB answers 503 "ServerOverloaded" under load. That, rate limits and
    // other server errors are worth retrying; 404 means it has no such track.
    const transient = r.status === 429 || r.status >= 500;
    return { ok: false, transient, retryAfterMs: retryAfterMs(r.headers.get("retry-after")) };
  } catch {
    return { ok: false, transient: true, retryAfterMs: null }; // timeout or network error
  }
}

async function lookupLyrics(np: NowPlaying): Promise<Lookup> {
  const get = new URLSearchParams({
    artist_name: np.artist,
    track_name: np.title,
    album_name: np.album,
    duration: String(np.durationSec),
  });
  const exact = await lrclib(`/api/get?${get.toString()}`);
  if (exact.ok && exact.data?.syncedLyrics)
    return { kind: "found", lines: parseLrc(exact.data.syncedLyrics) };

  const q = new URLSearchParams({ q: `${np.title} ${np.artist}` });
  const search = await lrclib(`/api/search?${q.toString()}`);
  if (search.ok && Array.isArray(search.data)) {
    // Prefer a synced result whose duration matches ours (right version =
    // right timestamps); fall back to the first synced result otherwise.
    const synced = search.data.filter((x: any) => x?.syncedLyrics);
    const best = synced.find((x: any) => Math.abs((x.duration ?? 0) - np.durationSec) <= 4) ?? synced[0];
    if (best) return { kind: "found", lines: parseLrc(best.syncedLyrics) };
  }
  const failed = [exact, search].find(
    (r): r is Extract<LrclibResponse, { ok: false }> => !r.ok && r.transient,
  );
  return failed ? { kind: "retry", afterMs: failed.retryAfterMs } : { kind: "none" };
}

function remember(trackId: string, result: LyricsResult): void {
  lyricsCache.delete(trackId);
  lyricsCache.set(trackId, result);
  while (lyricsCache.size > CACHE_LIMIT) {
    const oldest = lyricsCache.keys().next().value;
    if (oldest === undefined) break;
    lyricsCache.delete(oldest);
  }
}

/** Lookup state for the track that is currently loaded in Spotify. */
let job: { trackId: string; inFlight: boolean; attempts: number; retryAt: number; gaveUp: boolean } | null =
  null;

/**
 * Synced lyrics for a track, cached by trackId. Non-blocking: while the LRCLIB
 * lookup runs this returns `{loaded:false}`, and `onSettled` fires once it has
 * an answer so the caller can push it without waiting for the next poll.
 *
 * A busy or unreachable LRCLIB is retried with backoff, but only while the
 * track is still the current one, since callers only ask about that track.
 * Giving up is not cached, so playing the song again tries again.
 */
export function ensureLyrics(
  np: NowPlaying,
  onSettled: (trackId: string, result: LyricsResult) => void,
  now = Date.now(),
): LyricsResult {
  const cached = lyricsCache.get(np.trackId);
  if (cached) return cached;
  if (job?.trackId !== np.trackId) {
    job = { trackId: np.trackId, inFlight: false, attempts: 0, retryAt: 0, gaveUp: false };
  }
  const current = job;
  if (current.gaveUp) return NONE;
  if (current.inFlight || now < current.retryAt) return PENDING;

  current.inFlight = true;
  current.attempts += 1;
  const trackId = np.trackId;
  void lookupLyrics(np).then((lookup) => {
    current.inFlight = false;
    if (lookup.kind === "retry") {
      const delay = RETRY_DELAYS_MS[current.attempts - 1];
      if (delay !== undefined) {
        current.retryAt = Date.now() + Math.max(lookup.afterMs ?? 0, delay);
        return;
      }
      current.gaveUp = true;
      onSettled(trackId, NONE);
      return;
    }
    const result = lookup.kind === "found" ? { loaded: true, lines: lookup.lines } : NONE;
    remember(trackId, result);
    onSettled(trackId, result);
  });
  return PENDING;
}
