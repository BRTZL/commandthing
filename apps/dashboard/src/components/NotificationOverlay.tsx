import { useEffect, useRef, useState } from "react";
import { openSession } from "../router";
import { useReady, useSessions } from "../store/dashboardStore";
import { Button } from "./ui/button";

/**
 * Watches for sessions transitioning INTO needs-you and raises a tappable toast
 * so you notice from across the room. No sound: creating an AudioContext hangs the
 * device's renderer, and the hardware has no speaker. Tapping opens the
 * session. Pre-existing waiting sessions on first load do NOT alert.
 *
 * (Self-managed rather than sonner — sonner's CSS/runtime doesn't render
 * reliably on the device's Chromium 69.)
 */
export function NotificationOverlay() {
  const sessions = useSessions();
  /** True once the FIRST real broadcast has arrived (not the empty seed state). */
  const ready = useReady();
  const prev = useRef(new Set<string>());
  const initialized = useRef(false);
  const timer = useRef<number | null>(null);
  const [alert, setAlert] = useState<{ id: string; project: string } | null>(null);

  useEffect(() => {
    if (!ready) return;

    const waiting = sessions.filter((s) => s.needsInput);
    const ids = new Set(waiting.map((s) => s.id));

    if (!initialized.current) {
      prev.current = ids;
      initialized.current = true;
      return;
    }

    const fresh = waiting.find((s) => !prev.current.has(s.id));
    prev.current = ids;
    if (fresh) {
      setAlert({ id: fresh.id, project: fresh.project });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setAlert(null), 6000);
    }
  }, [sessions, ready]);

  if (!alert) return null;
  return (
    <Button
      variant="ghost"
      onClick={() => {
        openSession(alert.id);
        setAlert(null);
      }}
      className="absolute bottom-4 left-1/2 h-auto w-96 -translate-x-1/2 justify-start rounded-xl border border-waiting bg-card px-4 py-3 text-left font-normal shadow-xl hover:bg-card"
    >
      <span className="mr-3 h-2.5 w-2.5 animate-pulse rounded-full bg-waiting" />
      <span className="text-base text-foreground">
        <b>{alert.project}</b> needs you
      </span>
      <span className="ml-auto text-base font-semibold text-waiting">view ›</span>
    </Button>
  );
}
