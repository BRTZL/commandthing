import type { DashboardState } from "../dashboardTypes";
import { clockTime } from "../format";
import { goToTab, type Route } from "../router";
import { TABS } from "../tabs";

export function TopBar({
  state,
  connected,
  now,
  route,
}: {
  state: DashboardState;
  connected: boolean;
  now: number;
  route: Route;
}) {
  const clock = new Date(now);
  const waiting = state.sessions.filter((s) => s.needsInput).length;

  return (
    <header className="topbar">
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${route.tab === t.id ? "active" : ""}`}
            onClick={() => goToTab(t.id)}
          >
            <span className="tab-num">{t.preset}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        {waiting > 0 && <span className="waiting-pill">{waiting} waiting</span>}
        <button type="button" className="cost" onClick={() => goToTab("usage")}>
          {state.usage ? state.usage.todayLabel : "—"}
        </button>
        <span className="clock-time">{clockTime(clock)}</span>
        <span className={`conn ${connected ? "on" : "off"}`} title={connected ? "live" : "offline"}>
          <span className="conn-dot" />
        </span>
      </div>
    </header>
  );
}
