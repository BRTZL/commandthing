import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readConfigFileSync, serializeDefaultConfig } from "./config.js";
import { locations } from "./locations.js";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isCommandThingHook(hook) {
  if (!hook || typeof hook !== "object") return false;
  const command = typeof hook.command === "string" ? hook.command : "";
  return command.includes("commandthing-hook.mjs") || /(^|\s)commandthing(\s|$).*\shook/.test(command);
}

function withoutCommandThingHooks(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) return entry;
      return { ...entry, hooks: entry.hooks.filter((hook) => !isCommandThingHook(hook)) };
    })
    .filter(
      (entry) => !entry || typeof entry !== "object" || !Array.isArray(entry.hooks) || entry.hooks.length > 0,
    );
}

async function readSettings(settingsPath) {
  if (!(await exists(settingsPath))) return {};
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${settingsPath}; fix its JSON before running setup (${error.message})`);
  }
}

async function readCodexHooks(codexHooksPath) {
  if (!(await exists(codexHooksPath))) return {};
  try {
    return JSON.parse(await readFile(codexHooksPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${codexHooksPath}; fix its JSON before running setup (${error.message})`);
  }
}

async function readUserConfig() {
  const { configPath } = locations();
  if (!(await exists(configPath))) await initConfig({ quiet: true });
  return readConfigFileSync(configPath);
}

async function configuredFeederUrl() {
  const userConfig = await readUserConfig();
  const port = userConfig.server.port;
  return `http://localhost:${port}`;
}

async function writeSettings(settingsPath, settings, homeDir) {
  return writeBackedUpJson(settingsPath, settings, homeDir, "claude-settings");
}

async function writeCodexHooks(codexHooksPath, hooks, homeDir) {
  return writeBackedUpJson(codexHooksPath, hooks, homeDir, "codex-hooks");
}

async function writeBackedUpJson(path, value, homeDir, backupPrefix) {
  await mkdir(dirname(path), { recursive: true });
  const output = `${JSON.stringify(value, null, 2)}\n`;
  await pruneJsonBackups(homeDir, backupPrefix);
  if ((await exists(path)) && (await readFile(path, "utf8")) === output) return false;
  if (await exists(path)) {
    const backupDir = join(homeDir, "backups");
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    await copyFile(path, join(backupDir, `${backupPrefix}-${stamp}.json`));
    await pruneJsonBackups(homeDir, backupPrefix);
  }
  const temporaryPath = `${path}.commandthing.tmp`;
  await writeFile(temporaryPath, output, "utf8");
  await rename(temporaryPath, path);
  return true;
}

async function pruneJsonBackups(homeDir, backupPrefix) {
  const backupDir = join(homeDir, "backups");
  if (!(await exists(backupDir))) return;
  const backups = (await readdir(backupDir))
    .filter((name) => name.startsWith(`${backupPrefix}-`) && name.endsWith(".json"))
    .sort()
    .reverse();
  await Promise.all(backups.slice(5).map((name) => unlink(join(backupDir, name)).catch(() => {})));
}

export async function initConfig({ quiet = false } = {}) {
  const { configPath, homeDir } = locations();
  await mkdir(homeDir, { recursive: true });
  await mkdir(dirname(configPath), { recursive: true });
  if (!(await exists(configPath))) {
    await writeFile(configPath, serializeDefaultConfig(), "utf8");
    if (!quiet) console.log(`CommandThing config created at ${configPath}`);
  } else if (!quiet) {
    console.log(`CommandThing config already exists at ${configPath}`);
  }
}

export async function showConfig() {
  const { configPath } = locations();
  if (!(await exists(configPath))) await initConfig({ quiet: true });
  readConfigFileSync(configPath);
  console.log(await readFile(configPath, "utf8"));
}

export function printConfigPath() {
  console.log(locations().configPath);
}

export async function removeHooks() {
  const { codexHooksPath, forwarderPath, settingsPath, homeDir } = locations();
  if (await exists(settingsPath)) {
    const settings = await readSettings(settingsPath);
    const hooks = settings.hooks && typeof settings.hooks === "object" ? { ...settings.hooks } : {};
    for (const event of Object.keys(hooks)) {
      const remaining = withoutCommandThingHooks(hooks[event]);
      if (remaining.length > 0) hooks[event] = remaining;
      else delete hooks[event];
    }
    await writeSettings(settingsPath, { ...settings, hooks }, homeDir);
    console.log(`CommandThing hooks removed from ${settingsPath}`);
  } else {
    console.log(`No Claude settings found at ${settingsPath}`);
  }

  if (await exists(codexHooksPath)) {
    const config = await readCodexHooks(codexHooksPath);
    const hooks = config.hooks && typeof config.hooks === "object" ? { ...config.hooks } : {};
    for (const event of Object.keys(hooks)) {
      const remaining = withoutCommandThingHooks(hooks[event]);
      if (remaining.length > 0) hooks[event] = remaining;
      else delete hooks[event];
    }
    await writeCodexHooks(codexHooksPath, { ...config, hooks }, homeDir);
    console.log(`CommandThing hooks removed from ${codexHooksPath}`);
  } else {
    console.log(`No Codex hooks found at ${codexHooksPath}`);
  }
  await unlink(forwarderPath).catch(() => {});
}

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split("\n")[0] : null;
}

export async function doctor() {
  const { configPath, nodeLauncherPath, serviceRunnerPath, t3DatabasePath } = locations();
  const nodeSupported = Number(process.versions.node.split(".")[0]) >= 26;
  let configValid = false;
  let configDetail = configPath;
  try {
    readConfigFileSync(configPath);
    configValid = await exists(configPath);
  } catch (error) {
    configDetail = error instanceof Error ? error.message : String(error);
  }
  const checks = [
    ["Node.js 26+", process.version, nodeSupported],
    ["adb", commandVersion("adb", ["version"]), Boolean(commandVersion("adb", ["version"]))],
    ["T3 Code database", t3DatabasePath, await exists(t3DatabasePath)],
    ["CommandThing config", configDetail, configValid],
    ["Node launcher", nodeLauncherPath, await exists(nodeLauncherPath)],
    ["Service runner", serviceRunnerPath, await exists(serviceRunnerPath)],
  ];
  const feederUrl = await configuredFeederUrl();
  try {
    const response = await fetch(new URL("/health", feederUrl), { signal: AbortSignal.timeout(1500) });
    checks.push(["Feeder", feederUrl, response.ok]);
  } catch {
    checks.push(["Feeder", feederUrl, false]);
  }
  for (const [label, detail, ok] of checks) {
    console.log(`${ok ? "✓" : "!"} ${label}${detail ? `: ${detail}` : ""}`);
  }
  if (checks.some(([, , ok]) => !ok)) process.exitCode = 1;
}
