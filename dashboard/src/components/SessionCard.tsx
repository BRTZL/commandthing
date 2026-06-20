import type { ClaudeSession } from "../dashboardTypes";
import { relativeTime, shortModel } from "../format";

export function SessionCard({
  session,
  now,
  selected,
  onClick,
}: {
  session: ClaudeSession;
  now: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const model = shortModel(session.model);
  const stateColor =
    session.state === "working" ? "bg-working" : session.state === "waiting" ? "bg-waiting" : "bg-idle";
  const bg = selected ? "bg-[#1e2230]" : "bg-card-2";
  const border = selected
    ? "border-accent shadow-[0_0_0_2px_rgba(122,162,247,0.35)]"
    : session.needsInput
      ? "border-waiting"
      : "border-border";

  return (
    // data-selected is what BoardPage queries for scroll-into-view.
    <div
      data-selected={selected ? "true" : undefined}
      onClick={onClick}
      className={`relative mb-[11px] overflow-hidden rounded-[14px] border-2 ${border} ${bg} py-[13px] pl-[18px] pr-[30px] ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <span className={`absolute bottom-0 left-0 top-0 w-[5px] ${stateColor}`} />
      <div>
        <div className="flex items-center">
          <span className="text-[22px] font-bold text-foreground">{session.project}</span>
          {session.gitBranch && session.gitBranch !== "HEAD" && (
            <span className="ml-[10px] rounded-md bg-accent/15 px-2 py-[2px] font-mono text-[13px] text-accent">
              {session.gitBranch}
            </span>
          )}
          {session.needsInput && (
            <span className="ml-auto rounded-full bg-waiting px-[9px] py-[3px] text-[12px] font-bold uppercase tracking-wide text-[#1a1205]">
              needs you
            </span>
          )}
        </div>
        <div className="mt-[5px] truncate text-[16px] text-foreground/80">
          {session.title ?? session.lastPrompt ?? "(untitled session)"}
        </div>
        <div className="mt-[9px] flex items-center text-[14px] text-muted">
          <span className={`mr-2 h-[9px] w-[9px] rounded-full ${stateColor}`} />
          <span className="capitalize">{session.state}</span>
          <span className="mx-2 opacity-50">·</span>
          <span>{relativeTime(session.lastActivity, now)}</span>
          {model && (
            <>
              <span className="mx-2 opacity-50">·</span>
              <span className="font-mono text-[12px]">{model}</span>
            </>
          )}
          {session.subagentCount > 0 && (
            <>
              <span className="mx-2 opacity-50">·</span>
              <span>
                {session.subagentCount} subagent{session.subagentCount > 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      </div>
      {onClick && <span className="absolute right-3 top-1/2 -mt-4 text-[30px] text-muted">›</span>}
    </div>
  );
}
