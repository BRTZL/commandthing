/**
 * Car Thing physical controls that arrive over the native bridge.
 *
 * On this firmware (Thing Labs OS / qt-superbird) the preset buttons, dial PRESS,
 * back and settings are streamed as JSON over a local WebSocket at
 * ws://localhost:8890, e.g. {"type":"preset_2"}. The dial ROTATION is different —
 * it arrives as a DOM `wheel` event (deltaX sign = direction), handled in App.tsx.
 *
 * Our dashboard runs in the device's Chromium, so it connects to that socket
 * directly. On a desktop browser there's no :8890, so the connect fails silently
 * and you use the keyboard fallback in App.tsx.
 */

export type HwAction =
  | { type: "tab"; preset: number }
  | { type: "dial"; dir: -1 | 1 }
  | { type: "select" }
  | { type: "back" }
  | { type: "settings" };

export function connectHardware(onAction: (a: HwAction) => void): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let backoff = 800;

  const open = () => {
    try {
      socket = new WebSocket("ws://localhost:8890");
    } catch {
      return; // not on-device
    }
    socket.onopen = () => {
      backoff = 800;
    };
    socket.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      const t = msg?.type;
      if (typeof t !== "string") return;
      if (t === "dial_left") onAction({ type: "dial", dir: -1 });
      else if (t === "dial_right") onAction({ type: "dial", dir: 1 });
      else if (t === "dial_press") onAction({ type: "select" });
      else if (t === "back_button" || t === "back" || t === "backPress") onAction({ type: "back" });
      else if (t.indexOf("settings") >= 0 || t.indexOf("menu") >= 0 || t === "m_button")
        onAction({ type: "settings" });
      else {
        const m = /^preset_([1-4])$/.exec(t);
        if (m) onAction({ type: "tab", preset: Number(m[1]) });
      }
    };
    socket.onclose = () => {
      if (stopped) return;
      backoff = Math.min(backoff * 2, 5000);
      window.setTimeout(open, backoff);
    };
    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        /* onclose reconnects */
      }
    };
  };

  open();
  return () => {
    stopped = true;
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
}
