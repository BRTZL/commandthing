import type { UsageLine, UsageProvider, UsageSummary } from "../dashboardTypes";

export function UsagePage({ usage }: { usage: UsageSummary | null }) {
  if (!usage) {
    return (
      <div className="p-6">
        <div className="text-muted text-[17px] text-center py-10">Loading usage…</div>
      </div>
    );
  }
  if (usage.error && usage.providers.length === 0) {
    return (
      <div className="p-6">
        <div className="text-muted text-[17px] text-center py-10">
          Usage unavailable
          <br />
          <small>{usage.error}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col min-h-0 p-[14px]">
      <div className="flex-none flex items-baseline mb-3">
        <span className="text-[30px] font-bold tabular-nums">{usage.todayLabel}</span>
        <span className="ml-[14px] text-[15px] text-muted">across {usage.providers.length} providers</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-3 content-start [&::-webkit-scrollbar]:w-0 dial-scroll">
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
    <section className="bg-card border border-border rounded-[14px] px-[15px] py-[13px]">
      <div className="flex items-baseline justify-between mb-[11px]">
        <span className="text-[17px] font-bold">{p.displayName}</span>
        {p.plan && <span className="text-[13px] text-muted">{p.plan}</span>}
      </div>

      <div>
        {progress.map((l) => (
          <ProgressLine key={l.label} l={l} />
        ))}
      </div>

      {texts.length > 0 && (
        <div className="mt-2 border-t border-border pt-[9px]">
          {texts.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between py-[3px]">
              <span className="text-[13px] text-muted">{l.label}</span>
              <span className="text-[14px] tabular-nums">{l.value ?? "—"}</span>
            </div>
          ))}
        </div>
      )}

      {chart?.points && chart.points.length > 0 && (
        <BarChart points={chart.points} color={chart.color ?? "#7aa2f7"} />
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
    <div className="mb-[11px]">
      <div className="flex items-baseline justify-between mb-[5px]">
        <span className="text-[14px] text-[#c8cdda]">{l.label}</span>
        <span className="text-[13px] text-muted tabular-nums">{fmtProgress(l)}</span>
      </div>
      <div className="h-2 bg-card-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${hot ? "bg-waiting" : "bg-accent"}`}
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
    <div className="flex items-end h-[78px] mt-[11px] border-t border-border pt-[9px]">
      {recent.map((pt, i) => (
        <div
          key={pt.label}
          className="flex-1 flex flex-col justify-end items-center h-full"
          title={`${pt.label}: ${pt.valueLabel}`}
        >
          <div
            className="w-[62%] rounded-t-[2px] min-h-[3px]"
            style={{ height: `${Math.max(3, (pt.value / max) * 100)}%`, background: color }}
          />
          {i % 4 === 0 && <span className="text-[9px] text-muted mt-[3px]">{pt.label}</span>}
        </div>
      ))}
    </div>
  );
}
