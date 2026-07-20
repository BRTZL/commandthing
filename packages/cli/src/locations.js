import { homedir } from "node:os";
import { join } from "node:path";

export function locations() {
  const homeDir = process.env.COMMANDTHING_HOME || join(homedir(), ".commandthing");
  return {
    homeDir,
    configPath: process.env.COMMANDTHING_CONFIG || join(homeDir, "config.json"),
    forwarderPath: join(homeDir, "bin", "commandthing-hook.mjs"),
    backupsDir: join(homeDir, "backups"),
    logsDir: join(homeDir, "logs"),
    runtimeRoot: join(homeDir, "runtime"),
    screenshotsDir: join(homeDir, "screenshots"),
    settingsPath: process.env.COMMANDTHING_CLAUDE_SETTINGS || join(homedir(), ".claude", "settings.json"),
  };
}
