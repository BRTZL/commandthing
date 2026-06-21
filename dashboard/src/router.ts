import { useLocation } from "react-router-dom";
import { TABS, type TabId } from "./tabs";

/**
 * Routing helpers over react-router's HashRouter.
 *
 * useRoute() derives the active tab + open session from the current location.
 * The imperative helpers set the URL hash directly — HashRouter listens to
 * hashchange, so they work from anywhere (incl. the non-React hardware handler
 * in App.tsx) without needing the useNavigate hook.
 */
export interface Route {
  tab: TabId;
  sessionId: string | null;
}

function parse(pathname: string): Route {
  if (pathname.indexOf("/session/") === 0) {
    return { tab: "sessions", sessionId: decodeURIComponent(pathname.slice("/session/".length)) };
  }
  for (const t of TABS) {
    if (pathname === `/${t.id}`) return { tab: t.id, sessionId: null };
  }
  return { tab: "sessions", sessionId: null };
}

export function useRoute(): Route {
  return parse(useLocation().pathname);
}

export function goToTab(id: TabId): void {
  window.location.hash = id === "sessions" ? "/" : `/${id}`;
}

export function openSession(id: string): void {
  window.location.hash = `/session/${encodeURIComponent(id)}`;
}

export function goToSettings(): void {
  window.location.hash = "/settings";
}

/** Is the current path a standalone page (no tab header)? */
export function isStandalone(pathname: string): boolean {
  return pathname.indexOf("/session/") === 0 || pathname === "/settings";
}

/** Back: from a standalone page (session detail / settings) return to wherever
    you came from; from a non-board tab, go to the board. */
export function goBack(): void {
  const path = window.location.hash.replace(/^#/, "");
  if (isStandalone(path)) {
    window.history.back();
    return;
  }
  const r = parse(path);
  if (r.tab !== "sessions") window.location.hash = "/";
}
