import { useSyncExternalStore } from "react";

interface UiState {
  selectedSessionIndex: number;
}

let state: UiState = {
  selectedSessionIndex: 0,
};

const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

function setState(next: UiState): void {
  if (state.selectedSessionIndex === next.selectedSessionIndex) return;
  state = next;
  notify();
}

export function getSelectedSessionIndex(): number {
  return state.selectedSessionIndex;
}

export function setSelectedSessionIndex(selectedSessionIndex: number): void {
  setState({ selectedSessionIndex });
}

export function clampSelectedSession(maxIndex: number): void {
  setSelectedSessionIndex(Math.max(0, Math.min(state.selectedSessionIndex, maxIndex)));
}

export function moveSelectedSession(delta: number, maxIndex: number): void {
  setSelectedSessionIndex(Math.max(0, Math.min(state.selectedSessionIndex + delta, maxIndex)));
}

export function useSelectedSessionIndex(): number {
  return useSyncExternalStore(subscribe, getSelectedSessionIndex, getSelectedSessionIndex);
}
