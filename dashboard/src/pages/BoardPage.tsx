import { useEffect, useRef } from "react";
import { SessionCard } from "../components/SessionCard";
import type { ClaudeSession } from "../dashboardTypes";

export function BoardPage({
  sessions,
  connected,
  now,
  selected,
  onOpen,
  onHover,
}: {
  sessions: ClaudeSession[];
  connected: boolean;
  now: number;
  selected: number;
  onOpen: (id: string) => void;
  onHover: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the dial-selected card visible, with breathing room above/below
  // (scrollIntoView left it flush to the edge). getBoundingClientRect + manual
  // scrollTop is reliable on Chromium 69.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector(".card.selected") as HTMLElement | null;
    if (!list || !el) return;
    const margin = 52;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.bottom + margin > lr.bottom) {
      list.scrollTop += er.bottom + margin - lr.bottom;
    } else if (er.top - margin < lr.top) {
      list.scrollTop -= lr.top - er.top + margin;
    }
  }, [selected]);

  return (
    <main className="board">
      <div className="session-list dial-scroll" ref={listRef}>
        {sessions.length === 0 && (
          <div className="empty">{connected ? "No active sessions" : "Connecting to feeder…"}</div>
        )}
        {sessions.map((s, i) => (
          <SessionCard
            key={s.id}
            session={s}
            now={now}
            selected={i === selected}
            onClick={() => {
              onHover(i);
              onOpen(s.id);
            }}
          />
        ))}
      </div>
    </main>
  );
}
