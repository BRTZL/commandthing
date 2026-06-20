import { useEffect, useState } from "react";

/**
 * Minimal hash router — robust on the device kiosk (no server, no history API
 * quirks). The Car Thing Back button (Esc) maps to goBack().
 */
export type Route = { name: "board" } | { name: "session"; id: string } | { name: "usage" };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h.indexOf("/session/") === 0)
    return { name: "session", id: decodeURIComponent(h.slice("/session/".length)) };
  if (h === "/usage") return { name: "usage" };
  return { name: "board" };
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

export function navigate(path: string): void {
  window.location.hash = path;
}

export function goBack(): void {
  // Two-level app: anything that isn't the board returns to the board.
  if (window.location.hash && window.location.hash !== "#/" && window.location.hash !== "") {
    navigate("/");
  }
}

export function isHome(): boolean {
  const h = window.location.hash.replace(/^#/, "");
  return h === "" || h === "/";
}
