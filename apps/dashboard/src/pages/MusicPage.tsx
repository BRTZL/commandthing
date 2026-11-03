import { useEffect, useRef, useState } from "react";
import { client } from "../client";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { type NowPlaying, spotifyArtworkSize } from "../dashboardTypes";
import { useSettings } from "../settings";
import { useNowPlaying } from "../store/dashboardStore";

/** Send a transport/volume command to Spotify via the feeder. */
function control(action: string, value?: number): void {
  void client.request("media.control", { action, value }).catch(() => {});
}

/** The 300px cover: the device shows it at ~280px, and the 640px one is 3-10x the bytes. */
function coverUrl(np: NowPlaying | null): string | null {
  if (!np?.artworkUrl || np.state === "stopped") return null;
  return `/api/artwork?u=${encodeURIComponent(spotifyArtworkSize(np.artworkUrl, "cover"))}`;
}

/**
 * Backdrop art, blurred on the feeder and shown as a plain background-image.
 * Blurring here with `filter: blur()` is off limits ON PURPOSE: a blur filter is
 * a composited GPU layer, and composited layers leak the device's Wayland
 * buffers and crash the renderer (~7 min). Upscaling the 64px cover instead
 * avoided the crash but looked like a blocky mosaic on the device.
 */
function backdropUrl(np: NowPlaying | null): string | null {
  if (!np?.artworkUrl || np.state === "stopped") return null;
  return `/api/backdrop?u=${encodeURIComponent(np.artworkUrl)}`;
}

/**
 * Preload `src` off-DOM and return it once it has loaded. Until then the previous
 * image stays up, so a track change never flashes black or paints a half-loaded
 * JPEG. A failed load (feeder restarting, CDN hiccup) retries with backoff; the
 * extra `r` query parameter is ignored by the feeder but defeats the cached error.
 */
function useLoadedImage(src: string | null): string | null {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!src) {
      setShown(null);
      return;
    }
    let cancelled = false;
    let attempt = 0;
    let timer = 0;
    const image = new Image();
    const load = () => {
      const url = attempt === 0 ? src : `${src}&r=${attempt}`;
      image.onload = () => {
        if (!cancelled) setShown(url);
      };
      image.onerror = () => {
        if (cancelled) return;
        attempt += 1;
        if (attempt > 4) setShown(null);
        else timer = window.setTimeout(load, 1000 * 2 ** (attempt - 1));
      };
      image.src = url;
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);
  return shown;
}

// Layered gradient scrim that keeps lyrics + controls legible over the cover.
// (Gradients paint into the parent layer — they do NOT composite, so they're safe.)
const SCRIM =
  "radial-gradient(120% 90% at 50% 8%, rgba(0,0,0,0) 38%, rgba(0,0,0,.5) 100%)," +
  "linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.12) 35%, rgba(0,0,0,.85))";
const COVER_SHADOW = "0 30px 90px rgba(0,0,0,0.55)";

// How many lyric lines to show above/below the active one in the fixed window.
const LYRIC_HALF = 3;

// A sample further than this behind our own extrapolation means a seek, not lag.
const SEEK_SEC = 0.35;

interface PlaybackClock {
  trackId: string;
  playing: boolean;
  /** Position at `at`, in seconds. */
  pos: number;
  /** performance.now() when `pos` was true. */
  at: number;
}

function clockPosition(clock: PlaybackClock, nowMs: number): number {
  return clock.playing ? clock.pos + (nowMs - clock.at) / 1000 : clock.pos;
}

/** Index of the last line that has started by `pos`, or -1 before the first. */
function activeLine(lines: NowPlaying["lyrics"], pos: number): number {
  let active = -1;
  if (lines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= pos) active = i;
      else break;
    }
  }
  return active;
}

/**
 * "Immerse" now-playing: the album art fills the screen as a soft wash with the
 * lyrics floating large and centered and the track + transport at the bottom.
 *
 * NO composited layers: the backdrop is a plain background-image (no blur/scale),
 * the lyrics are a FIXED WINDOW (no overflow scroller). On this firmware,
 * composited layers (filter/mask/overflow-scrolling-touch) leak Wayland buffers
 * and crash the renderer — flat content does not.
 */
export function MusicPage() {
  const np = useNowPlaying();
  const playing = np?.state === "playing";
  // Advance lines a touch so they land as the singing starts (tunable in Settings).
  const lead = useSettings().lyricOffsetSec;
  const cover = useLoadedImage(coverUrl(np));
  const backdrop = useLoadedImage(backdropUrl(np));

  // Local playback clock, extrapolated between the feeder's ~1s samples. While
  // playing, every sample is slightly stale by the time it lands, so one that is
  // behind our extrapolation is ignored unless it is far enough behind to be a
  // seek. One that is ahead is fresher than our anchor and replaces it.
  // Re-anchoring on every sample made the position wobble by each sample's latency.
  const clock = useRef<PlaybackClock>({ trackId: "", playing: false, pos: 0, at: 0 });
  const trackId = np?.trackId ?? "";
  const sampledPos = np?.positionSec ?? 0;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!trackId) return;
    const nowMs = performance.now();
    const current = clock.current;
    const drift = sampledPos - clockPosition(current, nowMs);
    const resync = current.trackId !== trackId || current.playing !== playing || !playing;
    if (resync || drift > 0 || drift < -SEEK_SEC) {
      clock.current = { trackId, playing, pos: sampledPos, at: nowMs };
      setTick((tick) => tick + 1);
    }
  }, [trackId, playing, sampledPos]);

  const pos = clockPosition(clock.current, performance.now());
  const lines = np?.lyricsLoaded ? np.lyrics : null;
  const active = activeLine(lines, pos + lead);

  // Re-render exactly when the next line starts, rather than polling for it,
  // and at least once a second for the progress bar.
  useEffect(() => {
    if (!playing) return;
    const next = lines?.[active + 1];
    const untilNextLine = next ? next.t - lead - pos : Number.POSITIVE_INFINITY;
    const delayMs = Math.max(10, Math.min(untilNextLine, 1) * 1000 + 5);
    const timer = window.setTimeout(() => setTick((tick) => tick + 1), delayMs);
    return () => window.clearTimeout(timer);
  });

  if (!np || np.state === "stopped") {
    return (
      <div className="flex w-full flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary text-5xl text-muted-foreground">
          ♪
        </div>
        <div className="mt-5 text-xl font-semibold text-foreground/80">Nothing playing</div>
      </div>
    );
  }

  const pct = np.durationSec > 0 ? Math.min(100, (pos / np.durationSec) * 100) : 0;

  return (
    <div className="relative flex w-full flex-1 min-h-0 overflow-hidden">
      {/* full-bleed album wash (plain background-image — no filter/transform layer) */}
      {backdrop && (
        <div
          aria-hidden
          className="pointer-events-none absolute bg-cover bg-center"
          style={{ top: 0, right: 0, bottom: 0, left: 0, backgroundImage: `url("${backdrop}")` }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />

      {/* lyrics */}
      <Lyrics np={np} lines={lines} active={active} cover={cover} />

      {/* track + transport */}
      <div className="absolute bottom-9 left-10 right-10 flex items-center">
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-2xl font-extrabold"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,.6)" }}
          >
            {np.title}
          </div>
          <div className="truncate text-base text-foreground/75">{np.artist}</div>
        </div>
        <div className="ml-4 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => control("previous")}
            className="h-12 w-12 text-foreground hover:bg-foreground/10"
          >
            <PreviousIcon className="h-8 w-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => control("playpause")}
            className="mx-3 h-14 w-14 text-foreground hover:bg-foreground/10"
          >
            {playing ? <PauseIcon className="h-9 w-9" /> : <PlayIcon className="h-9 w-9" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => control("next")}
            className="h-12 w-12 text-foreground hover:bg-foreground/10"
          >
            <NextIcon className="h-8 w-8" />
          </Button>
        </div>
      </div>

      {/* progress hairline at the very bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-foreground/20">
        <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Lyrics({
  np,
  lines,
  active,
  cover,
}: {
  np: NowPlaying;
  lines: NowPlaying["lyrics"];
  active: number;
  cover: string | null;
}) {
  // No (or not-yet-loaded) lyrics → just show the album cover, beautifully. No
  // "loading" text — it either fills with lyrics or stays a clean cover view.
  if (!lines || lines.length === 0) {
    return (
      <div className="absolute bottom-20 left-0 right-0 top-16 flex items-center justify-center">
        {cover && (
          <img
            src={cover}
            alt={np.title}
            className="h-56 w-56 rounded-2xl object-cover"
            style={{ boxShadow: COVER_SHADOW }}
          />
        )}
      </div>
    );
  }

  // Fixed WINDOW centered on the active line — no overflow scroller (a composited
  // scroll layer is what leaks Wayland buffers). The window slides as playback
  // advances; the active line stays centered and bright, neighbors dimmed.
  const center = active < 0 ? 0 : active;
  const rows = [];
  for (let i = center - LYRIC_HALF; i <= center + LYRIC_HALF; i++) {
    const l = i >= 0 && i < lines.length ? lines[i] : null;
    rows.push(
      <p
        key={i}
        data-active={i === active ? "true" : undefined}
        className="px-12 py-2 text-3xl font-bold leading-snug text-foreground/25 transition-colors duration-300 data-[active=true]:text-foreground"
      >
        {l ? l.text || "♪" : " "}
      </p>,
    );
  }

  return (
    <div
      className="absolute bottom-20 left-0 right-0 top-16 flex flex-col items-center justify-center overflow-hidden text-center"
      style={{ textShadow: "0 2px 16px rgba(0,0,0,.55)" }}
    >
      {rows}
    </div>
  );
}
