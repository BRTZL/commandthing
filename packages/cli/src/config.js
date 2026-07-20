import { existsSync, readFileSync } from "node:fs";

/** @typedef {{server: {host: string, port: number}, openUsage: {url: string, refreshMs: number}, refresh: {sessionsMs: number, mediaMs: number}}} CommandThingConfig */

/** @type {Readonly<CommandThingConfig>} */
export const DEFAULT_CONFIG = Object.freeze({
  server: Object.freeze({ host: "127.0.0.1", port: 4000 }),
  openUsage: Object.freeze({ url: "http://localhost:6736/v1/usage", refreshMs: 30_000 }),
  refresh: Object.freeze({ sessionsMs: 2000, mediaMs: 1000 }),
});

function record(value, label) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function rejectUnknown(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0)
    throw new Error(`${label} contains unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
}

function text(value, fallback, label) {
  if (value == null) return fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function positiveInteger(value, fallback, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

function httpUrl(value, fallback, label) {
  const candidate = text(value, fallback, label);
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
  return parsed.toString();
}

/**
 * Validate a partial user config and fill omitted values with supported defaults.
 * Unknown fields are rejected so misspellings cannot silently weaken the setup.
 * @param {unknown} input
 * @returns {CommandThingConfig}
 */
export function parseConfig(input) {
  const root = record(input, "config");
  rejectUnknown(root, ["server", "openUsage", "refresh"], "config");
  const server = record(root.server, "server");
  const openUsage = record(root.openUsage, "openUsage");
  const refresh = record(root.refresh, "refresh");
  rejectUnknown(server, ["host", "port"], "server");
  rejectUnknown(openUsage, ["url", "refreshMs"], "openUsage");
  rejectUnknown(refresh, ["sessionsMs", "mediaMs"], "refresh");

  return {
    server: {
      host: text(server.host, DEFAULT_CONFIG.server.host, "server.host"),
      port: positiveInteger(server.port, DEFAULT_CONFIG.server.port, "server.port", 65_535),
    },
    openUsage: {
      url: httpUrl(openUsage.url, DEFAULT_CONFIG.openUsage.url, "openUsage.url"),
      refreshMs: positiveInteger(
        openUsage.refreshMs,
        DEFAULT_CONFIG.openUsage.refreshMs,
        "openUsage.refreshMs",
      ),
    },
    refresh: {
      sessionsMs: positiveInteger(
        refresh.sessionsMs,
        DEFAULT_CONFIG.refresh.sessionsMs,
        "refresh.sessionsMs",
      ),
      mediaMs: positiveInteger(refresh.mediaMs, DEFAULT_CONFIG.refresh.mediaMs, "refresh.mediaMs"),
    },
  };
}

/** @param {string} path @returns {CommandThingConfig} */
export function readConfigFileSync(path) {
  if (!existsSync(path)) return parseConfig({});
  let input;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `cannot parse CommandThing config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return parseConfig(input);
  } catch (error) {
    throw new Error(
      `invalid CommandThing config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function serializeDefaultConfig() {
  return `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`;
}
