import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../src/config.js";
import { launchAgentPlist } from "../src/services.js";

const cliPath = fileURLToPath(new URL("../bin/commandthing.js", import.meta.url));
const serviceRunnerPath = fileURLToPath(new URL("../templates/service-runner.mjs", import.meta.url));
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "commandthing-cli-"));
  const settingsPath = join(root, "claude", "settings.json");
  const codexHooksPath = join(root, "codex", "hooks.json");
  const stateDir = join(root, "state");
  await mkdir(dirname(settingsPath), { recursive: true });
  await mkdir(dirname(codexHooksPath), { recursive: true });
  await writeFile(
    settingsPath,
    `${JSON.stringify({ theme: "dark", hooks: { Stop: [{ hooks: [{ type: "command", command: "keep-me" }] }] } })}\n`,
  );
  await writeFile(
    codexHooksPath,
    `${JSON.stringify({
      description: "personal hooks",
      hooks: { Stop: [{ hooks: [{ type: "command", command: "keep-codex" }] }] },
    })}\n`,
  );
  return { codexHooksPath, root, settingsPath, stateDir };
}

function run(args, paths) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      COMMANDTHING_HOME: paths.stateDir,
      COMMANDTHING_CLAUDE_SETTINGS: paths.settingsPath,
      COMMANDTHING_CODEX_HOOKS: paths.codexHooksPath,
    },
  });
}

const LEGACY_HOOK = { hooks: [{ type: "command", command: "'/x/bin/commandthing-hook.mjs'" }] };

test("hook removal cleans legacy entries and preserves unrelated settings", async () => {
  const paths = await fixture();
  try {
    const settings = JSON.parse(await readFile(paths.settingsPath, "utf8"));
    settings.hooks.Stop.push(LEGACY_HOOK);
    settings.hooks.SessionEnd = [LEGACY_HOOK];
    await writeFile(paths.settingsPath, JSON.stringify(settings));
    const codexHooks = JSON.parse(await readFile(paths.codexHooksPath, "utf8"));
    codexHooks.hooks.Stop.push(LEGACY_HOOK);
    await writeFile(paths.codexHooksPath, JSON.stringify(codexHooks));

    assert.equal(run(["remove", "hooks"], paths).status, 0);
    const removed = JSON.parse(await readFile(paths.settingsPath, "utf8"));
    assert.equal(removed.theme, "dark");
    assert.deepEqual(removed.hooks, { Stop: [{ hooks: [{ type: "command", command: "keep-me" }] }] });
    const removedCodex = JSON.parse(await readFile(paths.codexHooksPath, "utf8"));
    assert.equal(removedCodex.description, "personal hooks");
    assert.deepEqual(removedCodex.hooks, {
      Stop: [{ hooks: [{ type: "command", command: "keep-codex" }] }],
    });
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("CLI rejects unknown options and missing option values", async () => {
  const paths = await fixture();
  try {
    const unknown = run(["setup", "--nope"], paths);
    assert.notEqual(unknown.status, 0);

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
  // Background jobs get CPU/IO throttling and timer coalescing, which froze the
  // feeder for seconds and starved the adb relay the tunnel spawns.
  assert.match(result, /<key>ProcessType<\/key>\s*<string>Interactive<\/string>/);
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

test("service runner restarts an unhealthy child", async () => {
  const paths = await fixture();
  try {
    const tool = join(paths.root, "stuck-service.mjs");
    const log = join(paths.root, "service.log");
    await writeFile(tool, "setInterval(() => {}, 1000);\n");
    const result = spawnSync(process.execPath, [serviceRunnerPath, tool, log, "http://127.0.0.1:1/health"], {
      encoding: "utf8",
      timeout: 2000,
      env: {
        ...process.env,
        COMMANDTHING_WATCHDOG_INTERVAL_MS: "20",
        COMMANDTHING_WATCHDOG_TIMEOUT_MS: "20",
        COMMANDTHING_WATCHDOG_FAILURES: "2",
      },
    });
    assert.notEqual(result.status, 0, result.stderr);
    const contents = await readFile(log, "utf8");
    assert.match(contents, /health check 2\/2 failed/);
    assert.match(contents, /requesting a launchd restart/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
