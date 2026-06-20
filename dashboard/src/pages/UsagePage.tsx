import type { UsageLine, UsageProvider, UsageSummary } from "../dashboardTypes";
import { cn } from "../lib/cn";

export function UsagePage({ usage }: { usage: UsageSummary | null }) {
  if (!usage) {
    return (
      <div className="p-6">
        <div className="py-10 text-center text-lg text-muted">Loading usage…</div>
      </div>
    );
  }
  if (usage.error && usage.providers.length === 0) {
    return (
      <div className="p-6">
        <div className="py-10 text-center text-lg text-muted">
          Usage unavailable
          <br />
          <small>{usage.error}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col min-h-0 p-3.5">
      <div className="mb-3 flex flex-none items-baseline">
        <span className="text-3xl font-bold tabular-nums">{usage.todayLabel}</span>
        <span className="ml-3.5 text-base text-muted">across {usage.providers.length} providers</span>
      </div>
      <div className="dial-scroll grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto [&::-webkit-scrollbar]:w-0">
        {usage.providers.map((p) => (
          <ProviderCard key={p.providerId} p={p} />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({ p }: { p: UsageProvider }) {
  const progress = p.lines.filter((l) => l.type === "progress");
  const texts = p.lines.filter((l) => l.type === "text");
  const chart = p.lines.find((l) => l.type === "barChart");
  return (
    <section className="rounded-xl border border-border bg-card px-3.75 py-3.25">
      <div className="mb-2.75 flex items-baseline justify-between">
        <span className="text-lg font-bold">{p.displayName}</span>
        {p.plan && <span className="text-sm text-muted">{p.plan}</span>}
      </div>

      <div>
        {progress.map((l) => (
          <ProgressLine key={l.label} l={l} />
        ))}
      </div>

      {texts.length > 0 && (
        <div className="mt-2 border-t border-border pt-2.25">
          {texts.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between py-0.75">
              <span className="text-sm text-muted">{l.label}</span>
              <span className="text-base tabular-nums">{l.value ?? "—"}</span>
            </div>
          ))}
        </div>
      )}

      {chart?.points && chart.points.length > 0 && (
        <BarChart points={chart.points} color={chart.color ?? "hsl(var(--accent))"} />
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

function ProgressLine({ l }: { l: UsageLine }) {
  const used = l.used ?? 0;
  const limit = l.limit ?? 0;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : Math.min(100, used);
  const hot = pct >= 80;
  return (
    <div className="mb-2.75">
      <div className="mb-1.25 flex items-baseline justify-between">
        <span className="text-base text-foreground-dim">{l.label}</span>
        <span className="text-sm text-muted tabular-nums">{fmtProgress(l)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-card-2">
        <div
          className={cn("h-full rounded-full", hot ? "bg-waiting" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
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
  const recent = points.slice(-20);
  const max = Math.max(...recent.map((p) => p.value), 1);
  return (
    <div className="mt-2.75 flex h-19.5 items-end border-t border-border pt-2.25">
      {recent.map((pt, i) => (
        <div
          key={pt.label}
          className="flex h-full flex-1 flex-col items-center justify-end"
          title={`${pt.label}: ${pt.valueLabel}`}
        >
          <div
            className="w-3/5 min-h-0.75 rounded-t-sm"
            style={{ height: `${Math.max(3, (pt.value / max) * 100)}%`, background: color }}
          />
          {i % 4 === 0 && <span className="mt-0.75 text-2xs text-muted">{pt.label}</span>}
        </div>
      ))}
    </div>
  );
}
