import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { FOCUS_LABEL, focusTotal, resetFocus, toggleRunning, useFocus } from "../focusTimer";

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

/**
 * Pomodoro view. State + the countdown live in ../focusTimer (a singleton), so
 * the timer keeps running when you switch tabs. Hardware: dial = set minutes
 * (while idle), press = start/pause — wired in App's onAction.
 */
export function FocusPage() {
  const s = useFocus();
  const total = focusTotal(s);
  const pct = total > 0 ? ((total - s.left) / total) * 100 : 0;

  return (
    <div
      data-flash={s.flash ? "true" : undefined}
      className="relative flex w-full flex-1 flex-col items-center justify-center pt-14 data-[flash=true]:bg-waiting/10"
    >
      <Badge variant={s.mode === "work" ? "default" : "working"} className="uppercase tracking-wide">
        {FOCUS_LABEL[s.mode]}
      </Badge>
      <div className="mt-2 text-7xl font-bold tabular-nums">{mmss(s.left)}</div>

      <div className="mt-4 h-2 w-80 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex items-center space-x-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={`dot${i}`}
            data-on={i < s.done % 4 ? "true" : undefined}
            className="h-2.5 w-2.5 rounded-full bg-muted data-[on=true]:bg-working"
          />
        ))}
      </div>

      <div className="mt-6 flex items-center space-x-3">
        <Button onClick={toggleRunning}>{s.running ? "Pause" : "Start"}</Button>
        <Button variant="outline" onClick={resetFocus}>
          Reset
        </Button>
      </div>
      <div className="mt-3 text-sm text-muted-foreground">dial = set minutes · press = start / pause</div>
    </div>
  );
}
