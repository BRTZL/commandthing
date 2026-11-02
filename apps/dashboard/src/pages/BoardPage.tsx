import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { client } from "../client";
import { Button } from "../components/ui/button";
import type { AgentSession, SessionDetail } from "../dashboardTypes";
import { relativeTime } from "../format";
import { openSession } from "../router";
import { feederNow, useConnected, useSessions, useSessionsError } from "../store/dashboardStore";
import { clampSelectedSession, setSelectedSessionIndex, useSelectedSessionIndex } from "../store/uiStore";

/**
 * StandBy-style board: one huge count and the lead thread's own words, readable
 * from across the desk, then a borderless list of everything else.
 */
export function BoardPage() {
  const sessions = useSessions();
  const connected = useConnected();
  const sessionsError = useSessionsError();
  const now = useNowTick();
  const selected = useSelectedSessionIndex();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clampSelectedSession(Math.max(0, sessions.length - 1));
  }, [sessions.length]);

  // Keep the dial-selected row visible. getBoundingClientRect + manual
  // scrollTop is reliable on Chromium 69 where scrollIntoView is not.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector(`[data-session-index='${selected}']`) as HTMLElement | null;
    if (!list || !el) return;
    const topMargin = 72; // clear of the absolute tab bar
    const bottomMargin = 40;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.bottom + bottomMargin > lr.bottom) {
      list.scrollTop += er.bottom + bottomMargin - lr.bottom;
    } else if (er.top - topMargin < lr.top) {
      list.scrollTop -= lr.top - er.top + topMargin;
    }
  }, [selected]);

  const waiting = sessions.filter((s) => s.needsInput);
  const working = sessions.filter((s) => s.state === "working");
  const lead = waiting[0] ?? working[0] ?? null;
  const leadIndex = lead ? sessions.indexOf(lead) : -1;

  return (
    <main className="flex w-full flex-1 flex-col min-h-0 px-3.5">
      <div
        className="dial-scroll min-h-0 overflow-y-auto pt-[4.5rem] pb-10 [&::-webkit-scrollbar]:w-0"
        ref={listRef}
      >
        {sessions.length === 0 ? (
          <Empty text={!connected ? "Connecting…" : (sessionsError ?? "No active threads in T3 Code")} />
        ) : (
          <>
            <Hero
              count={waiting.length || working.length}
              label={waiting.length ? "need you" : working.length ? "working" : "all quiet"}
              tone={
                waiting.length ? "text-waiting" : working.length ? "text-working" : "text-muted-foreground"
              }
              lead={lead}
              selected={leadIndex === selected}
              onOpen={() => lead && open(leadIndex, lead.id)}
              index={leadIndex}
            />
            {sessions.map((s, i) =>
              s === lead ? null : (
                <Row key={s.id} session={s} now={now} index={i} selected={i === selected} />
              ),
            )}
          </>
        )}
      </div>
    </main>
  );
}

const TONE: Record<AgentSession["state"], { text: string; dot: string }> = {
  waiting: { text: "text-waiting", dot: "bg-waiting" },
  working: { text: "text-working", dot: "bg-working" },
  failed: { text: "text-failed", dot: "bg-failed" },
  done: { text: "text-done", dot: "bg-done" },
  background: { text: "text-muted-foreground", dot: "bg-background-work" },
  idle: { text: "text-muted-foreground", dot: "bg-idle" },
};

function open(index: number, id: string) {
  setSelectedSessionIndex(index);
  openSession(id);
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-2 pt-6">
      <div className="text-[5rem] font-bold leading-none text-muted-foreground">0</div>
      <div className="mt-3 text-2xl text-muted-foreground">{text}</div>
    </div>
  );
}

function Hero({
  count,
  label,
  tone,
  lead,
  selected,
  onOpen,
  index,
}: {
  count: number;
  label: string;
  tone: string;
  lead: AgentSession | null;
  selected: boolean;
  onOpen: () => void;
  index: number;
}) {
  const focus = useFocus(lead?.id ?? null);
  return (
    <div data-session-index={lead ? index : undefined}>
      <Button
        variant="ghost"
        onClick={onOpen}
        data-selected={selected ? "true" : undefined}
        className="relative mb-4 block h-auto w-full whitespace-normal rounded-none py-1 pl-4 pr-2 text-left font-normal text-foreground hover:bg-transparent"
      >
        {selected && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-primary" />}
        <div className="flex items-end">
          <span className={`text-[5rem] font-bold leading-none tabular-nums ${tone}`}>{count}</span>
          <span className="mb-2 ml-4 text-3xl font-semibold">{label}</span>
        </div>
        {lead && (
          <div className="mt-3 pr-10">
            <div className={`truncate text-base font-semibold ${TONE[lead.state].text}`}>
              {lead.project} · {focus?.title ?? lead.statusLabel}
            </div>
            <div
              data-mono={focus?.kind === "activity" ? "true" : undefined}
              className="mt-1 line-clamp-2 text-2xl leading-snug data-[mono=true]:font-mono data-[mono=true]:text-xl"
            >
              {focus?.text ?? lead.title ?? lead.lastPrompt}
            </div>
          </div>
        )}
      </Button>
    </div>
  );
}

function Row({
  session: s,
  now,
  index,
  selected,
}: {
  session: AgentSession;
  now: number;
  index: number;
  selected: boolean;
}) {
  return (
    <div data-session-index={index}>
      <Button
        variant="ghost"
        onClick={() => open(index, s.id)}
        data-selected={selected ? "true" : undefined}
        className="flex h-auto w-full items-center justify-start rounded-xl py-3 pl-3 pr-10 text-left font-normal text-foreground hover:bg-transparent data-[selected=true]:bg-secondary"
      >
        <span className={`mr-4 h-3 w-3 flex-none rounded-full ${TONE[s.state].dot}`} />
        <span className="w-44 flex-none truncate text-xl font-bold">{s.project}</span>
        <span className="min-w-0 flex-1 truncate text-lg text-muted-foreground">
          {s.title ?? s.lastPrompt}
        </span>
        <span className={`ml-4 flex-none text-lg font-semibold ${TONE[s.state].text}`}>{s.statusLabel}</span>
        <span className="ml-3 w-12 flex-none text-right text-lg tabular-nums text-muted-foreground">
          {relativeTime(s.lastActivity, now).replace(" ago", "")}
        </span>
      </Button>
    </div>
  );
}

/** The lead thread's focus (its question, approval or current command), refreshed while shown. */
function useFocus(id: string | null) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = () =>
      client
        .request<SessionDetail>("session.detail", { id })
        .then((d) => {
          if (alive) setDetail(d);
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [id]);
  return detail?.id === id ? detail.focus : null;
}

function useNowTick(): number {
  return useSyncExternalStore(subscribeNow, nowSnapshot, nowSnapshot);
}

let now = feederNow();

function nowSnapshot(): number {
  return now;
}

function subscribeNow(callback: () => void): () => void {
  const id = window.setInterval(() => {
    now = feederNow();
    callback();
  }, 1000);
  return () => {
    window.clearInterval(id);
  };
}
