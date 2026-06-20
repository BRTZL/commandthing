import { useEffect, useState } from "react";
import { client } from "../client";
import type { SessionDetail, SessionTimelineItem } from "../dashboardTypes";
import { shortModel } from "../format";

const CHIP = "mb-1.75 mr-1.75 rounded-md border border-border bg-card-2 px-2.25 py-0.75 text-sm";
const TAG = "rounded-md border bg-card-2 px-2 py-0.75 text-xs font-bold";
const TI = "ml-1 border-l-2 border-border pb-2.25 pl-3.5 pt-1.75";

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
        <div className="py-10 text-center text-lg text-muted">
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
      <div className="mb-2.75 flex-none rounded-xl border border-border bg-card px-3.75 py-3.25">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">{detail.project}</span>
          <span
            data-state={detail.state}
            className="rounded-full bg-idle px-2.75 py-1 text-sm font-bold uppercase tracking-wide text-ink data-[state=waiting]:bg-waiting data-[state=working]:bg-working"
          >
            {detail.needsInput ? "needs you" : detail.state}
          </span>
        </div>
        {detail.title && <div className="mt-1 text-base text-muted">{detail.title}</div>}
        <div className="mt-2.5 flex flex-wrap">
          {model && <span className={`${CHIP} text-foreground-dim`}>{model}</span>}
          {detail.gitBranch && detail.gitBranch !== "HEAD" && (
            <span className={`${CHIP} font-mono text-accent`}>{detail.gitBranch}</span>
          )}
          <span className={`${CHIP} text-foreground-dim`}>{detail.messageCount} msgs</span>
          {detail.todos.length > 0 && (
            <span className={`${CHIP} text-foreground-dim`}>
              tasks {todoDone}/{detail.todos.length}
            </span>
          )}
          {Object.keys(detail.toolCounts)
            .sort((a, b) => detail.toolCounts[b] - detail.toolCounts[a])
            .map((k) => (
              <span key={k} className={`${CHIP} text-muted`}>
                {k} {detail.toolCounts[k]}
              </span>
            ))}
        </div>
      </div>

      <div className="dial-scroll min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-0">
        {items.length === 0 && <div className="py-10 text-center text-lg text-muted">No activity yet</div>}
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
          <span className={`${TAG} border-border uppercase tracking-wide text-waiting`}>tasks</span>
          <span className="ml-2 text-sm text-foreground">Updated task list</span>
        </div>
        <div className="mt-1.75">
          {it.todos?.map((t) => (
            <div
              key={t.content}
              data-status={t.status}
              className="group flex items-center py-0.75 text-base text-foreground-dim"
            >
              <span className="mr-2.25 h-3.25 w-3.25 flex-none rounded-sm border-2 border-muted group-data-[status=completed]:border-working group-data-[status=completed]:bg-working group-data-[status=in_progress]:border-waiting group-data-[status=in_progress]:bg-waiting" />
              <span className="group-data-[status=completed]:text-muted group-data-[status=completed]:line-through">
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
      <div className={`${TI} flex items-center`}>
        <span
          data-status={st}
          className={`${TAG} border-border font-mono text-foreground-dim data-[status=ok]:border-working/40 data-[status=error]:border-destructive/60 data-[status=error]:text-destructive-foreground`}
        >
          {it.tool?.name}
        </span>
        {it.tool?.target && (
          <span className="ml-2.5 truncate font-mono text-sm text-muted">{it.tool.target}</span>
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
        <span
          data-kind={it.kind}
          className={`${TAG} border-border uppercase tracking-wide text-working data-[kind=prompt]:text-accent data-[kind=thinking]:text-thinking`}
        >
          {who}
        </span>
      </div>
      <div className="mt-1.5 max-h-37.5 overflow-hidden whitespace-pre-wrap break-words text-base leading-normal text-foreground-dim">
        {it.text}
      </div>
    </div>
  );
}
