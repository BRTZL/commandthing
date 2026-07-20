import type { IncomingMessage } from "node:http";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readJsonBody(req: IncomingMessage, maximumBytes = 1024 * 1024): Promise<unknown> {
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new HttpError(413, "request body too large");
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maximumBytes) throw new HttpError(413, "request body too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

export function parseArtworkUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "i.scdn.co" ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function websocketOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export class BufferCache {
  private readonly values = new Map<string, Buffer>();
  private bytes = 0;

  constructor(private readonly maximumBytes: number) {}

  get(key: string): Buffer | undefined {
    const value = this.values.get(key);
    if (!value) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  set(key: string, value: Buffer): void {
    if (value.length > this.maximumBytes) return;
    const previous = this.values.get(key);
    if (previous) this.bytes -= previous.length;
    this.values.delete(key);
    while (this.values.size > 0 && this.bytes + value.length > this.maximumBytes) {
      const oldest = this.values.entries().next().value as [string, Buffer] | undefined;
      if (!oldest) break;
      this.values.delete(oldest[0]);
      this.bytes -= oldest[1].length;
    }
    this.values.set(key, value);
    this.bytes += value.length;
  }
}
