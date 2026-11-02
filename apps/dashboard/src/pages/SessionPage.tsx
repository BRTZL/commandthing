import { useEffect, useState } from "react";
import { client } from "../client";
import { ChevronLeftIcon } from "../components/icons";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import type {
  SessionChanges,
  SessionDetail,
  SessionFocus,
  SessionPullRequest,
  SessionTimelineItem,
  TodoItem,
} from "../dashboardTypes";
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
    <div className="flex w-full flex-1 flex-col min-h-0 pl-3.5 pr-10 pt-2">
      <header className="mb-3 flex flex-none items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          className="-ml-1 mr-1.5 h-10 w-10 flex-none text-foreground hover:bg-transparent"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-bold leading-tight">{detail.title ?? detail.project}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {detail.project} · {facts.join(" · ")}
          </div>
        </div>
        <span data-state={detail.state} className="group ml-3 flex flex-none items-center">
          <span className="mr-2 h-2.5 w-2.5 rounded-full bg-idle group-data-[state=background]:bg-background-work group-data-[state=done]:bg-done group-data-[state=failed]:bg-failed group-data-[state=waiting]:bg-waiting group-data-[state=working]:bg-working" />
          <span className="text-base font-semibold text-muted-foreground group-data-[state=done]:text-done group-data-[state=failed]:text-failed group-data-[state=waiting]:text-waiting group-data-[state=working]:text-working">
            {detail.statusLabel}
          </span>
        </span>
      </header>

      <div className="dial-scroll min-h-0 flex-1 overflow-y-auto pb-3 [&::-webkit-scrollbar]:w-0">
        {detail.focus && <Focus focus={detail.focus} />}
        {detail.todos.length > 0 && <Tasks todos={detail.todos} />}
        {detail.pullRequests.length > 0 && (
          <PullRequests pullRequests={detail.pullRequests} hidden={detail.hiddenPullRequests} />
        )}
        {detail.changes && <Changes changes={detail.changes} now={detail.generatedAt} />}
        {items.map((it) => (
          <TimelineRow key={it.id} it={it} />
        ))}
      </div>
    </div>
  );
}

function Focus({ focus }: { focus: SessionFocus }) {
  return (
    <section data-kind={focus.kind} className="group mb-4 px-1">
      <div className="text-base font-semibold text-muted-foreground group-data-[kind=activity]:text-working group-data-[kind=error]:text-failed group-data-[kind=request]:text-waiting">
        {focus.title}
      </div>
      {focus.text && (
        <div
          data-kind={focus.kind}
          className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-2xl leading-snug text-foreground data-[kind=activity]:truncate data-[kind=activity]:font-mono data-[kind=activity]:text-xl"
        >
          {focus.text}
        </div>
      )}
      {focus.detail && (
        <div className="mt-1.5 line-clamp-2 text-base text-muted-foreground">{focus.detail}</div>
      )}
      {focus.options && focus.options.length > 0 && (
        <div className="mt-3 flex flex-wrap">
          {focus.options.map((option) => (
            <Badge
              key={option}
              variant="outline"
              className="mb-1.5 mr-2 rounded-full border-2 border-waiting/60 px-3.5 py-1 text-base font-medium text-foreground"
            >
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
    <section className="flex items-center border-t border-border px-1 py-3">
      <span className="mr-3 flex-none text-lg font-bold tabular-nums text-foreground">
        {done}/{todos.length}
      </span>
      <span className="mr-3 h-1.5 w-24 flex-none overflow-hidden rounded-full bg-secondary">
        <span
          className="block h-full rounded-full bg-working"
          style={{ width: `${(done / todos.length) * 100}%` }}
        />
      </span>
      <span className="min-w-0 truncate text-base text-foreground/80">
        {current?.content ?? "All tasks done"}
      </span>
    </section>
  );
}

function Delta({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  return (
    <>
      {!!additions && <span className="mr-1.5 text-working">+{additions}</span>}
      {!!deletions && <span className="text-failed">−{deletions}</span>}
    </>
  );
}

/** One status per pull request: whatever you would have to act on first. */
function prStatus(pr: SessionPullRequest): { label: string; tone: string } {
  if (pr.state === "merged") return { label: "Merged", tone: "text-done" };
  if (pr.state === "closed") return { label: "Closed", tone: "text-muted-foreground" };
  if (pr.checks === "failing") return { label: "Checks failing", tone: "text-failed" };
  if (pr.conflicting) return { label: "Conflicts", tone: "text-failed" };
  if (pr.review === "changes-requested") return { label: "Changes requested", tone: "text-failed" };
  if (pr.checks === "pending") return { label: "Checks running", tone: "text-background-work" };
  if (pr.isDraft) return { label: "Draft", tone: "text-muted-foreground" };
  if (pr.review === "approved") return { label: "Approved", tone: "text-working" };
  if (pr.checks === "passing") return { label: "Checks passing", tone: "text-working" };
  return { label: "Open", tone: "text-muted-foreground" };
}

function PullRequests({ pullRequests, hidden }: { pullRequests: SessionPullRequest[]; hidden: number }) {
  return (
    <section className="border-t border-border px-1 py-3">
      {pullRequests.map((pr, index) => {
        const status = prStatus(pr);
        return (
          <div key={pr.number} className={index > 0 ? "mt-2" : undefined}>
            <div className="flex items-center text-base">
              <span className="mr-2 flex-none font-semibold tabular-nums text-foreground">#{pr.number}</span>
              <span className="min-w-0 flex-1 truncate text-foreground/80">{pr.title}</span>
              <span className={`ml-3 flex-none text-sm font-semibold ${status.tone}`}>{status.label}</span>
            </div>
            {(pr.changedFiles != null || pr.additions != null || pr.deletions != null) && (
              <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                {pr.changedFiles != null && (
                  <span className="mr-2 font-sans text-sm">
                    {pr.changedFiles} file{pr.changedFiles === 1 ? "" : "s"}
                  </span>
                )}
                <Delta additions={pr.additions} deletions={pr.deletions} />
              </div>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          {hidden} more open PR{hidden === 1 ? "" : "s"}
        </div>
      )}
    </section>
  );
}

function Changes({ changes, now }: { changes: SessionChanges; now: number }) {
  const more = changes.fileCount - changes.files.length;
  return (
    <section className="mb-1 border-t border-border px-1 py-3">
      <div className="flex items-center text-sm">
        <span className="font-semibold text-foreground">
          Last changes · {changes.fileCount} file{changes.fileCount === 1 ? "" : "s"}
        </span>
        <span className="ml-2 font-mono text-xs tabular-nums">
          <Delta additions={changes.additions} deletions={changes.deletions} />
        </span>
        <span className="ml-auto flex-none pl-3 text-muted-foreground">
          {relativeTime(changes.capturedAt, now)}
        </span>
      </div>
      {changes.files.map((file) => (
        <div key={file.path} className="mt-1 flex items-center font-mono text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{file.path}</span>
          <span className="ml-3 flex-none tabular-nums">
            <Delta additions={file.additions} deletions={file.deletions} />
          </span>
        </div>
      ))}
      {more > 0 && <div className="mt-1 text-xs text-muted-foreground">{more} more</div>}
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
