import { useSyncExternalStore } from "react";
import { client } from "../client";
import {
  type AgentSession,
  type DashboardState,
  emptyState,
  type NowPlaying,
  type UsageLine,
  type UsageProvider,
  type UsageSummary,
} from "../dashboardTypes";

interface DashboardSnapshot {
  state: DashboardState;
  connected: boolean;
}

let snapshot: DashboardSnapshot = {
  state: emptyState(),
  connected: false,
};

const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

function subscribeDashboardStore(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

function setSnapshot(next: DashboardSnapshot): void {
  if (Object.is(snapshot, next)) return;
  snapshot = next;
  notify();
}

function setDashboardState(nextState: DashboardState): void {
  setSnapshot({
    ...snapshot,
    state: reconcileDashboardState(snapshot.state, nextState),
  });
}

function setConnected(connected: boolean): void {
  if (snapshot.connected === connected) return;
  setSnapshot({ ...snapshot, connected });
}

export function getDashboardState(): DashboardState {
  return snapshot.state;
}

export function useSessions(): AgentSession[] {
  return useSyncExternalStore(
    subscribeDashboardStore,
    () => snapshot.state.sessions,
    () => snapshot.state.sessions,
  );
}

export function useSessionsError(): string | null {
  return useSyncExternalStore(
    subscribeDashboardStore,
    () => snapshot.state.sessionsError,
    () => snapshot.state.sessionsError,
  );
}

export function useUsage(): UsageSummary | null {
  return useSyncExternalStore(
    subscribeDashboardStore,
    () => snapshot.state.usage,
    () => snapshot.state.usage,
  );
}

export function useNowPlaying(): NowPlaying | null {
  return useSyncExternalStore(
    subscribeDashboardStore,
    () => snapshot.state.nowPlaying,
    () => snapshot.state.nowPlaying,
  );
}

export function useHost(): string {
  return useSyncExternalStore(
    subscribeDashboardStore,
    () => snapshot.state.host,
    () => snapshot.state.host,
  );
}

export function useReady(): boolean {
  return useSyncExternalStore(
    subscribeDashboardStore,
    () => snapshot.state.generatedAt > 0,
    () => snapshot.state.generatedAt > 0,
  );
}

export function useConnected(): boolean {
  return useSyncExternalStore(
    subscribeDashboardStore,
    () => snapshot.connected,
    () => snapshot.connected,
  );
}

function reconcileDashboardState(prev: DashboardState, next: DashboardState): DashboardState {
  const sessions = sameSessions(prev.sessions, next.sessions) ? prev.sessions : next.sessions;
  const usage = sameUsage(prev.usage, next.usage) ? prev.usage : next.usage;
  const nowPlaying = sameNowPlaying(prev.nowPlaying, next.nowPlaying) ? prev.nowPlaying : next.nowPlaying;

  if (
    prev.generatedAt === next.generatedAt &&
    prev.host === next.host &&
    Object.is(prev.sessions, sessions) &&
    prev.sessionsError === next.sessionsError &&
    Object.is(prev.usage, usage) &&
    Object.is(prev.nowPlaying, nowPlaying)
  ) {
    return prev;
  }

  return {
    generatedAt: next.generatedAt,
    host: next.host,
    sessions,
    sessionsError: next.sessionsError,
    usage,
    nowPlaying,
  };
}

function sameSessions(a: AgentSession[], b: AgentSession[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!sameSession(a[i], b[i])) return false;
  }
  return true;
}

function sameSession(a: AgentSession, b: AgentSession): boolean {
  return (
    a.id === b.id &&
    a.project === b.project &&
    a.projectPath === b.projectPath &&
    a.title === b.title &&
    a.model === b.model &&
    a.gitBranch === b.gitBranch &&
    a.lastActivity === b.lastActivity &&
    a.state === b.state &&
    a.statusLabel === b.statusLabel &&
    a.needsInput === b.needsInput &&
    a.lastPrompt === b.lastPrompt &&
    a.permissionMode === b.permissionMode &&
    a.subagentCount === b.subagentCount
  );
}

function sameUsage(a: UsageSummary | null, b: UsageSummary | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.todayTotalUsd === b.todayTotalUsd &&
    a.todayLabel === b.todayLabel &&
    a.fetchedAt === b.fetchedAt &&
    a.error === b.error &&
    sameUsageProviders(a.providers, b.providers)
  );
}

function sameUsageProviders(a: UsageProvider[], b: UsageProvider[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].providerId !== b[i].providerId ||
      a[i].displayName !== b[i].displayName ||
      a[i].plan !== b[i].plan ||
      a[i].fetchedAt !== b[i].fetchedAt ||
      !sameUsageLines(a[i].lines, b[i].lines)
    ) {
      return false;
    }
  }
  return true;
}

function sameUsageLines(a: UsageLine[], b: UsageLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!sameUsageLine(a[i], b[i])) return false;
  }
  return true;
}

function sameUsageLine(a: UsageLine, b: UsageLine): boolean {
  return (
    a.type === b.type &&
    a.label === b.label &&
    a.used === b.used &&
    a.limit === b.limit &&
    a.resetsAt === b.resetsAt &&
    a.periodDurationMs === b.periodDurationMs &&
    a.color === b.color &&
    a.value === b.value &&
    a.subtitle === b.subtitle &&
    a.note === b.note &&
    a.format?.kind === b.format?.kind &&
    a.format?.suffix === b.format?.suffix &&
    sameUsagePoints(a.points, b.points)
  );
}

function sameUsagePoints(a: UsageLine["points"], b: UsageLine["points"]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label || a[i].value !== b[i].value || a[i].valueLabel !== b[i].valueLabel) {
      return false;
    }
  }
  return true;
}

function sameNowPlaying(a: NowPlaying | null, b: NowPlaying | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.source === b.source &&
    a.state === b.state &&
    a.title === b.title &&
    a.artist === b.artist &&
    a.album === b.album &&
    a.trackId === b.trackId &&
    a.durationSec === b.durationSec &&
    a.positionSec === b.positionSec &&
    a.volume === b.volume &&
    a.artworkUrl === b.artworkUrl &&
    a.lyricsLoaded === b.lyricsLoaded &&
    sameLyrics(a.lyrics, b.lyrics)
  );
}

function sameLyrics(a: NowPlaying["lyrics"], b: NowPlaying["lyrics"]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].t !== b[i].t || a[i].text !== b[i].text) return false;
  }
  return true;
}

client.onState(setDashboardState);
client.onStatus(setConnected);
