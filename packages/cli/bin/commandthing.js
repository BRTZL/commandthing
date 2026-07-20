#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  doctor,
  forwardHook,
  initConfig,
  printConfigPath,
  removeHooks,
  setupHooks,
  showConfig,
} from "../src/commands.js";
import {
  followLogs,
  installServices,
  purgeHome,
  restartServices,
  runRuntimeTool,
  startServices,
  statusServices,
  stopServices,
  uninstallServices,
  waitForHealthyFeeder,
} from "../src/services.js";

const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function flag(name) {
  return args.includes(name);
}

function help() {
  console.log(`CommandThing ${packageJson.version}

Usage:
  commandthing setup [--skip-hooks]            Install and start CommandThing
  commandthing setup hooks [--feeder-url URL]  Install only Claude Code hooks
  commandthing remove hooks                   Remove CommandThing hooks
  commandthing start                          Start background services
  commandthing stop                           Stop background services
  commandthing restart                        Restart background services
  commandthing status                         Show service and dashboard status
  commandthing logs                           Follow feeder and tunnel logs
  commandthing device <command>               Inspect or control the connected device
  commandthing diagnostics <command>          Run advanced device diagnostics
  commandthing uninstall [--purge]            Remove services; optionally delete all data
  commandthing config init                    Create the user config file
  commandthing config show                    Print the user config
  commandthing config path                    Print the config file location
  commandthing hook                           Forward one hook payload from stdin
  commandthing doctor                         Check local requirements
  commandthing --version                      Print the CLI version
  commandthing --help                         Show this help

Until the npm package is published, contributors can run the same commands with:
  pnpm commandthing <command>`);
}

async function main() {
  const [command, rawTarget] = args;
  const target = rawTarget?.startsWith("--") ? undefined : rawTarget;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    help();
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(packageJson.version);
    return;
  }
  if (command === "setup" && target === "hooks") {
    await setupHooks({ feederUrl: option("--feeder-url") });
    return;
  }
  if (command === "setup" && !target) {
    await initConfig({ quiet: true });
    const runtimeDir = await installServices(packageJson.version);
    if (!flag("--skip-hooks")) await setupHooks({ feederUrl: option("--feeder-url") });
    const feederUrl = await waitForHealthyFeeder();
    console.log(`CommandThing ${packageJson.version} is ready`);
    console.log(`Runtime: ${runtimeDir}`);
    console.log(`Dashboard: ${feederUrl}`);
    return;
  }
  if (command === "remove" && target === "hooks") {
    await removeHooks();
    return;
  }
  if (command === "config" && target === "init") {
    await initConfig();
    return;
  }
  if (command === "config" && target === "show") {
    await showConfig();
    return;
  }
  if (command === "config" && target === "path") {
    printConfigPath();
    return;
  }
  if (command === "start") {
    startServices();
    await waitForHealthyFeeder();
    return;
  }
  if (command === "stop") {
    stopServices();
    return;
  }
  if (command === "restart") {
    restartServices();
    await waitForHealthyFeeder();
    return;
  }
  if (command === "status") {
    await statusServices();
    return;
  }
  if (command === "logs") {
    await followLogs();
    return;
  }
  if (command === "device") {
    await runRuntimeTool("device", args.slice(1));
    return;
  }
  if (command === "diagnostics") {
    await runRuntimeTool("diagnostics", args.slice(1));
    return;
  }
  if (command === "uninstall") {
    await uninstallServices();
    await removeHooks();
    if (flag("--purge")) await purgeHome();
    else console.log("Config, logs, screenshots, and backups were kept; use --purge to remove them");
    return;
  }
  if (command === "hook") {
    await forwardHook();
    return;
  }
  if (command === "doctor") {
    await doctor();
    return;
  }
  throw new Error(`unknown command: ${args.join(" ")}\nRun commandthing --help for usage.`);
}

main().catch((error) => {
  console.error(`commandthing: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
