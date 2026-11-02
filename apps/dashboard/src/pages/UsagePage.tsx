import { useEffect, useState } from "react";
import type { UsageLine, UsageProvider } from "../dashboardTypes";
import { cn } from "../lib/cn";
import { useUsage } from "../store/dashboardStore";

export function UsagePage() {
  const usage = useUsage();
  const now = useServerClock(usage?.fetchedAt);
  if (!usage) {
    return (
      <div className="p-6">
        <div className="py-10 text-center text-lg text-muted-foreground">Loading usage…</div>
      </div>
    );
  }
  if (usage.error && usage.providers.length === 0) {
    return (
      <div className="p-6">
        <div className="py-10 text-center text-lg text-muted-foreground">
          Usage unavailable
          <br />
          <small>{usage.error}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col min-h-0 pl-3.5 pr-10 pb-3.5 pt-[4.5rem]">
      <div className="mb-4 flex flex-none items-end px-1">
        <span className="text-[4.5rem] font-bold leading-none tabular-nums">
          {usage.todayTotalUsd != null ? `$${usage.todayTotalUsd.toFixed(2)}` : "—"}
        </span>
        <span className="mb-1.5 ml-4 text-2xl font-semibold">today</span>
        <span className="mb-2 ml-3 text-base text-muted-foreground">
          across {usage.providers.length} providers
        </span>
      </div>
      <div className="dial-scroll min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-0">
        <LimitsOverview providers={usage.providers} />
        {usage.providers.map((p) => (
          <ProviderCard key={p.providerId} p={p} now={now} />
        ))}
      </div>
    </div>
  );
}

function useServerClock(serverNow?: number): number {
  const [now, setNow] = useState(() => serverNow ?? Date.now());

  useEffect(() => {
    // Car Thing's wall clock can be years out of date. Anchor relative times to
    // the feeder clock, then advance that value without consulting Date.now().
    if (serverNow != null) setNow(serverNow);
    const timer = window.setInterval(() => setNow((current) => current + 30_000), 30_000);
    return () => window.clearInterval(timer);
  }, [serverNow]);

  return now;
}

function summaryLines(provider: UsageProvider): UsageLine[] {
  const progress = provider.lines.filter(
    (line) =>
      line.type === "progress" && (line.limit ?? 0) > 0 && !line.label.toLowerCase().includes("extra usage"),
  );
  const percentages = progress.filter((line) => line.format?.kind === "percent");
  return (percentages.length > 0 ? percentages : progress).slice(0, 2);
}

function remainingLabel(line: UsageLine): string {
  const used = line.used ?? 0;
  const limit = line.limit ?? 0;
  if (limit <= 0) return "—";
  const remaining = Math.max(0, limit - used);
  if (line.format?.kind === "percent") return `${Math.round((remaining / limit) * 100)}%`;
  if (line.format?.kind === "dollars") {
    return `$${remaining.toFixed(remaining < 10 && remaining % 1 !== 0 ? 1 : 0)}`;
  }
  return `${Math.round(remaining)}${line.format?.suffix ? ` ${line.format.suffix}` : ""}`;
}

function LimitsOverview({ providers }: { providers: UsageProvider[] }) {
  const summaries: { provider: UsageProvider; lines: UsageLine[] }[] = [];
  for (const provider of providers) {
    const lines = summaryLines(provider);
    if (lines.length > 0) summaries.push({ provider, lines });
  }

  if (summaries.length === 0) return null;

  return (
    <section className="border-t border-border px-1 py-3">
      <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Limits left
      </div>
      <div className="flex">
        {summaries.map(({ provider, lines }, index) => (
          <div
            key={provider.providerId}
            className={cn("flex min-w-0 flex-1 items-center", index > 0 && "border-l border-border pl-4")}
          >
            <ProviderMark providerId={provider.providerId} name={provider.displayName} />
            <div className="ml-3 min-w-0">
              <div className="truncate text-base font-semibold text-foreground">{provider.displayName}</div>
              <div className="mt-0.5 flex items-baseline">
                {lines.map((line, lineIndex) => (
                  <div key={line.label} className={cn("min-w-0", lineIndex > 0 && "ml-4")}>
                    <div className="text-4xl font-bold leading-none tabular-nums text-foreground">
                      {remainingLabel(line)}
                    </div>
                    <div className="mt-1.5 truncate text-xs uppercase leading-none tracking-wide text-muted-foreground">
                      {line.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderMark({ providerId, name }: { providerId: string; name: string }) {
  const iconPath =
    providerId === "claude"
      ? "/icons/claude.svg"
      : providerId === "codex"
        ? "/icons/openai.svg"
        : providerId === "opencode"
          ? "/icons/opencode.svg"
          : null;
  if (iconPath) {
    return <img src={iconPath} alt="" aria-hidden="true" className="h-8 w-8 flex-none opacity-90" />;
  }

  const initials = name.slice(0, 2);
  return (
    <div
      role="img"
      aria-label={name}
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-primary/40 text-[10px] font-bold uppercase text-primary"
    >
      {initials.toUpperCase()}
    </div>
  );
}

function ProviderCard({ p, now }: { p: UsageProvider; now: number }) {
  const progress = p.lines.filter((l) => l.type === "progress");
  const texts = p.lines.filter((l) => l.type === "text");
  const chart = p.lines.find((l) => l.type === "barChart");
  return (
    <section className="border-t border-border px-1 py-3">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xl font-bold">{p.displayName}</span>
        {p.plan && <span className="text-sm text-muted-foreground">{p.plan}</span>}
      </div>

      <div>
        {progress.map((l) => (
          <ProgressLine key={l.label} l={l} now={now} />
        ))}
      </div>

      {texts.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          {texts.map((l) => (
            <div key={l.label} className="py-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{l.label}</span>
                <span className="ml-3 text-right text-base tabular-nums">{l.value ?? "—"}</span>
              </div>
              {l.resetsAt && (
                <div className="mt-0.5 text-right text-xs text-muted-foreground tabular-nums">
                  {formatResetTime(l.resetsAt, now)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {chart?.points && chart.points.length > 0 && (
        <BarChart points={chart.points} color={chart.color ?? "hsl(var(--primary))"} />
      )}
    </section>
  );
}

function fmtProgress(l: UsageLine): string {
  const kind = l.format?.kind;
  const used = l.used ?? 0;
  const limit = l.limit ?? 0;
  if (kind === "dollars") return `$${used.toFixed(2)} / $${limit.toFixed(0)}`;
  if (kind === "count") return `${used} / ${limit}${l.format?.suffix ? ` ${l.format.suffix}` : ""}`;
  return `${Math.round(used)}%`;
}

function formatResetTime(resetsAt: string, now: number): string {
  const resetTime = parseIsoTimestamp(resetsAt);
  if (!Number.isFinite(resetTime)) return "Reset time unavailable";

  const remainingMinutes = Math.max(0, Math.ceil((resetTime - now) / 60_000));
  if (remainingMinutes < 1) return "Resets now";

  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  if (days > 0) return `Resets in ${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  if (hours > 0) return `Resets in ${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return `Resets in ${minutes}m`;
}

/** Parse the API's ISO-8601 UTC timestamps without relying on Chromium 69's date parser. */
function parseIsoTimestamp(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (!match) return Number.NaN;
  const milliseconds = Number(`${match[7] ?? ""}000`.slice(0, 3));
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    milliseconds,
  );
}

function ProgressLine({ l, now }: { l: UsageLine; now: number }) {
  const used = l.used ?? 0;
  const limit = l.limit ?? 0;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : Math.min(100, used);
  const hot = pct >= 80;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-base text-foreground">{l.label}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{fmtProgress(l)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full", hot ? "bg-waiting" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {l.resetsAt && (
        <div className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
          {formatResetTime(l.resetsAt, now)}
        </div>
      )}
    </div>
  );
}

function BarChart({
  points,
  color,
}: {
  points: { label: string; value: number; valueLabel: string }[];
  color: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const chartHeight = 46;
  const first = points[0];
  const middle = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];
  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">Usage trend</span>
        <span className="ml-3 truncate text-xs text-muted-foreground tabular-nums">
          {last.valueLabel} latest
        </span>
      </div>
      <div className="flex items-end space-x-0.5" style={{ height: `${chartHeight}px` }}>
        {points.map((pt) => {
          const height = pt.value > 0 ? Math.max(2, Math.round((pt.value / max) * chartHeight)) : 1;
          return (
            <div
              key={pt.label}
              className="flex h-full min-w-0 flex-1 items-end"
              title={`${pt.label}: ${pt.valueLabel}`}
            >
              <div
                className="w-full rounded-t-sm opacity-90"
                style={{ height: `${height}px`, background: color }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{first.label}</span>
        <span>{middle.label}</span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}
