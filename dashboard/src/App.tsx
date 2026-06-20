import { useEffect, useState } from "react";
import { client } from "./client";
import { NotificationOverlay } from "./components/NotificationOverlay";
import { TopBar } from "./components/TopBar";
import { type DashboardState, emptyState } from "./dashboardTypes";
import { BoardPage } from "./pages/BoardPage";
import { SessionPage } from "./pages/SessionPage";
import { UsagePage } from "./pages/UsagePage";
import { goBack, useRoute } from "./router";

export function App() {
  const [state, setState] = useState<DashboardState>(emptyState());
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const route = useRoute();

  useEffect(() => {
    const offState = client.onState(setState);
    const offStatus = client.onStatus(setConnected);
    return () => {
      offState();
      offStatus();
    };
  }, []);

  // Local tick drives the clock + relative-time labels between feeder pushes.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Device Back button arrives as an Escape keydown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="device">
      <TopBar state={state} connected={connected} now={now} />
      <div className="page">
        {route.name === "board" && <BoardPage state={state} connected={connected} now={now} />}
        {route.name === "session" && <SessionPage id={route.id} now={now} />}
        {route.name === "usage" && <UsagePage usage={state.usage} now={now} />}
      </div>
      <NotificationOverlay sessions={state.sessions} ready={state.generatedAt > 0} />
    </div>
  );
}
