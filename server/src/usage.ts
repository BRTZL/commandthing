/**
 * Polls the local Open Usage API (http://localhost:6736/v1/usage) which reports
 * spend/usage across every AI provider on the machine, and caches a summary.
 *
 * The feeder (on the Mac) can reach localhost:6736; the device cannot, which is
 * exactly why usage is gathered here and broadcast over the WebSocket.
 */

import type { UsageProvider, UsageSummary } from "../../shared/protocol.ts";

const USAGE_URL = process.env.OPEN_USAGE_URL?.trim() || "http://localhost:6736/v1/usage";
const REFRESH_MS = Number(process.env.USAGE_REFRESH_MS ?? 30_000);

let cache: UsageSummary | null = null;

export function getUsage(): UsageSummary | null {
  return cache;
}

/** Sums each provider's "Today" dollar figure (value like "$34.32 · 31M tokens"). */
function parseTodayTotalUsd(providers: UsageProvider[]): number | null {
  let total: number | null = null;
  for (const p of providers) {
    for (const line of p.lines ?? []) {
      if (line.label === "Today" && typeof line.value === "string") {
        const m = line.value.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
        if (m) total = (total ?? 0) + Number.parseFloat(m[1]);
      }
    }
  }
  return total;
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch(USAGE_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const providers = (await res.json()) as UsageProvider[];
    const todayTotalUsd = parseTodayTotalUsd(providers);
    cache = {
      todayTotalUsd,
      todayLabel: todayTotalUsd != null ? `$${todayTotalUsd.toFixed(2)} today` : "usage",
      providers,
      fetchedAt: Date.now(),
      error: null,
    };
  } catch (e: any) {
    const error = String(e?.message ?? e);
    cache = cache
      ? { ...cache, error }
      : { todayTotalUsd: null, todayLabel: "usage n/a", providers: [], fetchedAt: Date.now(), error };
    console.error("[usage] refresh failed:", error);
  }
}

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
console.log(`[usage] polling ${USAGE_URL} every ${REFRESH_MS / 1000}s`);
