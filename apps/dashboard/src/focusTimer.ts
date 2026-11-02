import { useSyncExternalStore } from "react";

/**
 * Pomodoro timer as a module-level singleton so it keeps running when you leave
 * the Focus tab (the page unmounts; the timer doesn't). Pub/sub for the view.
 */
export type FocusMode = "work" | "break" | "long";
const BREAK = 5 * 60;
const LONG = 15 * 60;
export const FOCUS_LABEL: Record<FocusMode, string> = {
  work: "Focus",
  break: "Break",
  long: "Long break",
};

export interface FocusState {
  workMin: number;
  mode: FocusMode;
  left: number;
  running: boolean;
  done: number;
  flash: boolean;
}

let state: FocusState = { workMin: 25, mode: "work", left: 25 * 60, running: false, done: 0, flash: false };
const subs = new Set<() => void>();
let interval: number | null = null;
let flashTimer: number | null = null;

function notify(): void {
  for (const f of subs) f();
}
function set(patch: Partial<FocusState>): void {
  state = { ...state, ...patch };
  notify();
}

function getFocus(): FocusState {
  return state;
}
export function focusTotal(s: FocusState): number {
  return s.mode === "work" ? s.workMin * 60 : s.mode === "break" ? BREAK : LONG;
}

function triggerFlash(): void {
  if (flashTimer != null) window.clearTimeout(flashTimer);
  set({ flash: true });
  flashTimer = window.setTimeout(() => set({ flash: false }), 1200);
}

function tick(): void {
  if (state.left > 1) {
    set({ left: state.left - 1 });
    return;
  }
  // phase complete → flash, advance, and pause for the next phase
  triggerFlash();
  stopInterval();
  if (state.mode === "work") {
    const done = state.done + 1;
    const next: FocusMode = done % 4 === 0 ? "long" : "break";
    set({ done, mode: next, left: next === "long" ? LONG : BREAK, running: false });
  } else {
    set({ mode: "work", left: state.workMin * 60, running: false });
  }
}

function startInterval(): void {
  if (interval == null) interval = window.setInterval(tick, 1000);
}
function stopInterval(): void {
  if (interval != null) {
    window.clearInterval(interval);
    interval = null;
  }
}

export function toggleRunning(): void {
  const running = !state.running;
  set({ running });
  if (running) startInterval();
  else stopInterval();
}
export function adjustMinutes(dir: number): void {
  if (state.running) return;
  const workMin = Math.max(5, Math.min(60, state.workMin + dir));
  set({ workMin, left: state.mode === "work" ? workMin * 60 : state.left });
}
export function resetFocus(): void {
  stopInterval();
  set({ running: false, mode: "work", done: 0, left: state.workMin * 60, flash: false });
}

export function useFocus(): FocusState {
  return useSyncExternalStore(subscribeFocus, getFocus, getFocus);
}

function subscribeFocus(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
