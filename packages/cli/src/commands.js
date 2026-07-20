import { spawnSync } from "node:child_process";
import { access, chmod, copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "Notification",
  "SessionStart",
  "SessionEnd",
];

const DEFAULT_CONFIG = {
  server: { host: "0.0.0.0", port: 4000 },
  openUsage: { url: "http://localhost:6736/v1/usage", refreshMs: 30_000 },
  refresh: { sessionsMs: 2000, mediaMs: 1000 },
};

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function locations() {
  const stateDir =
    process.env.COMMANDTHING_HOME ||
    join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "commandthing");
  return {
    stateDir,
    configPath: process.env.COMMANDTHING_CONFIG || join(stateDir, "config.json"),
    forwarderPath: join(stateDir, "bin", "commandthing-hook.mjs"),
    settingsPath: process.env.COMMANDTHING_CLAUDE_SETTINGS || join(homedir(), ".claude", "settings.json"),
  };
}

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

async function readUserConfig() {
  const { configPath } = locations();
  if (!(await exists(configPath))) await initConfig({ quiet: true });
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${configPath}; fix its JSON before continuing (${error.message})`);
  }
}

async function configuredFeederUrl() {
  const userConfig = await readUserConfig();
  const port = Number(userConfig?.server?.port ?? DEFAULT_CONFIG.server.port);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("server.port in the CommandThing config must be a positive integer");
  }
  return `http://localhost:${port}`;
}

async function writeSettings(settingsPath, settings, stateDir) {
  await mkdir(dirname(settingsPath), { recursive: true });
  if (await exists(settingsPath)) {
    const backupDir = join(stateDir, "backups");
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    await copyFile(settingsPath, join(backupDir, `claude-settings-${stamp}.json`));
  }
  const temporaryPath = `${settingsPath}.commandthing.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
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
  const { stateDir, forwarderPath, settingsPath } = locations();
  await initConfig({ quiet: true });
  const normalizedUrl = validateFeederUrl(feederUrl || (await configuredFeederUrl()));
  const templatePath = join(packageRoot, "templates", "commandthing-hook.mjs");
  const template = await readFile(templatePath, "utf8");

  await mkdir(dirname(forwarderPath), { recursive: true });
  await writeFile(
    forwarderPath,
    template.replace("__COMMANDTHING_FEEDER_URL__", JSON.stringify(normalizedUrl)),
    "utf8",
  );
  await chmod(forwarderPath, 0o755);

  const settings = await readSettings(settingsPath);
  const hooks = settings.hooks && typeof settings.hooks === "object" ? { ...settings.hooks } : {};
  const command = shellQuote(forwarderPath);
  for (const event of HOOK_EVENTS) {
    hooks[event] = [...withoutCommandThingHooks(hooks[event]), { hooks: [{ type: "command", command }] }];
  }
  await writeSettings(settingsPath, { ...settings, hooks }, stateDir);

  console.log(`CommandThing hooks installed in ${settingsPath}`);
  console.log(`Hook forwarder: ${forwarderPath}`);
  console.log(`Feeder URL: ${normalizedUrl}`);
}

export async function initConfig({ quiet = false } = {}) {
  const { configPath, stateDir } = locations();
  await mkdir(stateDir, { recursive: true });
  await mkdir(dirname(configPath), { recursive: true });
  if (!(await exists(configPath))) {
    await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
    if (!quiet) console.log(`CommandThing config created at ${configPath}`);
  } else if (!quiet) {
    console.log(`CommandThing config already exists at ${configPath}`);
  }
}

export async function showConfig() {
  const { configPath } = locations();
  if (!(await exists(configPath))) await initConfig({ quiet: true });
  console.log(await readFile(configPath, "utf8"));
}

export function printConfigPath() {
  console.log(locations().configPath);
}

export async function removeHooks() {
  const { forwarderPath, settingsPath, stateDir } = locations();
  if (!(await exists(settingsPath))) {
    console.log(`No Claude settings found at ${settingsPath}`);
    return;
  }
  const settings = await readSettings(settingsPath);
  const hooks = settings.hooks && typeof settings.hooks === "object" ? { ...settings.hooks } : {};
  for (const event of Object.keys(hooks)) {
    const remaining = withoutCommandThingHooks(hooks[event]);
    if (remaining.length > 0) hooks[event] = remaining;
    else delete hooks[event];
  }
  await writeSettings(settingsPath, { ...settings, hooks }, stateDir);
  await unlink(forwarderPath).catch(() => {});
  console.log(`CommandThing hooks removed from ${settingsPath}`);
}

export async function forwardHook() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const feederUrl = validateFeederUrl(
    process.env.COMMANDTHING_FEEDER_URL || process.env.CARTHING_FEEDER || (await configuredFeederUrl()),
  );
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
  const { configPath, forwarderPath, settingsPath } = locations();
  const checks = [
    ["Node.js", process.version, true],
    ["Bun", commandVersion("bun"), Boolean(commandVersion("bun"))],
    ["adb", commandVersion("adb", ["version"]), Boolean(commandVersion("adb", ["version"]))],
    ["Claude settings", settingsPath, await exists(settingsPath)],
    ["CommandThing config", configPath, await exists(configPath)],
    ["CommandThing hooks", forwarderPath, await exists(forwarderPath)],
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
