export function relativeTime(epochMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 10) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function clockTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${m < 10 ? `0${m}` : m} ${ampm}`;
}

export function clockDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function eventTime(epochMs: number): string {
  return clockTime(new Date(epochMs));
}

/** claude-opus-4-8 → "opus-4-8"; claude-haiku-4-5-20251001 → "haiku-4-5". */
export function shortModel(model: string | null): string | null {
  if (!model) return null;
  return model.replace(/^claude-/, "").replace(/-\d{6,}$/, "");
}

export function clockSeconds(d: Date): string {
  const s = d.getSeconds();
  return s < 10 ? `0${s}` : String(s);
}
