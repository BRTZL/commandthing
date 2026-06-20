import { useEffect, useState } from "react";
import { client } from "../client";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import type { SessionDetail, SessionTimelineItem } from "../dashboardTypes";
import { shortModel } from "../format";
import { cn } from "../lib/cn";

// Extra classes layered onto <Badge variant="secondary"> for the header chips
// (larger text, normal weight, wrap spacing); TI is the timeline rail.
const CHIP = "mb-2 mr-2 text-sm font-normal";
const TI = "ml-1 border-l-2 border-border pb-2 pl-3.5 pt-2";

export function SessionPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      client
        .request<SessionDetail>("session.detail", { id })
        .then((d) => {
          if (alive) {
            setDetail(d);
            setError(null);
          }
        })
        .catch((e) => {
          if (alive) setError(String(e?.message ?? e));
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

  const model = shortModel(detail.model);
  const todoDone = detail.todos.filter((t) => t.status === "completed").length;
  const items = detail.items.slice().reverse(); // newest first

  return (
    <div className="flex w-full flex-1 flex-col min-h-0 p-3.5">
      <Card className="mb-3 flex-none px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">{detail.project}</span>
          <Badge
            data-state={detail.state}
            className="rounded-full bg-idle px-3 py-1 text-sm uppercase tracking-wide data-[state=waiting]:bg-waiting data-[state=working]:bg-working"
          >
            {detail.needsInput ? "needs you" : detail.state}
          </Badge>
        </div>
        {detail.title && <div className="mt-1 text-base text-muted-foreground">{detail.title}</div>}
        <div className="mt-2.5 flex flex-wrap">
          {model && (
            <Badge variant="secondary" className={cn(CHIP, "text-foreground")}>
              {model}
            </Badge>
          )}
          {detail.gitBranch && detail.gitBranch !== "HEAD" && (
            <Badge variant="secondary" className={cn(CHIP, "font-mono text-primary")}>
              {detail.gitBranch}
            </Badge>
          )}
          <Badge variant="secondary" className={cn(CHIP, "text-foreground")}>
            {detail.messageCount} msgs
          </Badge>
          {detail.todos.length > 0 && (
            <Badge variant="secondary" className={cn(CHIP, "text-foreground")}>
              tasks {todoDone}/{detail.todos.length}
            </Badge>
          )}
          {Object.keys(detail.toolCounts)
            .sort((a, b) => detail.toolCounts[b] - detail.toolCounts[a])
            .map((k) => (
              <Badge key={k} variant="secondary" className={cn(CHIP, "text-muted-foreground")}>
                {k} {detail.toolCounts[k]}
              </Badge>
            ))}
        </div>
      </Card>

      <div className="dial-scroll min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-0">
        {items.length === 0 && (
          <div className="py-10 text-center text-lg text-muted-foreground">No activity yet</div>
        )}
        {items.map((it) => (
          <TimelineRow key={it.id} it={it} />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({ it }: { it: SessionTimelineItem }) {
  if (it.kind === "todos") {
    return (
      <div className={TI}>
        <div className="flex items-center">
          <Badge variant="secondary" className="uppercase tracking-wide text-waiting">
            tasks
          </Badge>
          <span className="ml-2 text-sm text-foreground">Updated task list</span>
        </div>
        <div className="mt-2">
          {it.todos?.map((t) => (
            <div
              key={t.content}
              data-status={t.status}
              className="group flex items-center py-0.5 text-base text-foreground"
            >
              <span className="mr-2 h-3 w-3 flex-none rounded-sm border-2 border-muted-foreground group-data-[status=completed]:border-working group-data-[status=completed]:bg-working group-data-[status=in_progress]:border-waiting group-data-[status=in_progress]:bg-waiting" />
              <span className="group-data-[status=completed]:text-muted-foreground group-data-[status=completed]:line-through">
                {t.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (it.kind === "tool") {
    const st = it.tool?.status ?? "pending";
    return (
      <div className={cn(TI, "flex items-center")}>
        <Badge
          variant="secondary"
          data-status={st}
          className="font-mono data-[status=ok]:border-working/40 data-[status=error]:border-destructive/60 data-[status=error]:text-destructive-foreground"
        >
          {it.tool?.name}
        </Badge>
        {it.tool?.target && (
          <span className="ml-2.5 truncate font-mono text-sm text-muted-foreground">{it.tool.target}</span>
        )}
        <span
          data-status={st}
          className="ml-auto pl-2 text-xs uppercase data-[status=error]:text-destructive-foreground data-[status=ok]:text-working data-[status=pending]:text-waiting"
        >
          {st}
        </span>
      </div>
    );
  }

  const who = it.kind === "prompt" ? "You" : it.kind === "thinking" ? "Thinking" : "Claude";
  return (
    <div className={TI}>
      <div className="flex items-center">
        <Badge
          variant="secondary"
          data-kind={it.kind}
          className="uppercase tracking-wide text-working data-[kind=prompt]:text-primary data-[kind=thinking]:text-thinking"
        >
          {who}
        </Badge>
      </div>
      <div className="mt-1.5 max-h-36 overflow-hidden whitespace-pre-wrap break-words text-base leading-normal text-foreground">
        {it.text}
      </div>
    </div>
  );
}
