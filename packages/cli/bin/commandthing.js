#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { doctor, initConfig, printConfigPath, removeHooks, showConfig } from "../src/commands.js";
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

function parseOptions(tokens, schema) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const [name, inlineValue] = token.split(/=(.*)/s, 2);
    const kind = schema[name];
    if (!kind) throw new Error(`unknown option: ${name}`);
    if (kind === "boolean") {
      if (inlineValue != null) throw new Error(`${name} does not accept a value`);
      options[name] = true;
      continue;
    }
    const value = inlineValue ?? tokens[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    options[name] = value;
    if (inlineValue == null) index += 1;
  }
  return { options, positionals };
}

function requireNoArguments(command, tokens) {
  if (tokens.length > 0) throw new Error(`${command} does not accept arguments: ${tokens.join(" ")}`);
}

function help() {
  console.log(`CommandThing ${packageJson.version}

Usage:
  commandthing setup                          Install and start CommandThing
  commandthing remove hooks                   Remove hooks left by older versions
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
  commandthing doctor                         Check local requirements
  commandthing --version                      Print the CLI version
  commandthing --help                         Show this help

From a source checkout, contributors can run:
  pnpm commandthing <command>`);
}

async function main() {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    requireNoArguments(command || "help", rest);
    help();
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    requireNoArguments(command, rest);
    console.log(packageJson.version);
    return;
  }
  if (command === "setup") {
    requireNoArguments("setup", rest);
    await initConfig({ quiet: true });
    const installation = await installServices(packageJson.version);
    try {
      const feederUrl = await waitForHealthyFeeder();
      await installation.commit();
      console.log(`CommandThing ${packageJson.version} is ready`);
      console.log(`Runtime: ${installation.runtimeDir}`);
      console.log(`Dashboard: ${feederUrl}`);
    } catch (error) {
      await installation.rollback();
      throw error;
    }
    await removeHooks();
    return;
  }
  if (command === "remove" && rest[0] === "hooks") {
    requireNoArguments("remove hooks", rest.slice(1));
    await removeHooks();
    return;
  }
  if (command === "config" && rest[0] === "init") {
    requireNoArguments("config init", rest.slice(1));
    await initConfig();
    return;
  }
  if (command === "config" && rest[0] === "show") {
    requireNoArguments("config show", rest.slice(1));
    await showConfig();
    return;
  }
  if (command === "config" && rest[0] === "path") {
    requireNoArguments("config path", rest.slice(1));
    printConfigPath();
    return;
  }
  if (command === "start") {
    requireNoArguments(command, rest);
    startServices();
    await waitForHealthyFeeder();
    return;
  }
  if (command === "stop") {
    requireNoArguments(command, rest);
    stopServices();
    return;
  }
  if (command === "restart") {
    requireNoArguments(command, rest);
    restartServices();
    await waitForHealthyFeeder();
    return;
  }
  if (command === "status") {
    requireNoArguments(command, rest);
    await statusServices();
    return;
  }
  if (command === "logs") {
    requireNoArguments(command, rest);
    await followLogs();
    return;
  }
  if (command === "device") {
    if (rest.length === 0) throw new Error("device requires a command");
    await runRuntimeTool("device", rest);
    return;
  }
  if (command === "diagnostics") {
    if (rest.length === 0) throw new Error("diagnostics requires a command");
    await runRuntimeTool("diagnostics", rest);
    return;
  }
  if (command === "uninstall") {
    const parsed = parseOptions(rest, { "--purge": "boolean" });
    if (parsed.positionals.length > 0)
      throw new Error(`unknown uninstall argument: ${parsed.positionals.join(" ")}`);
    await uninstallServices();
    await removeHooks();
    if (parsed.options["--purge"]) await purgeHome();
    else console.log("Config, logs, screenshots, and backups were kept; use --purge to remove them");
    return;
  }
  if (command === "doctor") {
    requireNoArguments(command, rest);
    await doctor();
    return;
  }
  throw new Error(`unknown command: ${args.join(" ")}\nRun commandthing --help for usage.`);
}

main().catch((error) => {
  console.error(`commandthing: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
