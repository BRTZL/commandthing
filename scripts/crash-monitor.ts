#!/usr/bin/env bun
/**
 * Baseline crash monitor for the Car Thing kiosk. Polls the device every
 * `intervalSec` via PURE /proc reads (no CDP — zero observer effect on the
 * renderer) and logs the renderer/browser process identity + memory. A change
 * in a process's pid OR start-time means that process restarted = a crash/reload
 * event. The firmware has no logcat, so this is how we get a real crash-frequency
 * baseline (and later, a before/after for any fix).
 *
 * Usage: bun run scripts/crash-monitor.ts [minutes=120] [intervalSec=60]
 * Log:   ~/.commandthing/logs/crash-monitor.log (also echoed to stdout)
 */

import { join } from "node:path";
import { ensureUserDirectories, logDir } from "./paths.ts";

const minutes = Number(process.argv[2] ?? 120);
const intervalSec = Number(process.argv[3] ?? 60);
ensureUserDirectories();
const LOG = join(logDir, "crash-monitor.log");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 19);

async function sh(cmd: string): Promise<string> {
  const p = Bun.spawn(["adb", "shell", cmd], { stdout: "pipe", stderr: "ignore" });
  await p.exited;
  return await new Response(p.stdout).text();
}

async function append(line: string): Promise<void> {
  const f = Bun.file(LOG);
  const prev = (await f.exists()) ? await f.text() : "";
  await Bun.write(LOG, `${prev + line}\n`);
}

/** First PID whose ps line contains `match` (and not `exclude`). */
function pidFrom(ps: string, match: string, exclude?: string): string | null {
  const line = ps
    .split("\n")
    .find((l) => l.includes("chrome") && l.includes(match) && (!exclude || !l.includes(exclude)));
  if (!line) return null;
  const pid = line.trim().split(/\s+/)[0];
  return /^\d+$/.test(pid) ? pid : null;
}

/** start-time (proc field 22) + VmRSS kB for a pid, robust to spaces in comm. */
async function procInfo(pid: string): Promise<{ start: string; rss: number }> {
  const stat = await sh(`cat /proc/${pid}/stat 2>/dev/null`);
  const after = stat
    .slice(stat.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  const start = after[19] ?? "?";
  const status = await sh(`cat /proc/${pid}/status 2>/dev/null`);
  const m = /VmRSS:\s*(\d+)/.exec(status);
  return { start, rss: m ? Number(m[1]) : 0 };
}

let prevR: string | null = null; // renderer  "pid:start"
let prevB: string | null = null; // browser   "pid:start"
let restarts = 0;
let minMem = Number.POSITIVE_INFINITY;
const events: string[] = [];

await append(`# ---- start ${new Date().toISOString()}  every ${intervalSec}s for ${minutes}min ----`);
const ticks = Math.max(1, Math.round((minutes * 60) / intervalSec));

for (let i = 0; i < ticks; i++) {
  const ps = await sh("ps");
  let rStr = "-";
  let bStr = "-";
  const tick: string[] = [];

  const rPid = pidFrom(ps, "type=renderer");
  if (rPid) {
    const { start, rss } = await procInfo(rPid);
    const key = `${rPid}:${start}`;
    rStr = `pid${rPid} rss${rss}kB`;
    if (prevR && key !== prevR) {
      restarts++;
      tick.push("RENDERER_RESTART");
    }
    prevR = key;
  } else {
    tick.push("renderer_missing");
  }

  const bPid = pidFrom(ps, "in-process", "type=");
  if (bPid) {
    const { start, rss } = await procInfo(bPid);
    const key = `${bPid}:${start}`;
    bStr = `pid${bPid} rss${rss}kB`;
    if (prevB && key !== prevB) {
      restarts++;
      tick.push("BROWSER_RESTART");
    }
    prevB = key;
  }

  const miMatch = /MemAvailable:\s*(\d+)/.exec(await sh("cat /proc/meminfo"));
  const mem = miMatch ? Number(miMatch[1]) : -1;
  if (mem >= 0) minMem = Math.min(minMem, mem);
  const oom = Number((await sh("ls /tmp/oom/ 2>/dev/null | wc -l")).trim()) || 0;

  const flag = tick.length ? `  *** ${tick.join(",")} ***` : "";
  if (tick.some((e) => e.endsWith("RESTART"))) events.push(`${ts()} ${tick.join(",")}`);
  const line = `${ts()} mem_avail=${mem}kB renderer=${rStr} browser=${bStr} oom=${oom}${flag}`;
  await append(line);
  console.log(line);

  if (i < ticks - 1) await sleep(intervalSec * 1000);
}

const summary =
  `# ---- end: ${restarts} restart event(s), minMemAvail=` +
  `${minMem === Number.POSITIVE_INFINITY ? "?" : minMem}kB ----` +
  (events.length ? `\n# events:\n# ${events.join("\n# ")}` : "");
await append(summary);
console.log(summary);
