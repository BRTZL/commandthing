import type { DashboardState } from "../dashboardTypes";
import { clockTime } from "../format";
import { cn } from "../lib/cn";
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
    <header className="flex h-18.5 flex-none items-center justify-between border-b border-border px-4">
      <nav className="flex items-center">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-active={route.tab === t.id ? "true" : undefined}
            onClick={() => goToTab(t.id)}
            className="group mr-2 flex h-11.5 cursor-pointer items-center rounded-lg border border-transparent pl-3 pr-4 text-muted data-[active=true]:border-border data-[active=true]:bg-card-2 data-[active=true]:text-foreground"
          >
            <span className="mr-2.25 inline-flex h-5.5 w-5.5 items-center justify-center rounded-md bg-surface-2 text-sm font-bold text-muted group-data-[active=true]:bg-accent group-data-[active=true]:text-ink">
              {t.preset}
            </span>
            <span className="text-lg font-semibold">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="flex items-center">
        {waiting > 0 && (
          <span className="mr-3 animate-pulse rounded-full bg-waiting px-2.75 py-1.5 text-sm font-bold text-ink">
            {waiting} waiting
          </span>
        )}
        <button
          type="button"
          onClick={() => goToTab("usage")}
          className="mr-3.5 cursor-pointer rounded-full border border-border bg-card-2 px-3.25 py-1.75 text-base font-semibold tabular-nums text-foreground"
        >
          {state.usage ? state.usage.todayLabel : "—"}
        </button>
        <span className="mr-3 text-xl font-semibold tabular-nums">{clockTime(clock)}</span>
        <span className="flex items-center" title={connected ? "live" : "offline"}>
          <span className={cn("h-2.75 w-2.75 rounded-full", connected ? "bg-working" : "bg-destructive")} />
        </span>
      </div>
    </header>
  );
}
