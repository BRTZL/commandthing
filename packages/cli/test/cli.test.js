import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../bin/commandthing.js", import.meta.url));
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
