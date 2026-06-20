import { useEffect, useRef, useState } from "react";
import type { ClaudeSession } from "../dashboardTypes";
import { openSession } from "../router";

/**
 * Watches for sessions transitioning INTO needs-you and raises a tappable toast
 * (plus a soft beep) so you notice from across the room. Tapping opens the
 * session. Pre-existing waiting sessions on first load do NOT alert.
 *
 * (Self-managed rather than sonner — sonner's CSS/runtime doesn't render
 * reliably on the device's Chromium 69.)
 */
export function NotificationOverlay({
  sessions,
  ready,
}: {
  sessions: ClaudeSession[];
  /** True once the FIRST real broadcast has arrived (not the empty seed state). */
  ready: boolean;
}) {
  const prev = useRef<Set<string>>(new Set());
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
      beep();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setAlert(null), 6000);
    }
  }, [sessions, ready]);

  if (!alert) return null;
  return (
    <button
      type="button"
      onClick={() => {
        openSession(alert.id);
        setAlert(null);
      }}
      className="absolute bottom-4.5 left-1/2 flex w-95 -translate-x-1/2 items-center rounded-xl border border-waiting bg-toast px-4 py-3.5 text-left shadow-xl"
    >
      <span className="mr-3 h-2.75 w-2.75 animate-pulse rounded-full bg-waiting" />
      <span className="text-md text-foreground">
        <b>{alert.project}</b> needs you
      </span>
      <span className="ml-auto text-base font-semibold text-waiting">view ›</span>
    </button>
  );
}

let audioCtx: AudioContext | null = null;
function beep(): void {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx || new Ctor();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    /* audio not available (autoplay policy / kiosk) — visual toast still shows */
  }
}
