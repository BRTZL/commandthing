import { homedir } from "node:os";
import { join } from "node:path";

export function locations() {
  const homeDir = process.env.COMMANDTHING_HOME || join(homedir(), ".commandthing");
  return {
    homeDir,
    binDir: join(homeDir, "bin"),
    cliRoot: join(homeDir, "cli"),
    cliLauncherPath: join(homeDir, "bin", "commandthing"),
    configPath: process.env.COMMANDTHING_CONFIG || join(homeDir, "config.json"),
    codexHooksPath: process.env.COMMANDTHING_CODEX_HOOKS || join(homedir(), ".codex", "hooks.json"),
    forwarderPath: join(homeDir, "bin", "commandthing-hook.mjs"),
    nodeLauncherPath: join(homeDir, "bin", "commandthing-node.sh"),
    serviceRunnerPath: join(homeDir, "bin", "service-runner.mjs"),
    backupsDir: join(homeDir, "backups"),
    logsDir: join(homeDir, "logs"),
    runtimeRoot: join(homeDir, "runtime"),
    screenshotsDir: join(homeDir, "screenshots"),
    settingsPath: process.env.COMMANDTHING_CLAUDE_SETTINGS || join(homedir(), ".claude", "settings.json"),
  };
}
