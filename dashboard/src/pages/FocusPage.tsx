import { useEffect, useRef, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

type Mode = "work" | "break" | "long";
const LABEL: Record<Mode, string> = { work: "Focus", break: "Break", long: "Long break" };
const BREAK = 5 * 60;
const LONG = 15 * 60;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function mmss(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

let actx: AudioContext | null = null;
function chime(): void {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    actx = actx || new Ctor();
    for (const [i, f] of [880, 1320].entries()) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(actx.destination);
      const at = actx.currentTime + i * 0.18;
      osc.start(at);
      osc.stop(at + 0.16);
    }
  } catch {
    /* audio unavailable */
  }
}

/**
 * Pomodoro / focus timer. Self-contained: dial = set work minutes (while idle),
 * press = start/pause, Back = reset (wired from App's hardware handler via
 * window CustomEvents). Work → short break, with a long break every 4th.
 */
export function FocusPage() {
  const [workMin, setWorkMin] = useState(25);
  const [mode, setMode] = useState<Mode>("work");
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [flash, setFlash] = useState(false);

  const total = mode === "work" ? workMin * 60 : mode === "break" ? BREAK : LONG;
  const runRef = useRef(running);
  runRef.current = running;

  // Reflect a changed work length while idle on the work phase.
  useEffect(() => {
    if (!running && mode === "work") setLeft(workMin * 60);
  }, [workMin, mode, running]);

  // Countdown + phase transitions.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s > 1) return s - 1;
        chime();
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1200);
        setRunning(false);
        setMode((m) => {
          if (m === "work") {
            const n = done + 1;
            setDone(n);
            const next: Mode = n % 4 === 0 ? "long" : "break";
            setLeft(next === "long" ? LONG : BREAK);
            return next;
          }
          setLeft(workMin * 60);
          return "work";
        });
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, done, workMin]);

  // Hardware (bound once): dial adjusts minutes when idle, press toggles, back resets.
  useEffect(() => {
    const onDial = (e: Event) => {
      if (runRef.current) return;
      setWorkMin((w) => clamp(w + (e as CustomEvent<number>).detail, 5, 60));
    };
    const onPress = () => setRunning((r) => !r);
    const onReset = () => {
      setRunning(false);
      setMode("work");
      setDone(0);
      setWorkMin((w) => {
        setLeft(w * 60);
        return w;
      });
    };
    window.addEventListener("focus-dial", onDial);
    window.addEventListener("focus-press", onPress);
    window.addEventListener("focus-reset", onReset);
    return () => {
      window.removeEventListener("focus-dial", onDial);
      window.removeEventListener("focus-press", onPress);
      window.removeEventListener("focus-reset", onReset);
    };
  }, []);

  const pct = total > 0 ? ((total - left) / total) * 100 : 0;
  const reset = () => {
    setRunning(false);
    setMode("work");
    setDone(0);
    setLeft(workMin * 60);
  };

  return (
    <div
      data-flash={flash ? "true" : undefined}
      className="relative flex w-full flex-1 flex-col items-center justify-center pt-14 data-[flash=true]:bg-waiting/10"
    >
      <Badge variant={mode === "work" ? "default" : "working"} className="uppercase tracking-wide">
        {LABEL[mode]}
      </Badge>
      <div className="mt-2 text-7xl font-bold tabular-nums">{mmss(left)}</div>

      <div className="mt-4 h-2 w-80 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex items-center space-x-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            data-on={i < done % 4 ? "true" : undefined}
            className="h-2.5 w-2.5 rounded-full bg-muted data-[on=true]:bg-working"
          />
        ))}
      </div>

      <div className="mt-6 flex items-center space-x-3">
        <Button onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Start"}</Button>
        <Button variant="outline" onClick={reset}>
          Reset
        </Button>
      </div>
      <div className="mt-3 text-sm text-muted-foreground">dial = set minutes · press = start / pause</div>
    </div>
  );
}
