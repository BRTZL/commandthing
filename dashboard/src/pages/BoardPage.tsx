import { CalendarPanel } from "../components/CalendarPanel";
import { SessionCard } from "../components/SessionCard";
import type { DashboardState } from "../dashboardTypes";
import { navigate } from "../router";

export function BoardPage({
  state,
  connected,
  now,
}: {
  state: DashboardState;
  connected: boolean;
  now: number;
}) {
  return (
    <main className="main">
      <section className="panel sessions">
        <div className="panel-head">
          <span>Claude Sessions</span>
          <span className="count">{state.sessions.length}</span>
        </div>
        <div className="session-list">
          {state.sessions.length === 0 && (
            <div className="empty">{connected ? "No active sessions" : "Connecting to feeder…"}</div>
          )}
          {state.sessions.map((s) => (
            <SessionCard key={s.id} session={s} now={now} onClick={() => navigate(`/session/${s.id}`)} />
          ))}
        </div>
      </section>

      <CalendarPanel events={state.calendar} source={state.calendarSource} now={now} />
    </main>
  );
}
