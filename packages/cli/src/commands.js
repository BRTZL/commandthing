import { spawnSync } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfigFileSync, serializeDefaultConfig } from "./config.js";
import { locations } from "./locations.js";

const CLAUDE_HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "Notification",
  "SessionStart",
  "SessionEnd",
];
const CODEX_HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "Stop",
  "SessionStart",
];

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
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

function validateFeederUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid feeder URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("the feeder URL must use http or https");
  }
  return url.origin;
}

export async function setupHooks({ feederUrl }) {
  const { codexHooksPath, homeDir, forwarderPath, settingsPath } = locations();
  await initConfig({ quiet: true });
  const normalizedUrl = validateFeederUrl(feederUrl || (await configuredFeederUrl()));
  const templatePath = join(packageRoot, "templates", "commandthing-hook.mjs");
  const template = await readFile(templatePath, "utf8");
  const originalSettings = (await exists(settingsPath)) ? await readFile(settingsPath, "utf8") : null;
  const originalCodexHooks = (await exists(codexHooksPath)) ? await readFile(codexHooksPath, "utf8") : null;
  const originalForwarder = (await exists(forwarderPath)) ? await readFile(forwarderPath, "utf8") : null;

  const settings = await readSettings(settingsPath);
  const hooks = settings.hooks && typeof settings.hooks === "object" ? { ...settings.hooks } : {};
  const command = shellQuote(forwarderPath);
  for (const event of CLAUDE_HOOK_EVENTS) {
    hooks[event] = [...withoutCommandThingHooks(hooks[event]), { hooks: [{ type: "command", command }] }];
  }
  const nextSettings = { ...settings, hooks };
  const codexConfig = await readCodexHooks(codexHooksPath);
  const codexHooks =
    codexConfig.hooks && typeof codexConfig.hooks === "object" ? { ...codexConfig.hooks } : {};
  for (const event of CODEX_HOOK_EVENTS) {
    codexHooks[event] = [
      ...withoutCommandThingHooks(codexHooks[event]),
      { hooks: [{ type: "command", command, timeout: 2 }] },
    ];
  }
  const nextCodexConfig = { ...codexConfig, hooks: codexHooks };
  const forwarder = template.replace("__COMMANDTHING_FEEDER_URL__", JSON.stringify(normalizedUrl));
  await mkdir(dirname(forwarderPath), { recursive: true });
  const temporaryForwarder = `${forwarderPath}.tmp`;
  await writeFile(temporaryForwarder, forwarder, "utf8");
  await chmod(temporaryForwarder, 0o755);
  const rollback = async () => {
    if (originalSettings == null) await unlink(settingsPath).catch(() => {});
    else await writeAtomicText(settingsPath, originalSettings, 0o644);
    if (originalCodexHooks == null) await unlink(codexHooksPath).catch(() => {});
    else await writeAtomicText(codexHooksPath, originalCodexHooks, 0o644);
    if (originalForwarder == null) await unlink(forwarderPath).catch(() => {});
    else await writeAtomicText(forwarderPath, originalForwarder, 0o755);
  };
  try {
    await writeSettings(settingsPath, nextSettings, homeDir);
    await writeCodexHooks(codexHooksPath, nextCodexConfig, homeDir);
    await rename(temporaryForwarder, forwarderPath);
  } catch (error) {
    await rollback();
    throw error;
  }

  console.log(`CommandThing hooks installed in ${settingsPath}`);
  console.log(`CommandThing hooks installed in ${codexHooksPath}`);
  console.log(`Hook forwarder: ${forwarderPath}`);
  console.log(`Feeder URL: ${normalizedUrl}`);
  return { rollback };
}

async function writeAtomicText(path, contents, mode) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await chmod(temporary, mode);
  await rename(temporary, path);
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

export async function forwardHook() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const feederUrl = validateFeederUrl(process.env.COMMANDTHING_FEEDER_URL || (await configuredFeederUrl()));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    await fetch(new URL("/hook", feederUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.concat(chunks),
      signal: controller.signal,
    });
  } catch {
    // Hooks must never block Claude Code if CommandThing is not running.
  } finally {
    clearTimeout(timer);
  }
}

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split("\n")[0] : null;
}

export async function doctor() {
  const { codexHooksPath, configPath, forwarderPath, nodeLauncherPath, serviceRunnerPath, settingsPath } =
    locations();
  const nodeSupported = Number(process.versions.node.split(".")[0]) >= 22;
  let configValid = false;
  let configDetail = configPath;
  try {
    readConfigFileSync(configPath);
    configValid = await exists(configPath);
  } catch (error) {
    configDetail = error instanceof Error ? error.message : String(error);
  }
  const checks = [
    ["Node.js 22+", process.version, nodeSupported],
    ["adb", commandVersion("adb", ["version"]), Boolean(commandVersion("adb", ["version"]))],
    ["Claude settings", settingsPath, await exists(settingsPath)],
    ["Codex hooks", codexHooksPath, await exists(codexHooksPath)],
    ["CommandThing config", configDetail, configValid],
    ["CommandThing hooks", forwarderPath, await exists(forwarderPath)],
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
