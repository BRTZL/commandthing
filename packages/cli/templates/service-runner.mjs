import { spawn } from "node:child_process";
import { appendFileSync, existsSync, renameSync, rmSync, statSync } from "node:fs";

const [, , tool, logPath, healthUrl] = process.argv;
if (!tool || !logPath) {
  console.error("usage: service-runner.mjs <tool> <log-path> [health-url]");
  process.exit(64);
}

const maxBytes = 5 * 1024 * 1024;
const retainedFiles = 3;
let size = existsSync(logPath) ? statSync(logPath).size : 0;

function rotate() {
  rmSync(`${logPath}.${retainedFiles}`, { force: true });
  for (let index = retainedFiles - 1; index >= 1; index -= 1) {
    const source = `${logPath}.${index}`;
    if (existsSync(source)) renameSync(source, `${logPath}.${index + 1}`);
  }
  if (existsSync(logPath)) renameSync(logPath, `${logPath}.1`);
  size = 0;
}

function write(chunk) {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
  let offset = 0;
  while (offset < buffer.length) {
    if (size >= maxBytes) rotate();
    const length = Math.min(buffer.length - offset, maxBytes - size);
    appendFileSync(logPath, buffer.subarray(offset, offset + length));
    offset += length;
    size += length;
  }
}

if (size >= maxBytes) rotate();

const child = spawn(process.execPath, [tool], { stdio: ["ignore", "pipe", "pipe"] });
let stopping = false;
let forceKillTimer;
let healthTimer;
child.stdout.on("data", write);
child.stderr.on("data", write);
child.on("error", (error) => write(`[service-runner] ${error.stack || error.message}\n`));
child.on("close", (code, signal) => {
  if (healthTimer) clearInterval(healthTimer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (signal) write(`[service-runner] child exited after ${signal}\n`);
  process.exit(code ?? 1);
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function stopChild(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  forceKillTimer = setTimeout(() => {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
  }, 2000);
  forceKillTimer.unref();
}

if (healthUrl) {
  const intervalMs = positiveInteger(process.env.COMMANDTHING_WATCHDOG_INTERVAL_MS, 5000);
  const timeoutMs = positiveInteger(process.env.COMMANDTHING_WATCHDOG_TIMEOUT_MS, 2000);
  const failureLimit = positiveInteger(process.env.COMMANDTHING_WATCHDOG_FAILURES, 3);
  let failures = 0;
  let checking = false;

  healthTimer = setInterval(async () => {
    if (checking || stopping) return;
    checking = true;
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      failures = 0;
    } catch (error) {
      failures += 1;
      write(`[service-runner] health check ${failures}/${failureLimit} failed: ${error.message}\n`);
      if (failures >= failureLimit) {
        write("[service-runner] service is unresponsive; requesting a launchd restart\n");
        stopChild();
      }
    } finally {
      checking = false;
    }
  }, intervalMs);
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => stopChild(signal));
}
