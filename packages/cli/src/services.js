import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { access, cp, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locations } from "./locations.js";

const LABELS = ["com.commandthing.feeder", "com.commandthing.tunnel"];
const LEGACY_LABELS = ["com.carthing.feeder", "com.carthing.tunnel"];
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function requireMacOS() {
  if (process.platform !== "darwin") {
    throw new Error("service management currently requires macOS launchd");
  }
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function runOrThrow(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.status}`;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

function executable(name, fallbacks = []) {
  const found = run("/usr/bin/which", [name]);
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  for (const path of fallbacks) {
    if (!path) continue;
    try {
      accessSync(path, constants.X_OK);
      return path;
    } catch {
      // Try the next conventional executable location.
    }
  }
  return null;
}

function xml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plist({ label, program, logPath, homeDir, pathValue }) {
  const environment = [
    ["PATH", pathValue],
    ["COMMANDTHING_HOME", homeDir],
  ];
  if (process.env.COMMANDTHING_CONFIG) {
    environment.push(["COMMANDTHING_CONFIG", process.env.COMMANDTHING_CONFIG]);
  }
  const environmentXml = environment
    .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(program[0])}</string>
    <string>${xml(program[1])}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(homeDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${environmentXml}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logPath)}</string>
</dict>
</plist>
`;
}

function launchDomain() {
  return `gui/${process.getuid()}`;
}

function agentPath(label) {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

function stopLabel(label) {
  run("launchctl", ["bootout", `${launchDomain()}/${label}`]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (run("launchctl", ["print", `${launchDomain()}/${label}`]).status !== 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

async function buildRuntimeFromCheckout() {
  const builder = join(packageRoot, "..", "..", "scripts", "build-runtime.ts");
  if (!(await exists(builder))) return;
  const bun = executable("bun", [join(homedir(), ".bun", "bin", "bun")]);
  if (!bun) throw new Error("Bun is required; install it from https://bun.sh and rerun setup");
  runOrThrow(bun, ["run", builder], { stdio: "inherit" });
}

export async function installRuntime(version) {
  await buildRuntimeFromCheckout();
  const source = join(packageRoot, "runtime");
  if (!(await exists(join(source, "feeder.js")))) {
    throw new Error("the CommandThing package does not contain runtime assets");
  }

  const { runtimeRoot } = locations();
  const safeVersion = String(version).replaceAll(/[^a-zA-Z0-9._-]/g, "-");
  const destination = join(runtimeRoot, safeVersion);
  const temporary = join(runtimeRoot, `.install-${process.pid}`);
  await mkdir(runtimeRoot, { recursive: true });
  await rm(temporary, { recursive: true, force: true });
  await cp(source, temporary, { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await rename(temporary, destination);
  return destination;
}

export async function installServices(version) {
  requireMacOS();
  const bun = executable("bun", [join(homedir(), ".bun", "bin", "bun")]);
  if (!bun) throw new Error("Bun is required; install it from https://bun.sh and rerun setup");
  const adb = executable("adb", [join(homedir(), "Library", "Android", "sdk", "platform-tools", "adb")]);
  const runtimeDir = await installRuntime(version);
  const { homeDir, logsDir } = locations();
  const launchAgentsDir = dirname(agentPath(LABELS[0]));
  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });

  const pathParts = [dirname(bun), adb ? dirname(adb) : null, "/usr/local/bin", "/usr/bin", "/bin"].filter(
    Boolean,
  );
  const pathValue = [...new Set(pathParts)].join(":");
  const programs = {
    "com.commandthing.feeder": [bun, join(runtimeDir, "feeder.js")],
    "com.commandthing.tunnel": [bun, join(runtimeDir, "tunnel.js")],
  };

  for (const label of [...LABELS, ...LEGACY_LABELS]) stopLabel(label);
  for (const label of LEGACY_LABELS) await unlink(agentPath(label)).catch(() => {});
  for (const label of LABELS) {
    await writeFile(
      agentPath(label),
      plist({
        label,
        program: programs[label],
        logPath: join(logsDir, `${label}.log`),
        homeDir,
        pathValue,
      }),
      "utf8",
    );
    runOrThrow("launchctl", ["bootstrap", launchDomain(), agentPath(label)]);
    run("launchctl", ["enable", `${launchDomain()}/${label}`]);
  }

  if (!adb)
    console.warn("! adb was not found; the feeder will run, but the device tunnel cannot connect yet");
  return runtimeDir;
}

export function startServices() {
  requireMacOS();
  for (const label of LABELS) {
    const path = agentPath(label);
    if (!existsSync(path)) {
      throw new Error(`services are not installed; run commandthing setup first (${path} is missing)`);
    }
    if (run("launchctl", ["print", `${launchDomain()}/${label}`]).status !== 0) {
      runOrThrow("launchctl", ["bootstrap", launchDomain(), path]);
    }
    run("launchctl", ["enable", `${launchDomain()}/${label}`]);
  }
  console.log("CommandThing services started");
}

export function stopServices({ quiet = false } = {}) {
  requireMacOS();
  for (const label of LABELS) stopLabel(label);
  if (!quiet) console.log("CommandThing services stopped");
}

export function restartServices() {
  stopServices({ quiet: true });
  startServices();
}

async function feederUrl() {
  const { configPath } = locations();
  let port = 4000;
  if (await exists(configPath)) {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    port = Number(config?.server?.port ?? port);
  }
  return `http://localhost:${port}`;
}

export async function waitForHealthyFeeder(timeoutMs = 15_000) {
  const url = await feederUrl();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(1000) });
      if (response.ok) return url;
    } catch {
      // Service startup is asynchronous; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`feeder did not become healthy at ${url}; run commandthing logs`);
}

export async function statusServices() {
  requireMacOS();
  let healthy = true;
  for (const label of LABELS) {
    const result = run("launchctl", ["print", `${launchDomain()}/${label}`]);
    const running = result.status === 0 && /state = running/.test(result.stdout);
    console.log(`${running ? "✓" : "!"} ${basename(label)}: ${running ? "running" : "stopped"}`);
    healthy &&= running;
  }
  const url = await feederUrl();
  try {
    const response = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(1500) });
    console.log(`${response.ok ? "✓" : "!"} dashboard: ${url}`);
    healthy &&= response.ok;
  } catch {
    console.log(`! dashboard: ${url} (unreachable)`);
    healthy = false;
  }
  if (!healthy) process.exitCode = 1;
}

export async function followLogs() {
  const { logsDir } = locations();
  const paths = LABELS.map((label) => join(logsDir, `${label}.log`));
  await mkdir(logsDir, { recursive: true });
  for (const path of paths) if (!(await exists(path))) await writeFile(path, "", "utf8");
  spawnSync("tail", ["-f", ...paths], { stdio: "inherit" });
}

export async function uninstallServices({ removeRuntime = true } = {}) {
  requireMacOS();
  stopServices({ quiet: true });
  for (const label of LABELS) await unlink(agentPath(label)).catch(() => {});
  if (removeRuntime) await rm(locations().runtimeRoot, { recursive: true, force: true });
  console.log("CommandThing services uninstalled");
}

export async function purgeHome() {
  const { homeDir } = locations();
  const target = resolve(homeDir);
  const unsafeTargets = new Set(["/", resolve(homedir()), resolve(process.cwd())]);
  if (unsafeTargets.has(target) || !basename(target).toLowerCase().includes("commandthing")) {
    throw new Error(`refusing to purge unsafe COMMANDTHING_HOME: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
