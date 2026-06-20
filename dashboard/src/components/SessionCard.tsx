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
  return (
    <div
      className={`card state-${session.state} ${session.needsInput ? "needs-input" : ""} ${
        selected ? "selected" : ""
      } ${onClick ? "clickable" : ""}`}
      onClick={onClick}
    >
      <span className="card-bar" />
      <div className="card-body">
        <div className="card-top">
          <span className="card-project">{session.project}</span>
          {session.gitBranch && session.gitBranch !== "HEAD" && (
            <span className="card-branch">{session.gitBranch}</span>
          )}
          {session.needsInput && <span className="card-flag">needs you</span>}
        </div>
        <div className="card-title">{session.title ?? session.lastPrompt ?? "(untitled session)"}</div>
        <div className="card-meta">
          <span className="dot" />
          <span className="card-state">{session.state}</span>
          <span className="sep">·</span>
          <span>{relativeTime(session.lastActivity, now)}</span>
          {model && (
            <>
              <span className="sep">·</span>
              <span className="card-model">{model}</span>
            </>
          )}
          {session.subagentCount > 0 && (
            <>
              <span className="sep">·</span>
              <span>
                {session.subagentCount} subagent{session.subagentCount > 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      </div>
      {onClick && <span className="card-chevron">›</span>}
    </div>
  );
}
