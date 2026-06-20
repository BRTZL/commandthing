import type { CalendarEvent } from "../dashboardTypes";
import { eventTime } from "../format";

export function CalendarPanel({
  events,
  source,
  now,
}: {
  events: CalendarEvent[];
  source: "mock" | "google";
  now: number;
}) {
  return (
    <section className="panel calendar">
      <div className="panel-head">
        <span>Up Next</span>
        {source === "mock" && <span className="mock-badge">mock</span>}
      </div>
      <div className="cal-list">
        {events.length === 0 && <div className="empty">Nothing scheduled</div>}
        {events.map((e) => {
          const ongoing = e.start <= now && now < e.end;
          const soon = !ongoing && e.start - now < 15 * 60_000;
          return (
            <div key={e.id} className={`cal-item ${ongoing ? "ongoing" : ""} ${soon ? "soon" : ""}`}>
              <div className="cal-time">{e.allDay ? "all day" : eventTime(e.start)}</div>
              <div className="cal-body">
                <div className="cal-title">{e.title}</div>
                {e.location && <div className="cal-loc">{e.location}</div>}
              </div>
              {ongoing && <span className="cal-now">now</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
