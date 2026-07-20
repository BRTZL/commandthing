import { spawn } from "node:child_process";
import { appendFileSync, existsSync, renameSync, rmSync, statSync } from "node:fs";

const [, , tool, logPath] = process.argv;
if (!tool || !logPath) {
  console.error("usage: service-runner.mjs <tool> <log-path>");
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
child.stdout.on("data", write);
child.stderr.on("data", write);
child.on("error", (error) => write(`[service-runner] ${error.stack || error.message}\n`));
child.on("close", (code, signal) => {
  if (signal) write(`[service-runner] child exited after ${signal}\n`);
  process.exit(code ?? 1);
});

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
