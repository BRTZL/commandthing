import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const commandThingHome =
  process.env.COMMANDTHING_HOME?.trim() ||
  join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "commandthing");

export const logDir = join(commandThingHome, "logs");
export const screenshotDir = join(commandThingHome, "screenshots");

export function ensureUserDirectories(): void {
  mkdirSync(logDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });
}
