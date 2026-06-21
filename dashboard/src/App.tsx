import { type WheelEvent, useCallback, useEffect, useRef } from "react";
import { Outlet, Route, Routes, useParams } from "react-router-dom";
import { client } from "./client";
import { NotificationOverlay } from "./components/NotificationOverlay";
import { TopBar } from "./components/TopBar";
import { adjustMinutes, toggleRunning } from "./focusTimer";
import { connectHardware, type HwAction } from "./hardware";
import { BoardPage } from "./pages/BoardPage";
import { FocusPage } from "./pages/FocusPage";
import { MusicPage } from "./pages/MusicPage";
import { SessionPage } from "./pages/SessionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsagePage } from "./pages/UsagePage";
import { goBack, goToSettings, goToTab, openSession, useRoute } from "./router";
import { getDashboardState } from "./store/dashboardStore";
import { getSelectedSessionIndex, moveSelectedSession } from "./store/uiStore";
import { tabByPreset } from "./tabs";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function App() {
  const route = useRoute();

  // Ref so the hardware/keyboard handlers (bound once) read the live route.
  const routeRef = useRef(route);
  routeRef.current = route;

  const onAction = useCallback((a: HwAction) => {
    const r = routeRef.current;
    const tab = r.tab;
    const onBoard = tab === "sessions" && !r.sessionId;
    if (a.type === "tab") {
      const t = tabByPreset(a.preset);
      if (t) goToTab(t.id);
    } else if (a.type === "back") {
      goBack();
    } else if (a.type === "dial") {
      if (onBoard) {
        const max = Math.max(0, getDashboardState().sessions.length - 1);
        moveSelectedSession(a.dir, max);
      } else if (tab === "music") {
        const v = getDashboardState().nowPlaying?.volume ?? 50;
        void client.request("media.control", { action: "volume", value: clamp(v + a.dir * 5, 0, 100) });
      } else if (tab === "focus") {
        adjustMinutes(a.dir);
      } else {
        document.querySelector(".dial-scroll")?.scrollBy({ top: a.dir * 96, behavior: "smooth" });
      }
    } else if (a.type === "select") {
      if (onBoard) {
        const s = getDashboardState().sessions[getSelectedSessionIndex()];
        if (s) openSession(s.id);
      } else if (tab === "music") {
        void client.request("media.control", { action: "playpause" });
      } else if (tab === "focus") {
        toggleRunning();
      }
    } else if (a.type === "settings") {
      goToSettings();
    }
  }, []);

  const onWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      // The dial rotation arrives as a wheel event; onAction routes it per tab
      // (board selection / music volume / focus minutes / else scroll).
      const d = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (d === 0) return;
      e.preventDefault();
      onAction({ type: "dial", dir: d < 0 ? -1 : 1 });
    },
    [onAction],
  );

  // Inputs (bound once):
  //  - 8890 socket: preset buttons, dial press, back, settings
  //  - keyboard: desktop-dev fallback
  useEffect(() => {
    const off = connectHardware(onAction);

    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "4") onAction({ type: "tab", preset: Number(e.key) });
      else if (e.key === "5") onAction({ type: "settings" });
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") onAction({ type: "dial", dir: -1 });
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") onAction({ type: "dial", dir: 1 });
      else if (e.key === "Enter") onAction({ type: "select" });
      else if (e.key === "Escape") onAction({ type: "back" });
    };
    window.addEventListener("keydown", onKey);

    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, [onAction]);

  return (
    <div
      onWheel={onWheel}
      className="relative mx-auto flex h-device w-device flex-col overflow-hidden bg-background"
    >
      <Routes>
        {/* The four tabs share the header (TabLayout). */}
        <Route element={<TabLayout />}>
          <Route path="/" element={<BoardPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="*" element={<BoardPage />} />
        </Route>
        {/* Standalone (no header) — Back returns to where you came from. */}
        <Route path="/session/:id" element={<SessionRoute />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <NotificationOverlay />
    </div>
  );
}

/** Shared chrome for the four tab pages: the absolute header over the page,
    which fills the full height behind it. */
function TabLayout() {
  const route = useRoute();
  return (
    <>
      <TopBar route={route} />
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </>
  );
}

function SessionRoute() {
  const { id } = useParams();
  return id ? <SessionPage id={id} /> : null;
}
