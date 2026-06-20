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
    <header className="h-[74px] flex-none flex items-center justify-between px-4 border-b border-border">
      <nav className="flex items-center">
        {TABS.map((t) => {
          const isActive = route.tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`flex items-center h-[46px] px-4 pl-3 mr-2 border rounded-[12px] cursor-pointer ${
                isActive
                  ? "bg-card-2 border-border text-foreground"
                  : "bg-transparent border-transparent text-muted"
              }`}
              onClick={() => goToTab(t.id)}
            >
              <span
                className={`inline-flex items-center justify-center w-[22px] h-[22px] mr-[9px] rounded-[7px] text-[13px] font-bold ${
                  isActive ? "bg-accent text-[#0b0c10]" : "bg-[#2b3040] text-muted"
                }`}
              >
                {t.preset}
              </span>
              <span className="text-[17px] font-semibold">{t.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex items-center">
        {waiting > 0 && (
          <span className="text-[13px] font-bold text-[#1a1205] bg-waiting px-[11px] py-[6px] rounded-full mr-3 animate-pulse">
            {waiting} waiting
          </span>
        )}
        <button
          type="button"
          className="text-[15px] font-semibold text-foreground bg-card-2 border border-border rounded-full py-[7px] px-[13px] mr-[14px] cursor-pointer tabular-nums"
          onClick={() => goToTab("usage")}
        >
          {state.usage ? state.usage.todayLabel : "—"}
        </button>
        <span className="text-[20px] font-semibold mr-3 tabular-nums">{clockTime(clock)}</span>
        <span className="flex items-center" title={connected ? "live" : "offline"}>
          <span className={`w-[11px] h-[11px] rounded-full ${connected ? "bg-working" : "bg-[#e5484d]"}`} />
        </span>
      </div>
    </header>
  );
}
