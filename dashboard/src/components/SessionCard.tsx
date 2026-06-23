import type { ClaudeSession } from "../dashboardTypes";
import { relativeTime, shortModel } from "../format";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

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
    <Button
      variant="ghost"
      data-state={session.state}
      data-selected={selected ? "true" : undefined}
      data-needs={session.needsInput ? "true" : undefined}
      onClick={onClick}
      className="group repaint-isolate relative mb-3 h-auto w-full cursor-pointer justify-start overflow-hidden rounded-xl border-2 border-border bg-secondary py-3 pl-4 pr-7 text-left text-foreground hover:bg-secondary data-[needs=true]:border-waiting data-[selected=true]:border-primary data-[selected=true]:bg-accent"
    >
      <span className="absolute bottom-0 left-0 top-0 w-1.5 bg-idle group-data-[state=working]:bg-working group-data-[state=waiting]:bg-waiting group-data-[state=done]:bg-done" />
      <div>
        <div className="flex items-center">
          <span className="text-2xl font-bold text-foreground">{session.project}</span>
          {session.gitBranch && session.gitBranch !== "HEAD" && (
            <Badge
              variant="outline"
              className="ml-2.5 border-transparent bg-primary/15 font-mono text-sm font-normal text-primary"
            >
              {session.gitBranch}
            </Badge>
          )}
          {session.needsInput ? (
            <Badge variant="waiting" className="ml-auto rounded-full uppercase tracking-wide">
              needs you
            </Badge>
          ) : (
            session.state === "done" && (
              <Badge variant="done" className="ml-auto rounded-full uppercase tracking-wide">
                your turn
              </Badge>
            )
          )}
        </div>
        <div className="mt-1.5 truncate text-base text-foreground/80">
          {session.title ?? session.lastPrompt ?? "(untitled session)"}
        </div>
        <div className="mt-2.5 flex items-center text-sm text-muted-foreground">
          <span className="mr-2 h-2 w-2 rounded-full bg-idle group-data-[state=working]:bg-working group-data-[state=waiting]:bg-waiting group-data-[state=done]:bg-done" />
          <span className="capitalize">{session.state === "done" ? "your turn" : session.state}</span>
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
    </Button>
  );
}
