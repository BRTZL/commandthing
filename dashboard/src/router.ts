import { useEffect, useState } from "react";
import { TABS, type TabId } from "./tabs";

/**
 * Hash router. A route is the active tab plus an optional open session (which
 * lives under the Sessions tab). Robust on the kiosk; the Back button maps to
 * goBack().
 */
export interface Route {
  tab: TabId;
  sessionId: string | null;
}

function parse(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h.indexOf("/session/") === 0) {
    return { tab: "sessions", sessionId: decodeURIComponent(h.slice("/session/".length)) };
  }
  for (const t of TABS) {
    if (h === `/${t.id}`) return { tab: t.id, sessionId: null };
  }
  return { tab: "sessions", sessionId: null };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function goToTab(id: TabId): void {
  window.location.hash = id === "sessions" ? "/" : `/${id}`;
}

export function openSession(id: string): void {
  window.location.hash = `/session/${encodeURIComponent(id)}`;
}

/** Back button: detail → sessions board; any other tab → sessions board. */
export function goBack(): void {
  const r = parse(window.location.hash);
  if (r.sessionId || r.tab !== "sessions") window.location.hash = "/";
}
