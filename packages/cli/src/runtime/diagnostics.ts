import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../../../apps/feeder/src/config.ts";
import { connectCdp } from "./cdp.ts";
import { ensureUserDirectories, logDir } from "./paths.ts";
import { capture } from "./process.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = () => new Date().toTimeString().slice(0, 8);

async function shell(command: string): Promise<string> {
  try {
    return await capture("adb", ["shell", command]);
  } catch {
    return "";
  }
}

async function cdpEval(expression: string): Promise<void> {
  const client = await connectCdp();
  try {
    await client.send("Runtime.enable");
    const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
    console.log(JSON.stringify(result?.result?.value ?? result?.result ?? null));
  } finally {
    client.close();
  }
}

async function cdpLayers(): Promise<void> {
  const client = await connectCdp();
  let layers: any[] = [];
  client.socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.method === "LayerTree.layerTreeDidChange" && message.params.layers) {
      layers = message.params.layers;
    }
  });
  try {
    await client.send("DOM.enable");
    await client.send("LayerTree.enable");
    await sleep(1800);
    console.log(`composited layers: ${layers.length}`);
    for (const layer of layers) {
      if ((layer.width || 0) * (layer.height || 0) < 64) continue;
      const result = await client
        .send("LayerTree.compositingReasons", { layerId: layer.layerId })
        .catch(() => ({}));
      const reasons = result.compositingReasons || result.compositingReasonIds || [];
      console.log(
        `  ${String(Math.round(layer.width)).padStart(4)}x${String(Math.round(layer.height)).padEnd(4)} @${Math.round(layer.offsetX || 0)},${Math.round(layer.offsetY || 0)}  ${reasons.join(", ") || "(root/none)"}`,
      );
    }
  } finally {
    client.close();
  }
}

async function parseMinidump(path: string): Promise<void> {
  if (!path) throw new Error("diagnostics parse-dump requires a .dmp file path");
  const bytes = await readFile(path);
  const scan = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let base = -1;
  for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 1) {
    if (scan.getUint32(offset, true) === 0x504d444d) {
      base = offset;
      break;
    }
  }
  if (base < 0) throw new Error("not a minidump (no MDMP signature found)");
  const view = new DataView(bytes.buffer, bytes.byteOffset + base, bytes.byteLength - base);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const u64 = (offset: number) => Number(view.getBigUint64(offset, true));
  const streams = new Map<number, { size: number; rva: number }>();
  const streamCount = u32(8);
  const directory = u32(12);
  for (let index = 0; index < streamCount; index += 1) {
    const offset = directory + index * 12;
    streams.set(u32(offset), { size: u32(offset + 4), rva: u32(offset + 8) });
  }
  const mdString = (rva: number) => {
    if (rva <= 0 || rva + 4 > view.byteLength) return "(bad-rva)";
    const length = Math.min(u32(rva), 1024);
    let value = "";
    for (let index = 0; index < length && rva + 4 + index + 2 <= view.byteLength; index += 2) {
      value += String.fromCharCode(u16(rva + 4 + index));
    }
    return value;
  };
  const architectureNames: Record<number, string> = {
    0: "x86",
    5: "ARM",
    9: "x86_64",
    12: "ARM64",
    32771: "ARM64",
  };
  const systemInfo = streams.get(7);
  const architecture = systemInfo ? u16(systemInfo.rva) : -1;
  const modules: { base: number; size: number; name: string }[] = [];
  const moduleList = streams.get(4);
  if (moduleList) {
    const count = u32(moduleList.rva);
    for (let index = 0; index < count; index += 1) {
      const offset = moduleList.rva + 4 + index * 108;
      modules.push({ base: u64(offset), size: u32(offset + 8), name: mdString(u32(offset + 20)) });
    }
  }
  const moduleOf = (address: number) => {
    const module = modules.find(
      (candidate) => address >= candidate.base && address < candidate.base + candidate.size,
    );
    return module
      ? `${module.name.split("/").pop()} +0x${(address - module.base).toString(16)}`
      : "(unmapped)";
  };
  const signals: Record<number, string> = {
    4: "SIGILL",
    5: "SIGTRAP",
    6: "SIGABRT",
    7: "SIGBUS",
    8: "SIGFPE",
    11: "SIGSEGV",
  };
  const output: Record<string, unknown> = {
    file: path.split("/").pop(),
    arch: architectureNames[architecture] ?? architecture,
  };
  const exception = streams.get(6);
  if (exception) {
    const offset = exception.rva;
    const signal = u32(offset + 8);
    output.signal = `${signal} ${signals[signal] ?? ""}`.trim();
    output.si_code = u32(offset + 12);
    const faultAddress = u64(offset + 24);
    output.faultAddr = `0x${faultAddress.toString(16)}`;
    output.faultIn = moduleOf(faultAddress);
    const context = u32(offset + 164);
    if (context && architecture === 5) {
      const programCounter = u32(context + 4 + 15 * 4);
      const linkRegister = u32(context + 4 + 14 * 4);
      output.pc = `0x${programCounter.toString(16)}`;
      output.pcIn = moduleOf(programCounter);
      output.lrIn = moduleOf(linkRegister);
    } else if (context && (architecture === 12 || architecture === 0x8003)) {
      const programCounter = u64(context + 16 + 31 * 8 + 8);
      output.pc = `0x${programCounter.toString(16)}`;
      output.pcIn = moduleOf(programCounter);
    }
  }
  console.log(JSON.stringify(output, null, 2));
  const graphics = modules
    .filter((module) => /mali|gles|egl|libgl|gpu|drm|gbm|vulkan|skia/i.test(module.name))
    .map((module) => module.name);
  console.log("graphics modules loaded:", graphics.length ? graphics : "(none in module list)");
  console.log("total modules:", modules.length);
}

function pidFrom(processes: string, match: string, exclude?: string): string | null {
  const line = processes
    .split("\n")
    .find(
      (value) => value.includes("chrome") && value.includes(match) && (!exclude || !value.includes(exclude)),
    );
  const pid = line?.trim().split(/\s+/)[0] || "";
  return /^\d+$/.test(pid) ? pid : null;
}

async function processInfo(pid: string): Promise<{ start: string; rss: number }> {
  const stat = await shell(`cat /proc/${pid}/stat 2>/dev/null`);
  const fields = stat
    .slice(stat.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  const status = await shell(`cat /proc/${pid}/status 2>/dev/null`);
  return { start: fields[19] ?? "?", rss: Number(/VmRSS:\s*(\d+)/.exec(status)?.[1] ?? 0) };
}

async function crashMonitor(minutes: number, intervalSeconds: number): Promise<void> {
  ensureUserDirectories();
  const logPath = join(logDir, "crash-monitor.log");
  const log = async (line: string) => appendFile(logPath, `${line}\n`, "utf8");
  let previousRenderer: string | null = null;
  let previousBrowser: string | null = null;
  let restarts = 0;
  let minimumMemory = Number.POSITIVE_INFINITY;
  const restartEvents: string[] = [];
  const ticks = Math.max(1, Math.round((minutes * 60) / intervalSeconds));
  await log(`# ---- start ${new Date().toISOString()} every ${intervalSeconds}s for ${minutes}min ----`);
  for (let index = 0; index < ticks; index += 1) {
    const processes = await shell("ps");
    const events: string[] = [];
    let renderer = "-";
    let browser = "-";
    const rendererPid = pidFrom(processes, "type=renderer");
    if (rendererPid) {
      const info = await processInfo(rendererPid);
      const key = `${rendererPid}:${info.start}`;
      renderer = `pid${rendererPid} rss${info.rss}kB`;
      if (previousRenderer && key !== previousRenderer) {
        restarts += 1;
        events.push("RENDERER_RESTART");
      }
      previousRenderer = key;
    }
    const browserPid = pidFrom(processes, "in-process", "type=");
    if (browserPid) {
      const info = await processInfo(browserPid);
      const key = `${browserPid}:${info.start}`;
      browser = `pid${browserPid} rss${info.rss}kB`;
      if (previousBrowser && key !== previousBrowser) {
        restarts += 1;
        events.push("BROWSER_RESTART");
      }
      previousBrowser = key;
    }
    const memory = Number(/MemAvailable:\s*(\d+)/.exec(await shell("cat /proc/meminfo"))?.[1] ?? -1);
    if (memory >= 0) minimumMemory = Math.min(minimumMemory, memory);
    const oom = Number((await shell("ls /tmp/oom/ 2>/dev/null | wc -l")).trim()) || 0;
    if (events.length) restartEvents.push(`${clock()} ${events.join(",")}`);
    const line = `${clock()} mem_avail=${memory}kB renderer=${renderer} browser=${browser} oom=${oom}${events.length ? ` *** ${events.join(",")} ***` : ""}`;
    await log(line);
    console.log(line);
    if (index < ticks - 1) await sleep(intervalSeconds * 1000);
  }
  const summary =
    `# ---- end: ${restarts} restart event(s), minMemAvail=${minimumMemory === Number.POSITIVE_INFINITY ? "?" : minimumMemory}kB ----` +
    (restartEvents.length ? `\n# events:\n# ${restartEvents.join("\n# ")}` : "");
  await log(summary);
  console.log(summary);
}

async function rendererPid(): Promise<string> {
  const line = (await shell("ps")).split("\n").find((value) => value.includes("type=renderer"));
  return line?.trim().split(/\s+/)[0] || "";
}

async function crashDumps(): Promise<string[]> {
  const raw = await shell('ls "/var/cache/chrome_storage/Crash Reports" 2>/dev/null');
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  return raw
    .replace(ansi, "")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.endsWith(".dmp"));
}

async function nowPlaying(): Promise<string> {
  try {
    const response = await fetch(`http://localhost:${config.server.port}/state`, {
      signal: AbortSignal.timeout(2000),
    });
    const playing = (await response.json())?.nowPlaying;
    return playing
      ? `np=${playing.state}/${String(playing.trackId || "")
          .split(":")
          .pop()
          ?.slice(0, 10)}`
      : "np=none";
  } catch {
    return "np=?";
  }
}

async function crashWatch(minutes: number, intervalSeconds: number, label: string): Promise<void> {
  ensureUserDirectories();
  const logPath = join(logDir, "crash-watch.log");
  const log = async (line: string) => appendFile(logPath, `${line}\n`, "utf8");
  const seen = new Set(await crashDumps());
  let previousPid = await rendererPid();
  let crashes = 0;
  await log(
    `# ---- [${label}] start ${new Date().toISOString()} every ${intervalSeconds}s for ${minutes}min ----`,
  );
  const ticks = Math.max(1, Math.round((minutes * 60) / intervalSeconds));
  for (let index = 0; index < ticks; index += 1) {
    await sleep(intervalSeconds * 1000);
    const pid = await rendererPid();
    const dumps = await crashDumps();
    const fresh = dumps.filter((dump) => !seen.has(dump));
    for (const dump of fresh) seen.add(dump);
    const events: string[] = [];
    if (fresh.length) {
      events.push(`NEW_DUMP x${fresh.length}`);
      crashes += fresh.length;
    }
    if (pid && previousPid && pid !== previousPid) {
      events.push(`RENDERER_RESTART ${previousPid}->${pid}`);
      if (!fresh.length) crashes += 1;
    }
    if (pid) previousPid = pid;
    const line = events.length
      ? `${clock()} *** CRASH *** ${events.join(" | ")} | ${await nowPlaying()}`
      : `${clock()} ok pid=${pid} dumps=${dumps.length} ${await nowPlaying()}`;
    await log(line);
    console.log(line);
  }
  const summary = `# ---- [${label}] end: ${crashes} crash event(s) in ${minutes}min ----`;
  await log(summary);
  console.log(summary);
}

export async function runDiagnostics(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command === "eval") return cdpEval(rest[0] ?? "1");
  if (command === "layers") return cdpLayers();
  if (command === "parse-dump") return parseMinidump(rest[0]);
  if (command === "crash-monitor") return crashMonitor(Number(rest[0] ?? 120), Number(rest[1] ?? 60));
  if (command === "crash-watch") {
    return crashWatch(Number(rest[0] ?? 20), Number(rest[1] ?? 15), rest[2] ?? "baseline");
  }
  throw new Error(
    "usage: commandthing diagnostics <eval|layers|parse-dump|crash-monitor|crash-watch> [...args]",
  );
}
