import { useEffect, useRef, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { client } from "./client";
import { NotificationOverlay } from "./components/NotificationOverlay";
import { TopBar } from "./components/TopBar";
import { type DashboardState, emptyState } from "./dashboardTypes";
import { connectHardware, type HwAction } from "./hardware";
import { BoardPage } from "./pages/BoardPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SessionPage } from "./pages/SessionPage";
import { UsagePage } from "./pages/UsagePage";
import { goBack, goToTab, openSession, useRoute } from "./router";
import { tabByPreset } from "./tabs";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function App() {
  const [state, setState] = useState<DashboardState>(emptyState());
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(0);
  const route = useRoute();

  // Refs so the hardware/keyboard handlers (bound once) read live values.
  const routeRef = useRef(route);
  routeRef.current = route;
  const stateRef = useRef(state);
  stateRef.current = state;
  const selRef = useRef(selected);
  selRef.current = selected;

  useEffect(() => {
    const offState = client.onState(setState);
    const offStatus = client.onStatus(setConnected);
    return () => {
      offState();
      offStatus();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keep selection in range as the session list changes.
  useEffect(() => {
    setSelected((i) => clamp(i, 0, Math.max(0, state.sessions.length - 1)));
  }, [state.sessions.length]);

  const onAction = (a: HwAction) => {
    const r = routeRef.current;
    const onBoard = r.tab === "sessions" && !r.sessionId;
    if (a.type === "tab") {
      const t = tabByPreset(a.preset);
      if (t) goToTab(t.id);
    } else if (a.type === "back") {
      goBack();
    } else if (a.type === "dial") {
      if (onBoard) {
        const n = stateRef.current.sessions.length;
        setSelected((i) => clamp(i + a.dir, 0, Math.max(0, n - 1)));
      } else {
        document.querySelector(".dial-scroll")?.scrollBy({ top: a.dir * 96, behavior: "smooth" });
      }
    } else if (a.type === "select") {
      if (onBoard) {
        const s = stateRef.current.sessions[selRef.current];
        if (s) openSession(s.id);
      }
    }
    // "settings" reserved for later
  };

  // Inputs (bound once):
  //  - 8890 socket: preset buttons, dial press, back, settings
  //  - DOM wheel: the dial ROTATION (deltaX sign = direction)
  //  - keyboard: desktop-dev fallback
  useEffect(() => {
    const off = connectHardware(onAction);

    const onWheel = (e: WheelEvent) => {
      const r = routeRef.current;
      // On the board the dial moves the selection; elsewhere let it scroll.
      if (r.tab !== "sessions" || r.sessionId) return;
      const d = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (d === 0) return;
      e.preventDefault();
      onAction({ type: "dial", dir: d < 0 ? -1 : 1 });
    };
    window.addEventListener("wheel", onWheel, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "4") onAction({ type: "tab", preset: Number(e.key) });
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") onAction({ type: "dial", dir: -1 });
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") onAction({ type: "dial", dir: 1 });
      else if (e.key === "Enter") onAction({ type: "select" });
      else if (e.key === "Escape") onAction({ type: "back" });
    };
    window.addEventListener("keydown", onKey);

    return () => {
      off();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const board = (
    <BoardPage
      sessions={state.sessions}
      connected={connected}
      now={now}
      selected={selected}
      onOpen={openSession}
      onHover={setSelected}
    />
  );

  return (
    <div className="device">
      <TopBar state={state} connected={connected} now={now} route={route} />
      <div className="page">
        <Routes>
          <Route path="/" element={board} />
          <Route path="/usage" element={<UsagePage usage={state.usage} />} />
          <Route path="/calendar" element={<PlaceholderPage title="Calendar" subtitle="Coming soon" />} />
          <Route path="/more" element={<PlaceholderPage title="More" subtitle="Coming soon" />} />
          <Route path="/session/:id" element={<SessionRoute />} />
          <Route path="*" element={board} />
        </Routes>
      </div>
      <NotificationOverlay sessions={state.sessions} ready={state.generatedAt > 0} />
    </div>
  );
}

function SessionRoute() {
  const { id } = useParams();
  return id ? <SessionPage id={id} /> : null;
}
