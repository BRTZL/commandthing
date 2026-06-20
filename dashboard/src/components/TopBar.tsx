import type { DashboardState } from "../dashboardTypes";
import { clockDate, clockTime } from "../format";
import { goBack, isHome, navigate } from "../router";

export function TopBar({
  state,
  connected,
  now,
}: {
  state: DashboardState;
  connected: boolean;
  now: number;
}) {
  const clock = new Date(now);
  const waiting = state.sessions.filter((s) => s.needsInput).length;
  const home = isHome();

  return (
    <header className="topbar">
      <div className="topbar-left">
        {!home && (
          <button type="button" className="back-btn" onClick={goBack} aria-label="Back">
            ‹
          </button>
        )}
        <div className="clock" onClick={() => navigate("/")}>
          <span className="clock-time">{clockTime(clock)}</span>
          <span className="clock-date">{clockDate(clock)}</span>
        </div>
      </div>
      <div className="topbar-right">
        {waiting > 0 && <span className="waiting-pill">{waiting} waiting on you</span>}
        <button type="button" className="usage-meter" onClick={() => navigate("/usage")}>
          <span className="usage-spark">$</span>
          <span className="usage-dollar">{state.usage ? state.usage.todayLabel : "usage"}</span>
        </button>
        <span className={`conn ${connected ? "on" : "off"}`} title={connected ? "live" : "offline"}>
          <span className="conn-dot" />
        </span>
      </div>
    </header>
  );
}
