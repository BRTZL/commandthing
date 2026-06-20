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

  // Keep the dial-selected card visible.
  useEffect(() => {
    const el = listRef.current?.querySelector(".card.selected");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
