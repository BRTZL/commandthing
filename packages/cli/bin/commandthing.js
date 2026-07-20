#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { doctor, forwardHook, removeHooks, setupHooks } from "../src/commands.js";

const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function help() {
  console.log(`CommandThing ${packageJson.version}

Usage:
  commandthing setup hooks [--feeder-url URL]  Install Claude Code hooks
  commandthing remove hooks                  Remove CommandThing hooks
  commandthing hook                          Forward one hook payload from stdin
  commandthing doctor                        Check local requirements
  commandthing --version                     Print the CLI version
  commandthing --help                        Show this help

Until the npm package is published, contributors can run the same commands with:
  pnpm commandthing <command>`);
}

async function main() {
  const [command, target] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    help();
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(packageJson.version);
    return;
  }
  if (command === "setup" && (!target || target === "hooks")) {
    await setupHooks({ feederUrl: option("--feeder-url", "http://localhost:4000") });
    return;
  }
  if (command === "remove" && target === "hooks") {
    await removeHooks();
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
