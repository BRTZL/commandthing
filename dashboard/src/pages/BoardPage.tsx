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
    const el = list?.querySelector("[data-selected='true']") as HTMLElement | null;
    if (!list || !el) return;
    const topMargin = 84; // keep the selected card clear of the absolute header
    const bottomMargin = 52;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.bottom + bottomMargin > lr.bottom) {
      list.scrollTop += er.bottom + bottomMargin - lr.bottom;
    } else if (er.top - topMargin < lr.top) {
      list.scrollTop -= lr.top - er.top + topMargin;
    }
  }, [selected]);

  return (
    <main className="flex w-full flex-1 flex-col min-h-0 px-3.5">
      <div
        className="dial-scroll min-h-0 overflow-y-auto pt-16 pb-12 [&::-webkit-scrollbar]:w-0"
        ref={listRef}
      >
        {sessions.length === 0 && (
          <div className="px-3 py-10 text-center text-lg text-muted-foreground">
            {connected ? "No active sessions" : "Connecting to feeder…"}
          </div>
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
