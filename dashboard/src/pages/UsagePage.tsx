import type { UsageLine, UsageProvider, UsageSummary } from "../dashboardTypes";

export function UsagePage({ usage, now: _now }: { usage: UsageSummary | null; now: number }) {
  if (!usage) {
    return (
      <div className="page-pad">
        <div className="empty">Loading usage…</div>
      </div>
    );
  }
  if (usage.error && usage.providers.length === 0) {
    return (
      <div className="page-pad">
        <div className="empty">
          Usage unavailable
          <br />
          <small>{usage.error}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="usage-page">
      <div className="usage-summary">
        <span className="usage-today">{usage.todayLabel}</span>
        <span className="usage-sub">across {usage.providers.length} providers</span>
      </div>
      <div className="usage-providers">
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
    <section className="prov-card">
      <div className="prov-head">
        <span className="prov-name">{p.displayName}</span>
        {p.plan && <span className="prov-plan">{p.plan}</span>}
      </div>

      <div className="prov-bars">
        {progress.map((l) => (
          <ProgressLine key={l.label} l={l} />
        ))}
      </div>

      {texts.length > 0 && (
        <div className="prov-texts">
          {texts.map((l) => (
            <div key={l.label} className="prov-text">
              <span className="pt-label">{l.label}</span>
              <span className="pt-value">{l.value ?? "—"}</span>
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
    <div className="pl">
      <div className="pl-top">
        <span className="pl-label">{l.label}</span>
        <span className="pl-val">{fmtProgress(l)}</span>
      </div>
      <div className="pl-track">
        <div className={`pl-fill ${hot ? "hot" : ""}`} style={{ width: `${pct}%` }} />
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
    <div className="barchart">
      {recent.map((pt, i) => (
        <div key={pt.label} className="bc-col" title={`${pt.label}: ${pt.valueLabel}`}>
          <div
            className="bc-bar"
            style={{ height: `${Math.max(3, (pt.value / max) * 100)}%`, background: color }}
          />
          {i % 4 === 0 && <span className="bc-label">{pt.label}</span>}
        </div>
      ))}
    </div>
  );
}
