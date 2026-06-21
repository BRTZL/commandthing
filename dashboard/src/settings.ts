import { useEffect, useState } from "react";

/**
 * Small localStorage-backed settings store with a module-level singleton +
 * pub/sub (the pattern nocturne-ui uses). Survives reloads on the device.
 */
export interface Settings {
  /** Root font-size in px — the global UI scale. */
  uiScalePx: number;
  /** Seconds to advance synced lyrics (compensates device sampling/WS lag). */
  lyricOffsetSec: number;
}

const DEFAULTS: Settings = { uiScalePx: 18, lyricOffsetSec: 0.5 };
const KEY = "carthing.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return { ...DEFAULTS };
}

let current = load();
const subs = new Set<() => void>();

function getSettings(): Settings {
  return current;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  if (key === "uiScalePx") applyUiScale();
  for (const f of subs) f();
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

/** Apply the UI scale to the document root (overrides the index.css default). */
function applyUiScale(): void {
  try {
    document.documentElement.style.fontSize = `${current.uiScalePx}px`;
  } catch {
    /* SSR/no-document */
  }
}

/** React hook for live settings. */
export function useSettings(): Settings {
  const [s, setS] = useState(current);
  useEffect(() => subscribe(() => setS(getSettings())), []);
  return s;
}

applyUiScale();
