import { useEffect, useState } from "react";
import { client } from "../client";
import type { SessionDetail, SessionTimelineItem } from "../dashboardTypes";
import { shortModel } from "../format";

const CHIP = "text-[13px] bg-card-2 border border-border rounded-[7px] px-[9px] py-[3px] mr-[7px] mb-[7px]";

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
        <div className="text-muted text-[17px] text-center py-10">
          {notFound ? "Session not found" : "Loading session…"}
        </div>
      </div>
    );
  }

  const model = shortModel(detail.model);
  const todoDone = detail.todos.filter((t) => t.status === "completed").length;
  const items = detail.items.slice().reverse(); // newest first
  const stateBg =
    detail.state === "working"
      ? "bg-working text-[#06140d]"
      : detail.state === "waiting"
        ? "bg-waiting text-[#1a1205]"
        : "bg-idle text-[#06140d]";

  return (
    <div className="flex-1 w-full flex flex-col min-h-0 p-[14px]">
      <div className="flex-none bg-card border border-border rounded-[14px] px-[15px] py-[13px] mb-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-[22px] font-bold">{detail.project}</span>
          <span
            className={`text-[13px] font-bold uppercase tracking-[0.5px] px-[11px] py-1 rounded-full ${stateBg}`}
          >
            {detail.needsInput ? "needs you" : detail.state}
          </span>
        </div>
        {detail.title && <div className="text-[15px] text-muted mt-1">{detail.title}</div>}
        <div className="flex flex-wrap mt-[10px]">
          {model && <span className={`${CHIP} text-[#c8cdda]`}>{model}</span>}
          {detail.gitBranch && detail.gitBranch !== "HEAD" && (
            <span className={`${CHIP} font-mono text-accent`}>{detail.gitBranch}</span>
          )}
          <span className={`${CHIP} text-[#c8cdda]`}>{detail.messageCount} msgs</span>
          {detail.todos.length > 0 && (
            <span className={`${CHIP} text-[#c8cdda]`}>
              tasks {todoDone}/{detail.todos.length}
            </span>
          )}
          {Object.keys(detail.toolCounts)
            .sort((a, b) => detail.toolCounts[b] - detail.toolCounts[a])
            .map((k) => (
              <span key={k} className={`${CHIP} text-[#9aa0b2]`}>
                {k} {detail.toolCounts[k]}
              </span>
            ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-0 dial-scroll">
        {items.length === 0 && (
          <div className="text-muted text-[17px] text-center py-10">No activity yet</div>
        )}
        {items.map((it) => (
          <TimelineRow key={it.id} it={it} />
        ))}
      </div>
    </div>
  );
}

const TAG = "px-2 py-[3px] rounded-md bg-card-2 border text-[11px] font-bold";

function TimelineRow({ it }: { it: SessionTimelineItem }) {
  if (it.kind === "todos") {
    return (
      <div className="border-l-2 border-border pl-[14px] pt-[7px] pb-[9px] ml-1">
        <div className="flex items-center">
          <span className={`${TAG} uppercase tracking-[0.4px] border-border text-waiting`}>tasks</span>
          <span className="ml-2 text-[13px] text-foreground">Updated task list</span>
        </div>
        <div className="mt-[7px]">
          {it.todos?.map((t) => {
            const box =
              t.status === "completed"
                ? "bg-working border-working"
                : t.status === "in_progress"
                  ? "bg-waiting border-waiting"
                  : "border-muted";
            return (
              <div key={t.content} className="flex items-center text-[15px] text-[#d2d6e2] py-[3px]">
                <span className={`w-[13px] h-[13px] rounded-[3px] border-2 mr-[9px] flex-none ${box}`} />
                <span className={t.status === "completed" ? "text-muted line-through" : ""}>{t.content}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (it.kind === "tool") {
    const st = it.tool?.status ?? "pending";
    const tagBorder =
      st === "ok"
        ? "border-[rgba(61,220,145,0.4)] text-[#cbd0dc]"
        : st === "error"
          ? "border-[rgba(229,72,77,0.6)] text-[#ff9ea0]"
          : "border-border text-[#cbd0dc]";
    const statusColor = st === "ok" ? "text-working" : st === "error" ? "text-[#ff9ea0]" : "text-waiting";
    return (
      <div className="border-l-2 border-border pl-[14px] pt-[7px] pb-[9px] ml-1 flex items-center">
        <span className={`${TAG} font-mono ${tagBorder}`}>{it.tool?.name}</span>
        {it.tool?.target && (
          <span className="font-mono text-[13px] text-[#9aa0b2] ml-[10px] truncate">{it.tool.target}</span>
        )}
        <span className={`ml-auto text-[11px] uppercase pl-2 ${statusColor}`}>{st}</span>
      </div>
    );
  }

  const who = it.kind === "prompt" ? "You" : it.kind === "thinking" ? "Thinking" : "Claude";
  const tagColor =
    it.kind === "prompt" ? "text-accent" : it.kind === "thinking" ? "text-[#b78af5]" : "text-working";
  return (
    <div className="border-l-2 border-border pl-[14px] pt-[7px] pb-[9px] ml-1">
      <div className="flex items-center">
        <span className={`${TAG} uppercase tracking-[0.4px] border-border ${tagColor}`}>{who}</span>
      </div>
      <div className="text-[15px] leading-[1.5] text-[#d2d6e2] mt-[6px] whitespace-pre-wrap break-words max-h-[150px] overflow-hidden">
        {it.text}
      </div>
    </div>
  );
}
