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
    // State drives child colors via group-data-*; selected/needs drive the card.
    <div
      data-state={session.state}
      data-selected={selected ? "true" : undefined}
      data-needs={session.needsInput ? "true" : undefined}
      onClick={onClick}
      className="group relative mb-3 cursor-pointer overflow-hidden rounded-xl border-2 border-border bg-secondary py-3 pl-4 pr-7 data-[needs=true]:border-waiting data-[selected=true]:border-primary data-[selected=true]:bg-accent data-[selected=true]:ring-2 data-[selected=true]:ring-primary/30"
    >
      <span className="absolute bottom-0 left-0 top-0 w-1.5 bg-idle group-data-[state=working]:bg-working group-data-[state=waiting]:bg-waiting" />
      <div>
        <div className="flex items-center">
          <span className="text-2xl font-bold text-foreground">{session.project}</span>
          {session.gitBranch && session.gitBranch !== "HEAD" && (
            <span className="ml-2.5 rounded-md bg-primary/15 px-2 py-0.5 font-mono text-sm text-primary">
              {session.gitBranch}
            </span>
          )}
          {session.needsInput && (
            <span className="ml-auto rounded-full bg-waiting px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
              needs you
            </span>
          )}
        </div>
        <div className="mt-1.5 truncate text-base text-foreground/80">
          {session.title ?? session.lastPrompt ?? "(untitled session)"}
        </div>
        <div className="mt-2.5 flex items-center text-sm text-muted-foreground">
          <span className="mr-2 h-2 w-2 rounded-full bg-idle group-data-[state=working]:bg-working group-data-[state=waiting]:bg-waiting" />
          <span className="capitalize">{session.state}</span>
          <span className="mx-2 opacity-50">·</span>
          <span>{relativeTime(session.lastActivity, now)}</span>
          {model && (
            <>
              <span className="mx-2 opacity-50">·</span>
              <span className="font-mono text-xs">{model}</span>
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
      {onClick && <span className="absolute right-3 top-1/2 -mt-4 text-3xl text-muted-foreground">›</span>}
    </div>
  );
}
