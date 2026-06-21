import { useEffect, useRef, useState } from "react";
import { client } from "../client";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import type { NowPlaying } from "../dashboardTypes";
import { useSettings } from "../settings";

/** Send a transport/volume command to Spotify via the feeder. */
function control(action: string, value?: number): void {
  void client.request("media.control", { action, value }).catch(() => {});
}

function artUrl(np: NowPlaying): string | null {
  return np.artworkUrl ? `/api/artwork?u=${encodeURIComponent(np.artworkUrl)}` : null;
}

// Layered gradient scrim that keeps lyrics + controls legible over the cover.
const SCRIM =
  "radial-gradient(120% 90% at 50% 8%, rgba(0,0,0,0) 38%, rgba(0,0,0,.5) 100%)," +
  "linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.12) 35%, rgba(0,0,0,.85))";
const LYRIC_FADE = "linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent)";

/**
 * "Immerse" now-playing: the album art fills the screen, blurred, with the
 * lyrics floating large and centered and the track + transport at the bottom.
 * filter:blur is Chromium-69 safe (backdrop-filter is not); offsets use the
 * longhand top/right/bottom/left (the `inset` shorthand isn't supported there).
 */
export function MusicPage({ nowPlaying }: { nowPlaying: NowPlaying | null }) {
  const np = nowPlaying;
  const playing = np?.state === "playing";

  // Interpolate playback position between the feeder's ~1s samples.
  const [pos, setPos] = useState(0);
  const base = useRef({ serverPos: 0, at: 0 });
  useEffect(() => {
    if (!np) return;
    base.current = { serverPos: np.positionSec, at: Date.now() };
    setPos(np.positionSec);
  }, [np?.positionSec, np?.trackId, np?.state]);
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
  const art = artUrl(np);

  return (
    <div className="relative flex w-full flex-1 min-h-0 overflow-hidden">
      {/* full-bleed blurred cover, cross-fading between tracks */}
      <CoverBackdrop art={art} />
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
            className="mx-2 h-14 w-14 rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {playing ? <PauseIcon className="h-7 w-7" /> : <PlayIcon className="h-7 w-7" />}
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

/** Full-bleed blurred album cover that cross-fades when the track changes. */
function CoverBackdrop({ art }: { art: string | null }) {
  const last = useRef<string | null>(null);
  const [cur, setCur] = useState<string | null>(art);
  const [prev, setPrev] = useState<string | null>(null);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (art === last.current) return;
    const old = last.current;
    last.current = art;
    setCur(art);
    if (!old) return;
    // Show the old cover on top, then fade it out to reveal the new one beneath.
    setPrev(old);
    setFade(false);
    const raf = requestAnimationFrame(() => setFade(true));
    const t = window.setTimeout(() => setPrev(null), 1100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [art]);

  const layer = (src: string, fading: boolean) => (
    <div
      aria-hidden
      className="pointer-events-none absolute bg-cover bg-center transition-opacity duration-1000"
      style={{
        top: -50,
        right: -50,
        bottom: -50,
        left: -50,
        backgroundImage: `url("${src}")`,
        filter: "blur(26px)",
        transform: "scale(1.12)",
        opacity: fading ? 0 : 1,
      }}
    />
  );

  return (
    <>
      {cur && layer(cur, false)}
      {prev && layer(prev, fade)}
    </>
  );
}

function Lyrics({ np, pos }: { np: NowPlaying; pos: number }) {
  const scroller = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const box = scroller.current;
    if (!box || active < 0) return;
    const el = box.querySelector(`[data-line='${active}']`) as HTMLElement | null;
    if (!el) return;
    box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  }, [active]);

  // No (or not-yet-loaded) lyrics → show the sharp cover, centered.
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
            style={{ boxShadow: "0 30px 90px rgba(0,0,0,0.55)" }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      className="dial-scroll absolute bottom-20 left-0 right-0 top-16 overflow-y-auto text-center [&::-webkit-scrollbar]:w-0"
      style={{
        WebkitMaskImage: LYRIC_FADE,
        maskImage: LYRIC_FADE,
        textShadow: "0 2px 16px rgba(0,0,0,.55)",
      }}
    >
      <div className="py-24">
        {lines.map((l, i) => (
          <p
            key={`${l.t}:${l.text}`}
            data-line={i}
            data-active={i === active ? "true" : undefined}
            className="px-12 py-2 text-3xl font-bold leading-snug text-foreground/25 transition-colors duration-300 data-[active=true]:text-foreground"
          >
            {l.text || "♪"}
          </p>
        ))}
      </div>
    </div>
  );
}
