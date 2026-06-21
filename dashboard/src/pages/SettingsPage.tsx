import { ChevronLeftIcon, MinusIcon, PlusIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { goBack } from "../router";
import { setSetting, useSettings } from "../settings";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function Stepper({
  label,
  hint,
  value,
  onDec,
  onInc,
}: {
  label: string;
  hint: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-4">
      <div className="min-w-0">
        <div className="text-lg font-semibold">{label}</div>
        <div className="text-sm text-muted-foreground">{hint}</div>
      </div>
      <div className="ml-4 flex flex-none items-center">
        <Button variant="secondary" size="icon" onClick={onDec} className="h-10 w-10 rounded-full">
          <MinusIcon className="h-5 w-5" />
        </Button>
        <span className="mx-4 w-16 text-center text-lg font-bold tabular-nums">{value}</span>
        <Button variant="secondary" size="icon" onClick={onInc} className="h-10 w-10 rounded-full">
          <PlusIcon className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

/** Standalone settings page (no tab header) — opened by the physical settings button. */
export function SettingsPage({ host, connected }: { host: string; connected: boolean }) {
  const s = useSettings();
  return (
    <div className="relative flex w-full flex-1 flex-col min-h-0 bg-background">
      <div className="flex flex-none items-center px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          className="mr-2 h-10 w-10 text-foreground hover:bg-secondary"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Button>
        <span className="text-2xl font-extrabold">Settings</span>
      </div>

      <div className="dial-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-6 [&::-webkit-scrollbar]:w-0">
        <Stepper
          label="UI scale"
          hint="Size of everything"
          value={`${s.uiScalePx}px`}
          onDec={() => setSetting("uiScalePx", clamp(s.uiScalePx - 1, 14, 22))}
          onInc={() => setSetting("uiScalePx", clamp(s.uiScalePx + 1, 14, 22))}
        />
        <Stepper
          label="Lyric sync"
          hint="Advance synced lyrics (+) if they lag"
          value={`${s.lyricOffsetSec >= 0 ? "+" : ""}${s.lyricOffsetSec.toFixed(1)}s`}
          onDec={() => setSetting("lyricOffsetSec", clamp(round1(s.lyricOffsetSec - 0.1), -2, 2))}
          onInc={() => setSetting("lyricOffsetSec", clamp(round1(s.lyricOffsetSec + 0.1), -2, 2))}
        />

        <div className="mt-6 text-sm text-muted-foreground">
          <div className="mb-2 text-base font-semibold text-foreground">About</div>
          <div className="flex justify-between py-1">
            <span>Feeder</span>
            <span className="tabular-nums">{host || "—"}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Connection</span>
            <span className={connected ? "text-working" : "text-destructive"}>
              {connected ? "connected" : "offline"}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span>Device</span>
            <span>Spotify Car Thing</span>
          </div>
        </div>
      </div>
    </div>
  );
}
