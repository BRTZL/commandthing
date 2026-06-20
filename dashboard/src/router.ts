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

/** Back button: detail → board; any other tab → board. */
export function goBack(): void {
  const r = parse(window.location.hash.replace(/^#/, ""));
  if (r.sessionId || r.tab !== "sessions") window.location.hash = "/";
}
