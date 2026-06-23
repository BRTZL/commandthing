import { useEffect, useRef, useState } from "react";
import { client } from "../client";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import type { NowPlaying } from "../dashboardTypes";
import { useSettings } from "../settings";
import { useNowPlaying } from "../store/dashboardStore";

/** Send a transport/volume command to Spotify via the feeder. */
function control(action: string, value?: number): void {
  void client.request("media.control", { action, value }).catch(() => {});
}

function artUrl(np: NowPlaying): string | null {
  return np.artworkUrl ? `/api/artwork?u=${encodeURIComponent(np.artworkUrl)}` : null;
}

/**
 * Backdrop art: the 64px Spotify variant, upscaled by `bg-cover` to a soft wash.
 * This replaces `filter: blur()` ON PURPOSE — a blur filter is a composited GPU
 * layer, and composited layers leak the device's Wayland buffers and crash the
 * renderer (~7 min). An upscaled low-res image looks ~the same with zero filter.
 */
function backdropUrl(np: NowPlaying): string | null {
  if (!np.artworkUrl) return null;
  const small = np.artworkUrl.replace(/ab67616d[0-9a-f]{8}/, "ab67616d00004851");
  return `/api/artwork?u=${encodeURIComponent(small)}`;
}

// Layered gradient scrim that keeps lyrics + controls legible over the cover.
// (Gradients paint into the parent layer — they do NOT composite, so they're safe.)
const SCRIM =
  "radial-gradient(120% 90% at 50% 8%, rgba(0,0,0,0) 38%, rgba(0,0,0,.5) 100%)," +
  "linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.12) 35%, rgba(0,0,0,.85))";
const COVER_SHADOW = "0 30px 90px rgba(0,0,0,0.55)";

// How many lyric lines to show above/below the active one in the fixed window.
const LYRIC_HALF = 3;

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
  const positionSec = np?.positionSec ?? null;
  const playbackSampleKey = np ? `${np.trackId}:${np.state}:${np.positionSec}` : "";

  // Interpolate playback position between the feeder's ~1s samples.
  const [pos, setPos] = useState(0);
  const base = useRef({ serverPos: 0, at: 0 });
  useEffect(() => {
    if (!playbackSampleKey || positionSec == null) return;
    base.current = { serverPos: positionSec, at: Date.now() };
    setPos(positionSec);
  }, [playbackSampleKey, positionSec]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPos(base.current.serverPos + (Date.now() - base.current.at) / 1000);
    }, 250);
    return () => window.clearInterval(id);
  }, [playing]);

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
  const backdrop = backdropUrl(np);

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
      <Lyrics np={np} pos={pos} />

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

function Lyrics({ np, pos }: { np: NowPlaying; pos: number }) {
  const lines = np.lyrics;
  // Advance lines a touch to compensate for sampling/WS lag (tunable in Settings).
  const lead = useSettings().lyricOffsetSec;

  let active = -1;
  if (lines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= pos + lead) active = i;
      else break;
    }
  }

  // No (or not-yet-loaded) lyrics → just show the album cover, beautifully. No
  // "loading" text — it either fills with lyrics or stays a clean cover view.
  if (!np.lyricsLoaded || !lines || lines.length === 0) {
    const art = artUrl(np);
    return (
      <div className="absolute bottom-20 left-0 right-0 top-16 flex items-center justify-center">
        {art && (
          <img
            src={art}
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
