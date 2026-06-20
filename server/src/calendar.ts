/**
 * Calendar provider — placeholder for now (de-scoped).
 *
 * Returns a small mock so the dashboard tile isn't empty. Real calendar
 * (Google secret iCal URL or OAuth) is deferred; DashboardState.calendarSource
 * stays "mock" so the UI flags it.
 */

import type { CalendarEvent } from "../../shared/protocol.ts";

const HOUR = 60 * 60_000;
const MIN = 60_000;

export const CALENDAR_SOURCE = "mock" as const;

export function getCalendar(now = Date.now()): CalendarEvent[] {
  const top = new Date(now);
  top.setMinutes(0, 0, 0);
  const t = top.getTime();
  const events: CalendarEvent[] = [
    {
      id: "mock-1",
      title: "Standup",
      start: t + 30 * MIN,
      end: t + 45 * MIN,
      allDay: false,
      location: "Zoom",
    },
    {
      id: "mock-2",
      title: "Deep work — Car Thing dashboard",
      start: t + 2 * HOUR,
      end: t + 4 * HOUR,
      allDay: false,
      location: null,
    },
    {
      id: "mock-3",
      title: "1:1 with Sam",
      start: t + 5 * HOUR,
      end: t + 5 * HOUR + 30 * MIN,
      allDay: false,
      location: "Meet",
    },
  ];
  return events.filter((e) => e.end >= now).sort((a, b) => a.start - b.start);
}
