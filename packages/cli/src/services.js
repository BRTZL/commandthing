import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfigFileSync } from "./config.js";
import { locations } from "./locations.js";

const LABELS = ["com.commandthing.feeder", "com.commandthing.tunnel"];
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

/** Exported for deterministic unit tests; service installation still requires macOS. */
export function launchAgentPlist({ label, program, homeDir, pathValue }) {
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
  const argumentsXml = program.map((argument) => `    <string>${xml(argument)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsXml}
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
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>/dev/null</string>
</dict>
</plist>
`;
}

function launchDomain() {
  return `gui/${process.getuid()}`;
}

function launchAgentsDir() {
  return process.env.COMMANDTHING_LAUNCH_AGENTS || join(homedir(), "Library", "LaunchAgents");
}

function agentPath(label) {
  return join(launchAgentsDir(), `${label}.plist`);
}

function serviceRunning(label) {
  const result = run("launchctl", ["print", `${launchDomain()}/${label}`]);
  return result.status === 0 && /state = running/.test(result.stdout);
}

function serviceLoaded(label) {
  return run("launchctl", ["print", `${launchDomain()}/${label}`]).status === 0;
}

function stopLabel(label) {
  run("launchctl", ["bootout", `${launchDomain()}/${label}`]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (run("launchctl", ["print", `${launchDomain()}/${label}`]).status !== 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

async function buildRuntimeFromCheckout() {
  const builder = join(packageRoot, "build", "build-runtime.mjs");
  if (!(await exists(builder))) return;
  runOrThrow(process.execPath, [builder], { stdio: "inherit" });
}

function safeVersion(version) {
  return String(version).replaceAll(/[^a-zA-Z0-9._-]/g, "-");
}

async function readCurrentVersion(root) {
  const marker = join(root, "current.json");
  if (!(await exists(marker))) return null;
  try {
    const value = JSON.parse(await readFile(marker, "utf8"));
    return typeof value.version === "string" && /^[a-zA-Z0-9._-]+$/.test(value.version)
      ? value.version
      : null;
  } catch {
    return null;
  }
}

async function stageRuntime(version) {
  await buildRuntimeFromCheckout();
  const source = join(packageRoot, "runtime");
  if (!(await exists(join(source, "feeder.js")))) {
    throw new Error("the CommandThing package does not contain runtime assets");
  }

  const { runtimeRoot } = locations();
  const versionName = safeVersion(version);
  const destination = join(runtimeRoot, versionName);
  const temporary = join(runtimeRoot, `.install-${process.pid}`);
  const backup = join(runtimeRoot, `.rollback-${process.pid}`);
  await mkdir(runtimeRoot, { recursive: true });
  await rm(temporary, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
  await cp(source, temporary, { recursive: true });
  const replacedExisting = await exists(destination);
  return { backup, destination, replacedExisting, temporary, versionName };
}

async function writeAtomic(path, contents, mode) {
  const temporary = `${path}.commandthing.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, contents, "utf8");
  if (mode != null) await chmod(temporary, mode);
  await rename(temporary, path);
}

async function installSupportFiles() {
  const { nodeLauncherPath, serviceRunnerPath } = locations();
  await mkdir(dirname(nodeLauncherPath), { recursive: true });
  const nodeLauncher = await readFile(join(packageRoot, "templates", "commandthing-node.sh"), "utf8");
  const serviceRunner = await readFile(join(packageRoot, "templates", "service-runner.mjs"), "utf8");
  await writeAtomic(nodeLauncherPath, nodeLauncher, 0o755);
  await writeAtomic(serviceRunnerPath, serviceRunner, 0o755);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function installLocalCli(versionName) {
  const { cliLauncherPath, cliRoot, nodeLauncherPath } = locations();
  const destination = join(cliRoot, versionName);
  if (resolve(packageRoot) !== resolve(destination)) {
    const temporary = join(cliRoot, `.install-${process.pid}`);
    const backup = join(cliRoot, `.rollback-${process.pid}`);
    await mkdir(cliRoot, { recursive: true });
    await rm(temporary, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    for (const entry of ["bin", "src", "templates", "runtime"]) {
      await cp(join(packageRoot, entry), join(temporary, entry), { recursive: true });
    }
    await copyFile(join(packageRoot, "package.json"), join(temporary, "package.json"));
    const replacing = await exists(destination);
    if (replacing) await rename(destination, backup);
    try {
      await rename(temporary, destination);
      await rm(backup, { recursive: true, force: true });
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      if (replacing && (await exists(backup))) await rename(backup, destination);
      throw error;
    }
  }
  const localBin = join(destination, "bin", "commandthing.js");
  const launcher = `#!/bin/sh\nexec /bin/sh ${shellQuote(nodeLauncherPath)} ${shellQuote(process.execPath)} ${shellQuote(localBin)} "$@"\n`;
  await writeAtomic(cliLauncherPath, launcher, 0o755);
  await writeAtomic(join(cliRoot, "current.json"), `${JSON.stringify({ version: versionName })}\n`, 0o644);
}

async function pruneVersions(root, retained) {
  if (!(await exists(root))) return;
  const keep = new Set(retained.filter(Boolean));
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !keep.has(entry.name))
      .map((entry) => rm(join(root, entry.name), { recursive: true, force: true })),
  );
}

async function currentRuntimePath() {
  const { runtimeRoot } = locations();
  const marker = join(runtimeRoot, "current.json");
  const version = await readCurrentVersion(runtimeRoot);
  if (!version)
    throw new Error(`runtime is not installed or has an invalid marker; run commandthing setup (${marker})`);
  const runtimeDir = join(runtimeRoot, version);
  if (!(await exists(runtimeDir))) throw new Error(`installed runtime is missing: ${runtimeDir}`);
  return runtimeDir;
}

export async function runRuntimeTool(name, args) {
  const runtimeDir = await currentRuntimePath();
  const tool = join(runtimeDir, `${name}.js`);
  if (!(await exists(tool))) throw new Error(`${name} is not included in the installed runtime`);
  const result = spawnSync(process.execPath, [tool, ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

/**
 * Stage and boot a new installation. The caller must commit after hooks and health checks pass,
 * or roll back on any error.
 */
export async function installServices(version) {
  requireMacOS();
  const config = readConfigFileSync(locations().configPath);
  if (
    config.server.host !== "127.0.0.1" &&
    config.server.host !== "localhost" &&
    config.server.host !== "::1"
  ) {
    console.warn(
      `! feeder is configured for ${config.server.host}; local network clients may reach its unauthenticated API`,
    );
  }

  const adb = executable("adb", [join(homedir(), "Library", "Android", "sdk", "platform-tools", "adb")]);
  const previousRuntimeVersion = await readCurrentVersion(locations().runtimeRoot);
  const previousPlists = new Map();
  const previouslyLoaded = new Set();
  for (const label of LABELS) {
    const path = agentPath(label);
    previousPlists.set(label, (await exists(path)) ? await readFile(path, "utf8") : null);
    if (serviceLoaded(label)) previouslyLoaded.add(label);
  }

  const staged = await stageRuntime(version);
  await installSupportFiles();
  const { homeDir, logsDir, nodeLauncherPath, serviceRunnerPath } = locations();
  await mkdir(launchAgentsDir(), { recursive: true });
  await mkdir(logsDir, { recursive: true });

  const pathParts = [
    dirname(process.execPath),
    adb ? dirname(adb) : null,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].filter(Boolean);
  const pathValue = [...new Set(pathParts)].join(":");
  const tools = {
    "com.commandthing.feeder": join(staged.destination, "feeder.js"),
    "com.commandthing.tunnel": join(staged.destination, "tunnel.js"),
  };
  const temporaryPlists = new Map();
  try {
    for (const label of LABELS) {
      const temporaryPath = `${agentPath(label)}.commandthing.tmp`;
      const applicationLog = join(logsDir, `${label}.log`);
      const program = [
        "/bin/sh",
        nodeLauncherPath,
        process.execPath,
        serviceRunnerPath,
        tools[label],
        applicationLog,
      ];
      await writeFile(
        temporaryPath,
        launchAgentPlist({
          label,
          program,
          homeDir,
          pathValue,
        }),
        "utf8",
      );
      runOrThrow("plutil", ["-lint", temporaryPath]);
      temporaryPlists.set(label, temporaryPath);
    }
  } catch (error) {
    for (const path of temporaryPlists.values()) await unlink(path).catch(() => {});
    await rm(staged.temporary, { recursive: true, force: true });
    throw error;
  }

  let finished = false;
  let runtimeSwitched = false;
  const rollback = async () => {
    if (finished) return;
    finished = true;
    for (const label of LABELS) stopLabel(label);
    for (const label of LABELS) {
      const previous = previousPlists.get(label);
      if (previous == null) await unlink(agentPath(label)).catch(() => {});
      else await writeAtomic(agentPath(label), previous, 0o644);
    }
    const marker = join(locations().runtimeRoot, "current.json");
    if (previousRuntimeVersion) {
      await writeAtomic(marker, `${JSON.stringify({ version: previousRuntimeVersion })}\n`, 0o644);
    } else {
      await unlink(marker).catch(() => {});
    }
    await rm(staged.temporary, { recursive: true, force: true });
    if (runtimeSwitched) await rm(staged.destination, { recursive: true, force: true });
    if (staged.replacedExisting && (await exists(staged.backup))) {
      await rename(staged.backup, staged.destination);
    }
    for (const label of previouslyLoaded) {
      if (await exists(agentPath(label))) {
        run("launchctl", ["bootstrap", launchDomain(), agentPath(label)]);
        run("launchctl", ["enable", `${launchDomain()}/${label}`]);
      }
    }
  };

  try {
    for (const label of LABELS) stopLabel(label);
    if (staged.replacedExisting) await rename(staged.destination, staged.backup);
    await rename(staged.temporary, staged.destination);
    runtimeSwitched = true;
    for (const label of LABELS) await rename(temporaryPlists.get(label), agentPath(label));
    for (const label of LABELS) {
      runOrThrow("launchctl", ["bootstrap", launchDomain(), agentPath(label)]);
      run("launchctl", ["enable", `${launchDomain()}/${label}`]);
    }
  } catch (error) {
    await rollback();
    throw error;
  } finally {
    for (const path of temporaryPlists.values()) await unlink(path).catch(() => {});
  }

  if (!adb)
    console.warn("! adb was not found; the feeder will run, but the device tunnel cannot connect yet");

  return {
    runtimeDir: staged.destination,
    rollback,
    commit: async () => {
      if (finished) return;
      const marker = join(locations().runtimeRoot, "current.json");
      await writeAtomic(marker, `${JSON.stringify({ version: staged.versionName })}\n`, 0o644);
      await pruneVersions(locations().runtimeRoot, [staged.versionName, previousRuntimeVersion]);
      await pruneVersions(locations().cliRoot, [staged.versionName, previousRuntimeVersion]);
      await installLocalCli(staged.versionName);
      await rm(staged.backup, { recursive: true, force: true });
      finished = true;
    },
  };
}

export function startServices() {
  requireMacOS();
  for (const label of LABELS) {
    const path = agentPath(label);
    if (!existsSync(path)) {
      throw new Error(`services are not installed; run commandthing setup first (${path} is missing)`);
    }
    if (!serviceLoaded(label)) runOrThrow("launchctl", ["bootstrap", launchDomain(), path]);
    else runOrThrow("launchctl", ["kickstart", "-k", `${launchDomain()}/${label}`]);
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
  const config = readConfigFileSync(locations().configPath);
  return `http://localhost:${config.server.port}`;
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`feeder did not become healthy at ${url}; run commandthing logs`);
}

export async function statusServices() {
  requireMacOS();
  const { nodeLauncherPath, serviceRunnerPath } = locations();
  let healthy = true;
  for (const label of LABELS) {
    const running = serviceRunning(label);
    console.log(`${running ? "✓" : "!"} ${basename(label)}: ${running ? "running" : "stopped"}`);
    healthy &&= running;
  }
  for (const [label, path] of [
    ["Node launcher", nodeLauncherPath],
    ["Service runner", serviceRunnerPath],
  ]) {
    const present = await exists(path);
    console.log(`${present ? "✓" : "!"} ${label}: ${path}`);
    healthy &&= present;
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
  if (removeRuntime) {
    const { cliLauncherPath, cliRoot, nodeLauncherPath, runtimeRoot, serviceRunnerPath } = locations();
    await rm(runtimeRoot, { recursive: true, force: true });
    await rm(cliRoot, { recursive: true, force: true });
    await Promise.all(
      [cliLauncherPath, nodeLauncherPath, serviceRunnerPath].map((path) => unlink(path).catch(() => {})),
    );
  }
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
