import { useEffect, useRef, useState } from "react";
import { client } from "../client";
import { Button } from "../components/ui/button";
import type { NowPlaying } from "../dashboardTypes";

/** Send a transport/volume command to Spotify via the feeder. */
function control(action: string, value?: number): void {
  void client.request("media.control", { action, value }).catch(() => {});
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

export function MusicPage({ nowPlaying }: { nowPlaying: NowPlaying | null }) {
  const np = nowPlaying;
  const playing = np?.state === "playing";

  // Interpolate playback position between the feeder's ~1s samples so the
  // progress bar and active lyric move smoothly.
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
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <div className="text-2xl font-bold">Nothing playing</div>
        <div className="mt-2 text-base text-muted-foreground">Start a track in Spotify on your Mac</div>
      </div>
    );
  }

  const pct = np.durationSec > 0 ? Math.min(100, (pos / np.durationSec) * 100) : 0;
  const artSrc = np.artworkUrl ? `/api/artwork?u=${encodeURIComponent(np.artworkUrl)}` : null;

  return (
    <div className="relative flex w-full flex-1 min-h-0 overflow-hidden">
      {/* full-bleed blurred album art + dark scrim (filter:blur works on Chromium
          69; backdrop-filter doesn't). Scaled up so the blur's soft edges stay
          off-screen. */}
      {artSrc && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${artSrc}")`, filter: "blur(40px)", transform: "scale(1.25)" }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/80" />

      {/* foreground */}
      <div className="relative flex w-full flex-1 min-h-0 p-5">
        {/* left: art + meta + transport */}
        <div className="flex w-64 flex-none flex-col">
          {artSrc ? (
            <img
              src={artSrc}
              alt=""
              className="h-36 w-36 flex-none self-center rounded-xl object-cover shadow-xl"
            />
          ) : (
            <div className="h-36 w-36 self-center rounded-xl bg-secondary" />
          )}
          <div className="mt-4 truncate text-xl font-bold">{np.title}</div>
          <div className="truncate text-base text-muted-foreground">{np.artist}</div>

          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/20">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
              <span>{mmss(pos)}</span>
              <span>{mmss(np.durationSec)}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center space-x-3">
            <Button variant="ghost" size="icon" onClick={() => control("previous")}>
              ⏮
            </Button>
            <Button variant="secondary" size="icon" onClick={() => control("playpause")}>
              {playing ? "⏸" : "▶"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => control("next")}>
              ⏭
            </Button>
          </div>

          <div className="mt-3 flex items-center text-muted-foreground">
            <span className="mr-2 text-sm">VOL</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/20">
              <div className="h-full rounded-full bg-muted-foreground" style={{ width: `${np.volume}%` }} />
            </div>
            <span className="ml-2 text-xs tabular-nums">{np.volume}</span>
          </div>
        </div>

        {/* right: synced lyrics */}
        <div className="relative ml-6 flex-1 min-h-0 overflow-hidden">
          <Lyrics np={np} pos={pos} />
        </div>
      </div>
    </div>
  );
}

function Lyrics({ np, pos }: { np: NowPlaying; pos: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const lines = np.lyrics;

  // Active line = last line whose timestamp has passed.
  let active = -1;
  if (lines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= pos + 0.2) active = i;
      else break;
    }
  }

  // Center the active line (manual scrollTop is reliable on Chromium 69).
  useEffect(() => {
    const box = scroller.current;
    if (!box || active < 0) return;
    const el = box.querySelector(`[data-line='${active}']`) as HTMLElement | null;
    if (!el) return;
    box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  }, [active]);

  if (!np.lyricsLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-base text-muted-foreground">
        Loading lyrics…
      </div>
    );
  }
  if (!lines || lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-base text-muted-foreground">
        No synced lyrics for this track
      </div>
    );
  }

  return (
    <div ref={scroller} className="dial-scroll h-full overflow-y-auto py-24 [&::-webkit-scrollbar]:w-0">
      {lines.map((l, i) => (
        <p
          key={`${l.t}:${l.text}`}
          data-line={i}
          data-active={i === active ? "true" : undefined}
          className="px-1 py-1.5 text-lg leading-snug text-muted-foreground/50 data-[active=true]:font-bold data-[active=true]:text-foreground"
        >
          {l.text || "♪"}
        </p>
      ))}
    </div>
  );
}
