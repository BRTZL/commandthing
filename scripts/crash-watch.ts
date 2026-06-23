#!/usr/bin/env bun
/**
 * Passive renderer-crash watcher (CDP-free). Polls the renderer pid and the
 * Chromium crash-dump dir every `intervalSec`; a NEW .dmp or a renderer pid
 * change = a crash event. Use it to confirm a reproducible crash rate and to
 * bisect which UI element is responsible (deploy a variant, watch the rate).
 *
 * Usage: bun run scripts/crash-watch.ts [minutes=20] [intervalSec=15] [label]
 * Log:   .carthing-crashwatch.log
 */
const minutes = Number(process.argv[2] ?? 20);
const intervalSec = Number(process.argv[3] ?? 15);
const label = process.argv[4] ?? "baseline";
const DIR = "/var/cache/chrome_storage/Crash Reports";
const LOG = `${new URL("..", import.meta.url).pathname}.carthing-crashwatch.log`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toTimeString().slice(0, 8);
async function sh(c: string): Promise<string> {
  const p = Bun.spawn(["adb", "shell", c], { stdout: "pipe", stderr: "ignore" });
  await p.exited;
  return await new Response(p.stdout).text();
}
async function append(l: string): Promise<void> {
  const f = Bun.file(LOG);
  const prev = (await f.exists()) ? await f.text() : "";
  await Bun.write(LOG, prev + l + "\n");
}
async function rpid(): Promise<string> {
  const line = (await sh("ps")).split("\n").find((l) => l.includes("type=renderer") && !l.includes("grep"));
  return line ? line.trim().split(/\s+/)[0] : "";
}
async function dumps(): Promise<string[]> {
  // The device's `ls` colorizes output — strip ANSI escapes before matching, or
  // filenames arrive as "\x1b[0;0m<name>.dmp\x1b[m" and never match ".dmp".
  const raw = await sh(`ls "${DIR}" 2>/dev/null`);
  return raw
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".dmp"));
}
/** Current now-playing (Mac-side /state, no device touch) — to correlate a crash
 *  burst with the exact track/lyrics that were on screen. */
async function nowPlaying(): Promise<string> {
  try {
    const r = await fetch("http://localhost:4000/state", { signal: AbortSignal.timeout(2000) });
    const n = (await r.json())?.nowPlaying;
    if (!n) return "np=none";
    const id = String(n.trackId ?? "").split(":").pop()?.slice(0, 10) ?? "?";
    const lyr = n.lyricsLoaded ? (n.lyrics?.length ?? 0) : "off";
    return `np=${n.state}/${id}/lyr:${lyr}`;
  } catch {
    return "np=?";
  }
}

const seen = new Set<string>();
(await dumps()).forEach((d) => seen.add(d));
let prevPid = await rpid();
let crashes = 0;

await append(`# ---- [${label}] start ${new Date().toISOString()}  every ${intervalSec}s for ${minutes}min ----`);
await append(`${ts()} baseline renderer pid=${prevPid} existing_dumps=${seen.size}`);
console.log(`watching: renderer pid=${prevPid}, ${seen.size} old dumps ignored`);

const ticks = Math.max(1, Math.round((minutes * 60) / intervalSec));
for (let i = 0; i < ticks; i++) {
  await sleep(intervalSec * 1000);
  const pid = await rpid();
  const ds = await dumps();
  const fresh = ds.filter((d) => !seen.has(d));
  fresh.forEach((d) => seen.add(d));

  const ev: string[] = [];
  if (fresh.length) {
    ev.push(`NEW_DUMP x${fresh.length}`);
    crashes += fresh.length;
  }
  if (pid && prevPid && pid !== prevPid) {
    ev.push(`RENDERER_RESTART ${prevPid}->${pid}`);
    if (!fresh.length) crashes++;
  }
  if (pid) prevPid = pid;

  const np = await nowPlaying();
  const line = ev.length
    ? `${ts()} *** CRASH *** ${ev.join(" | ")} | ${np}`
    : `${ts()} ok pid=${pid} dumps=${ds.length} ${np}`;
  await append(line);
  console.log(line);
}
const sum = `# ---- [${label}] end: ${crashes} crash event(s) in ${minutes}min ----`;
await append(sum);
console.log(sum);
