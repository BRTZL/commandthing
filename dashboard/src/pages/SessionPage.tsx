import { useEffect, useState } from "react";
import { client } from "../client";
import type { SessionDetail, SessionTimelineItem } from "../dashboardTypes";
import { shortModel } from "../format";

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
      <div className="page-pad">
        <div className="empty">{notFound ? "Session not found" : "Loading session…"}</div>
      </div>
    );
  }

  const model = shortModel(detail.model);
  const todoDone = detail.todos.filter((t) => t.status === "completed").length;
  const items = detail.items.slice().reverse(); // newest first

  return (
    <div className="session-detail">
      <div className="sd-header">
        <div className="sd-title-row">
          <span className="sd-project">{detail.project}</span>
          <span className={`sd-state state-${detail.state}`}>
            {detail.needsInput ? "needs you" : detail.state}
          </span>
        </div>
        {detail.title && <div className="sd-sub">{detail.title}</div>}
        <div className="sd-meta">
          {model && <span className="chip">{model}</span>}
          {detail.gitBranch && detail.gitBranch !== "HEAD" && (
            <span className="chip mono">{detail.gitBranch}</span>
          )}
          <span className="chip">{detail.messageCount} msgs</span>
          {detail.todos.length > 0 && (
            <span className="chip">
              tasks {todoDone}/{detail.todos.length}
            </span>
          )}
          {Object.keys(detail.toolCounts)
            .sort((a, b) => detail.toolCounts[b] - detail.toolCounts[a])
            .map((k) => (
              <span key={k} className="chip tool">
                {k} {detail.toolCounts[k]}
              </span>
            ))}
        </div>
      </div>

      <div className="sd-body dial-scroll">
        {items.length === 0 && <div className="empty">No activity yet</div>}
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
      <div className="ti ti-todos">
        <div className="ti-line">
          <span className="ti-tag tag-todos">tasks</span>
          <span className="ti-title">Updated task list</span>
        </div>
        <div className="todo-list">
          {it.todos?.map((t) => (
            <div key={t.content} className={`todo s-${t.status}`}>
              <span className="todo-box" />
              <span className="todo-text">{t.content}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (it.kind === "tool") {
    const st = it.tool?.status ?? "pending";
    return (
      <div className="ti ti-tool">
        <span className={`ti-tag tag-tool tool-${st}`}>{it.tool?.name}</span>
        {it.tool?.target && <span className="ti-target">{it.tool.target}</span>}
        <span className={`ti-status st-${st}`}>{st}</span>
      </div>
    );
  }

  const who = it.kind === "prompt" ? "You" : it.kind === "thinking" ? "Thinking" : "Claude";
  return (
    <div className={`ti ti-msg ti-${it.kind}`}>
      <div className="ti-line">
        <span className={`ti-tag tag-${it.kind}`}>{who}</span>
      </div>
      <div className="ti-text">{it.text}</div>
    </div>
  );
}
