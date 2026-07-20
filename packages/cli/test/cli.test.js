import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../src/config.js";
import { launchAgentPlist } from "../src/services.js";

const cliPath = fileURLToPath(new URL("../bin/commandthing.js", import.meta.url));
const serviceRunnerPath = fileURLToPath(new URL("../templates/service-runner.mjs", import.meta.url));
const events = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "Notification",
  "SessionStart",
  "SessionEnd",
];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "commandthing-cli-"));
  const settingsPath = join(root, "claude", "settings.json");
  const stateDir = join(root, "state");
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(
    settingsPath,
    `${JSON.stringify({ theme: "dark", hooks: { Stop: [{ hooks: [{ type: "command", command: "keep-me" }] }] } })}\n`,
  );
  return { root, settingsPath, stateDir };
}

function run(args, paths) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      COMMANDTHING_HOME: paths.stateDir,
      COMMANDTHING_CLAUDE_SETTINGS: paths.settingsPath,
    },
  });
}

test("hook setup is idempotent and removal preserves unrelated settings", async () => {
  const paths = await fixture();
  try {
    assert.equal(run(["setup", "hooks"], paths).status, 0);
    assert.equal(run(["setup", "hooks"], paths).status, 0);

    const installed = JSON.parse(await readFile(paths.settingsPath, "utf8"));
    const config = JSON.parse(await readFile(join(paths.stateDir, "config.json"), "utf8"));
    assert.equal(config.server.host, "127.0.0.1");
    assert.equal(config.server.port, 4000);
    assert.equal(installed.theme, "dark");
    assert.deepEqual(Object.keys(installed.hooks).sort(), [...events].sort());
    for (const event of events) {
      const commands = installed.hooks[event].flatMap((entry) => entry.hooks.map((hook) => hook.command));
      assert.equal(commands.filter((command) => command.includes("commandthing-hook.mjs")).length, 1);
    }
    assert.equal(installed.hooks.Stop[0].hooks[0].command, "keep-me");

    assert.equal(run(["remove", "hooks"], paths).status, 0);
    const removed = JSON.parse(await readFile(paths.settingsPath, "utf8"));
    assert.equal(removed.theme, "dark");
    assert.deepEqual(removed.hooks, { Stop: [{ hooks: [{ type: "command", command: "keep-me" }] }] });
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("CLI rejects unknown options and missing option values", async () => {
  const paths = await fixture();
  try {
    const unknown = run(["setup", "hooks", "--feader-url", "http://localhost:4000"], paths);
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /unknown option: --feader-url/);

    const missing = run(["setup", "hooks", "--feeder-url", "--wrong"], paths);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--feeder-url requires a value/);

    const extra = run(["status", "unexpected"], paths);
    assert.notEqual(extra.status, 0);
    assert.match(extra.stderr, /status does not accept arguments/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("config validation rejects typos, unsafe shapes, and invalid ports", () => {
  assert.equal(parseConfig({}).server.host, "127.0.0.1");
  assert.throws(() => parseConfig({ server: { hsot: "localhost" } }), /unknown field: hsot/);
  assert.throws(() => parseConfig({ server: { port: 70_000 } }), /between 1 and 65535/);
  assert.throws(() => parseConfig({ openUsage: { url: "file:///tmp/usage" } }), /must use http or https/);
});

test("launch agent plists preserve every launcher argument and escape XML", () => {
  const result = launchAgentPlist({
    label: "com.commandthing.test",
    program: ["/bin/sh", "/tmp/a&b.sh", "/tmp/runtime.js"],
    homeDir: "/tmp/commandthing",
    pathValue: "/usr/bin:/bin",
  });
  assert.match(result, /<string>\/bin\/sh<\/string>/);
  assert.match(result, /<string>\/tmp\/a&amp;b\.sh<\/string>/);
  assert.match(result, /<string>\/tmp\/runtime\.js<\/string>/);
  assert.match(result, /<string>\/dev\/null<\/string>/);
});

test("Claude settings backups are retained only when settings change and are capped", async () => {
  const paths = await fixture();
  try {
    for (let index = 0; index < 7; index += 1) {
      const settings = JSON.parse(await readFile(paths.settingsPath, "utf8"));
      await writeFile(paths.settingsPath, `${JSON.stringify({ ...settings, revision: index })}\n`);
      assert.equal(run(["setup", "hooks"], paths).status, 0);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const backups = await readdir(join(paths.stateDir, "backups"));
    assert.equal(backups.filter((name) => name.startsWith("claude-settings-")).length, 5);
    await writeFile(join(paths.stateDir, "backups", "claude-settings-2000-extra-a.json"), "{}\n");
    await writeFile(join(paths.stateDir, "backups", "claude-settings-2000-extra-b.json"), "{}\n");
    assert.equal(run(["setup", "hooks"], paths).status, 0);
    const afterIdempotentRun = await readdir(join(paths.stateDir, "backups"));
    assert.equal(afterIdempotentRun.length, 5);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("hook setup rejects non-http feeder URLs", async () => {
  const paths = await fixture();
  try {
    const result = run(["setup", "hooks", "--feeder-url", "file:///tmp/socket"], paths);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must use http or https/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("hook setup uses the configured feeder port", async () => {
  const paths = await fixture();
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(join(paths.stateDir, "config.json"), '{"server":{"port":4321}}\n');
    assert.equal(run(["setup", "hooks"], paths).status, 0);

    const forwarder = await readFile(join(paths.stateDir, "bin", "commandthing-hook.mjs"), "utf8");
    assert.match(forwarder, /http:\/\/localhost:4321/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("the default application home is ~/.commandthing", async () => {
  const paths = await fixture();
  try {
    const env = { ...process.env, HOME: paths.root };
    delete env.COMMANDTHING_HOME;
    delete env.COMMANDTHING_CONFIG;
    const result = spawnSync(process.execPath, [cliPath, "config", "path"], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), join(paths.root, ".commandthing", "config.json"));
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("device commands are dispatched through the installed runtime", async () => {
  const paths = await fixture();
  try {
    const runtimeRoot = join(paths.stateDir, "runtime");
    const runtimeDir = join(runtimeRoot, "test-version");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(join(runtimeRoot, "current.json"), '{"version":"test-version"}\n');
    await writeFile(
      join(runtimeDir, "device.js"),
      'console.log("runtime-device:" + process.argv.slice(2).join(","));\n',
    );
    const result = run(["device", "info"], paths);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /runtime-device:info/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("service runner rotates logs without dropping child output", async () => {
  const paths = await fixture();
  try {
    const tool = join(paths.root, "noisy-service.mjs");
    const log = join(paths.root, "service.log");
    await writeFile(tool, 'process.stdout.write("x".repeat(6 * 1024 * 1024));\n');
    const result = spawnSync(process.execPath, [serviceRunnerPath, tool, log], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const activeSize = (await stat(log)).size;
    const rotatedSize = (await stat(`${log}.1`)).size;
    assert.equal(activeSize + rotatedSize, 6 * 1024 * 1024);
    assert.ok(rotatedSize <= 5 * 1024 * 1024);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
