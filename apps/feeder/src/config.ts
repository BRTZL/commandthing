import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CommandThingConfig {
  server: { host: string; port: number };
  openUsage: { url: string; refreshMs: number };
  refresh: { sessionsMs: number; mediaMs: number };
}

export const DEFAULT_CONFIG: CommandThingConfig = {
  server: { host: "0.0.0.0", port: 4000 },
  openUsage: { url: "http://localhost:6736/v1/usage", refreshMs: 30_000 },
  refresh: { sessionsMs: 2000, mediaMs: 1000 },
};

const configRoot =
  process.env.COMMANDTHING_HOME?.trim() ||
  join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "commandthing");

export const configPath = process.env.COMMANDTHING_CONFIG?.trim() || join(configRoot, "config.json");

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInteger(value: unknown, fallback: number, label: string): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function text(value: unknown, fallback: string, label: string): string {
  if (value == null) return fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function loadFile(): Partial<CommandThingConfig> {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as Partial<CommandThingConfig>;
  } catch (error) {
    throw new Error(`cannot read CommandThing config at ${configPath}: ${String(error)}`);
  }
}

function loadConfig(): CommandThingConfig {
  const file = record(loadFile());
  const server = record(file.server);
  const openUsage = record(file.openUsage);
  const refresh = record(file.refresh);
  return {
    server: {
      host: text(process.env.HOST ?? server.host, DEFAULT_CONFIG.server.host, "server.host"),
      port: positiveInteger(process.env.PORT ?? server.port, DEFAULT_CONFIG.server.port, "server.port"),
    },
    openUsage: {
      url: text(process.env.OPEN_USAGE_URL ?? openUsage.url, DEFAULT_CONFIG.openUsage.url, "openUsage.url"),
      refreshMs: positiveInteger(
        process.env.USAGE_REFRESH_MS ?? openUsage.refreshMs,
        DEFAULT_CONFIG.openUsage.refreshMs,
        "openUsage.refreshMs",
      ),
    },
    refresh: {
      sessionsMs: positiveInteger(
        process.env.POLL_MS ?? refresh.sessionsMs,
        DEFAULT_CONFIG.refresh.sessionsMs,
        "refresh.sessionsMs",
      ),
      mediaMs: positiveInteger(
        process.env.MEDIA_MS ?? refresh.mediaMs,
        DEFAULT_CONFIG.refresh.mediaMs,
        "refresh.mediaMs",
      ),
    },
  };
}

export const config = loadConfig();
