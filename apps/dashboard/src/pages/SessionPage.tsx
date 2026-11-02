import { useEffect, useState } from "react";
import { client } from "../client";
import { ChevronLeftIcon } from "../components/icons";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import type { SessionDetail, SessionFocus, SessionTimelineItem, TodoItem } from "../dashboardTypes";
import { relativeTime, shortModel } from "../format";
import { goBack } from "../router";

export function SessionPage({ id }: { id: string }) {
  const [{ detail, error }, setResult] = useState<{
    detail: SessionDetail | null;
    error: string | null;
  }>({ detail: null, error: null });

  useEffect(() => {
    let alive = true;
    const load = () =>
      client
        .request<SessionDetail>("session.detail", { id })
        .then((d) => {
          if (alive) setResult({ detail: d, error: null });
        })
        .catch((e) => {
          if (alive) setResult((current) => ({ ...current, error: String(e?.message ?? e) }));
        });
    load();
    const t = window.setInterval(load, 3000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [id]);

  if (!detail) {
    const notFound = !!error && /not found/i.test(error);
    return (
      <div className="p-6">
        <div className="py-10 text-center text-lg text-muted-foreground">
          {notFound ? "Session not found" : "Loading session…"}
        </div>
      </div>
    );
  }

  // Relative to the feeder's clock: the device's wall clock can be years off.
  const since = relativeTime(detail.lastActivity, detail.generatedAt);
  const facts = [
    shortModel(detail.model),
    detail.gitBranch && detail.gitBranch !== "HEAD" ? detail.gitBranch : null,
    since,
    detail.subagentCount > 0
      ? `${detail.subagentCount} subagent${detail.subagentCount > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean);
  const items = detail.items.slice().reverse(); // newest first

  return (
    <div className="flex w-full flex-1 flex-col min-h-0 px-3.5 pt-2">
      <header className="mb-2 flex flex-none items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          className="-ml-1 mr-1.5 h-10 w-10 flex-none text-foreground hover:bg-secondary"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-bold leading-tight">{detail.title ?? detail.project}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {detail.project} · {facts.join(" · ")}
          </div>
        </div>
        <Badge
          data-state={detail.state}
          className="ml-3 flex-none rounded-full bg-idle px-3 py-1 text-sm text-foreground data-[state=background]:bg-background-work data-[state=done]:bg-done data-[state=failed]:bg-failed data-[state=waiting]:bg-waiting data-[state=working]:bg-working data-[state=background]:text-primary-foreground data-[state=done]:text-primary-foreground data-[state=failed]:text-primary-foreground data-[state=waiting]:text-primary-foreground data-[state=working]:text-primary-foreground"
        >
          {detail.statusLabel}
        </Badge>
      </header>

      <div className="dial-scroll min-h-0 flex-1 overflow-y-auto pb-3 [&::-webkit-scrollbar]:w-0">
        {detail.focus && <Focus focus={detail.focus} />}
        {detail.todos.length > 0 && <Tasks todos={detail.todos} />}
        {items.map((it) => (
          <TimelineRow key={it.id} it={it} />
        ))}
      </div>
    </div>
  );
}

function Focus({ focus }: { focus: SessionFocus }) {
  return (
    <section
      data-kind={focus.kind}
      className="group mb-2.5 rounded-xl border-2 border-border bg-secondary px-4 py-3 data-[kind=error]:border-failed data-[kind=request]:border-waiting"
    >
      <div className="text-sm font-semibold text-muted-foreground group-data-[kind=activity]:text-working group-data-[kind=error]:text-failed group-data-[kind=request]:text-waiting">
        {focus.title}
      </div>
      {focus.text && (
        <div
          data-kind={focus.kind}
          className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-lg leading-snug text-foreground data-[kind=activity]:truncate data-[kind=activity]:font-mono data-[kind=activity]:text-base"
        >
          {focus.text}
        </div>
      )}
      {focus.detail && (
        <div className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{focus.detail}</div>
      )}
      {focus.options && focus.options.length > 0 && (
        <div className="mt-2 flex flex-wrap">
          {focus.options.map((option) => (
            <Badge key={option} variant="secondary" className="mb-1 mr-1.5 px-2.5 py-1 text-sm font-medium">
              {option}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function Tasks({ todos }: { todos: TodoItem[] }) {
  const done = todos.filter((t) => t.status === "completed").length;
  const current =
    todos.find((t) => t.status === "in_progress") ?? todos.find((t) => t.status !== "completed");
  return (
    <section className="mb-3 flex items-center rounded-xl bg-secondary px-4 py-2.5">
      <span className="mr-3 flex-none text-sm font-semibold tabular-nums text-foreground">
        {done}/{todos.length}
      </span>
      <span className="mr-3 h-1.5 w-20 flex-none overflow-hidden rounded-full bg-border">
        <span
          className="block h-full rounded-full bg-working"
          style={{ width: `${(done / todos.length) * 100}%` }}
        />
      </span>
      <span className="min-w-0 truncate text-sm text-foreground/80">
        {current?.content ?? "All tasks done"}
      </span>
    </section>
  );
}

function TimelineRow({ it }: { it: SessionTimelineItem }) {
  if (it.kind === "tools" && it.tools) {
    const { counts, failed, lastTarget, running } = it.tools;
    return (
      <div className="flex items-center px-1 py-1.5 text-sm text-muted-foreground">
        <span className="flex-none font-semibold">
          {counts.map((c) => (c.count > 1 ? `${c.name} ${c.count}` : c.name)).join(" · ")}
        </span>
        {lastTarget && <span className="ml-2.5 min-w-0 truncate font-mono text-xs">{lastTarget}</span>}
        {failed > 0 && (
          <span className="ml-auto flex-none pl-2.5 font-semibold text-failed">{failed} failed</span>
        )}
        {running && failed === 0 && (
          <span className="ml-auto flex-none pl-2.5 font-semibold text-working">running</span>
        )}
      </div>
    );
  }
  const label = it.kind === "prompt" ? "You" : it.kind === "error" ? "Error" : "Agent";
  return (
    <div className="px-1 py-1.5">
      <div
        data-kind={it.kind}
        className="text-xs font-bold text-working data-[kind=error]:text-failed data-[kind=prompt]:text-primary"
      >
        {label}
      </div>
      <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-base leading-snug text-foreground">
        {it.text}
      </div>
    </div>
  );
}
