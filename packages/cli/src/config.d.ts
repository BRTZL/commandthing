export interface CommandThingConfig {
  server: { host: string; port: number };
  openUsage: { url: string; refreshMs: number };
  refresh: { sessionsMs: number; mediaMs: number };
}

export const DEFAULT_CONFIG: Readonly<CommandThingConfig>;
export function parseConfig(input: unknown): CommandThingConfig;
export function readConfigFileSync(path: string): CommandThingConfig;
export function serializeDefaultConfig(): string;
