/**
 * Spotify now-playing + control via AppleScript (osascript), plus time-synced
 * lyrics from LRCLIB.
 *
 * AppleScript (not the system MediaRemote API, which is locked down on recent
 * macOS) is reliable and needs no auth — only the one-time macOS Automation
 * permission for this process to control Spotify. The device has no internet, so
 * the feeder is also where artwork + lyrics are fetched.
 */

import type { LyricLine, MediaControl, NowPlaying } from "../../shared/protocol.ts";

/** Run an AppleScript (one statement per arg). Returns trimmed stdout or null. */
async function osa(...lines: string[]): Promise<string | null> {
  const args: string[] = [];
  for (const l of lines) args.push("-e", l);
  try {
    const proc = Bun.spawn(["osascript", ...args], { stdout: "pipe", stderr: "pipe" });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? out.trim() : null;
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
    positionSec: Math.round(num(p[6])) || 0,
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

const lyricsCache = new Map<string, { loaded: boolean; lines: LyricLine[] | null }>();

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

async function lrclib(path: string): Promise<any> {
  try {
    const r = await fetch(`https://lrclib.net${path}`, {
      headers: { "User-Agent": "spotify-carthing-dashboard (local desk gadget)" },
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function fetchLyrics(np: NowPlaying): Promise<LyricLine[] | null> {
  const get = new URLSearchParams({
    artist_name: np.artist,
    track_name: np.title,
    album_name: np.album,
    duration: String(np.durationSec),
  });
  let data = await lrclib(`/api/get?${get.toString()}`);
  if (!data?.syncedLyrics) {
    const q = new URLSearchParams({ q: `${np.title} ${np.artist}` });
    const arr = await lrclib(`/api/search?${q.toString()}`);
    if (Array.isArray(arr)) {
      // Prefer a synced result whose duration matches ours (right version =
      // right timestamps); fall back to the first synced result otherwise.
      const synced = arr.filter((x) => x?.syncedLyrics);
      data = synced.find((x) => Math.abs((x.duration ?? 0) - np.durationSec) <= 4) ?? synced[0] ?? null;
    }
  }
  return data?.syncedLyrics ? parseLrc(data.syncedLyrics) : null;
}

/**
 * Synced lyrics for a track, cached by trackId. Non-blocking: the first call for
 * a track returns `{loaded:false}` and kicks off the LRCLIB fetch in the
 * background; subsequent calls return the resolved result.
 */
export function ensureLyrics(np: NowPlaying): { loaded: boolean; lines: LyricLine[] | null } {
  const cached = lyricsCache.get(np.trackId);
  if (cached) return cached;
  const pending = { loaded: false, lines: null as LyricLine[] | null };
  lyricsCache.set(np.trackId, pending);
  void fetchLyrics(np).then((lines) => lyricsCache.set(np.trackId, { loaded: true, lines }));
  return pending;
}
