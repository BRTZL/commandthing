import { homedir } from "node:os";
import { join } from "node:path";
import { readConfigFileSync } from "../../../packages/cli/src/config.js";

const configRoot = process.env.COMMANDTHING_HOME?.trim() || join(homedir(), ".commandthing");

export const configPath = process.env.COMMANDTHING_CONFIG?.trim() || join(configRoot, "config.json");

export const config = readConfigFileSync(configPath);
