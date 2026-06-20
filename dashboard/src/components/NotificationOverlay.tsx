import { useEffect, useRef, useState } from "react";
import type { ClaudeSession } from "../dashboardTypes";
import { navigate } from "../router";

/**
 * Watches for sessions transitioning INTO needs-you and raises a tappable toast
 * (plus a soft beep) so you notice from across the room. Tapping opens the
 * session. Pre-existing waiting sessions on first load do NOT alert.
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
    // Don't establish the baseline from the synthetic empty state, or every
    // already-waiting session would look "new" on the first real payload.
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
    <div
      className="toast"
      onClick={() => {
        navigate(`/session/${alert.id}`);
        setAlert(null);
      }}
    >
      <span className="toast-dot" />
      <span className="toast-text">
        <b>{alert.project}</b> needs you
      </span>
      <span className="toast-cta">view ›</span>
    </div>
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
