import { useEffect, useRef, useSyncExternalStore } from "react";
import { SessionCard } from "../components/SessionCard";
import { openSession } from "../router";
import { useConnected, useSessions } from "../store/dashboardStore";
import {
  clampSelectedSession,
  setSelectedSessionIndex,
  useSelectedSessionIndex,
} from "../store/uiStore";

export function BoardPage() {
  const sessions = useSessions();
  const connected = useConnected();
  const now = useNowTick();
  const selected = useSelectedSessionIndex();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clampSelectedSession(Math.max(0, sessions.length - 1));
  }, [sessions.length]);

  // Keep the dial-selected card visible, with breathing room above/below
  // (scrollIntoView left it flush to the edge). getBoundingClientRect + manual
  // scrollTop is reliable on Chromium 69.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector(`[data-session-index='${selected}']`) as HTMLElement | null;
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
          <div className="px-3 py-24 text-center text-lg font-medium text-muted-foreground">
            {connected ? "No active sessions" : "Connecting…"}
          </div>
        )}
        {sessions.map((s, i) => (
          <div key={s.id} data-session-index={i}>
            <SessionCard
              session={s}
              now={now}
              selected={i === selected}
              onClick={() => {
                setSelectedSessionIndex(i);
                openSession(s.id);
              }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}

function useNowTick(): number {
  return useSyncExternalStore(subscribeNow, nowSnapshot, nowSnapshot);
}

let now = Date.now();

function nowSnapshot(): number {
  return now;
}

function subscribeNow(callback: () => void): () => void {
  const id = window.setInterval(() => {
    now = Date.now();
    callback();
  }, 1000);
  return () => {
    window.clearInterval(id);
  };
}
