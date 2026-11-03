/**
 * Spotify album art for the device, which has no internet. Covers are fetched
 * from the Spotify CDN once and kept in memory. The Music backdrop is pre-blurred
 * here, because the device cannot blur it: a CSS `filter` creates a composited
 * layer, and composited layers leak the device's Wayland buffers until the
 * renderer crashes.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { spotifyArtworkSize } from "@commandthing/protocol";
import { BufferCache, parseArtworkUrl } from "./http.ts";

const execFileAsync = promisify(execFile);
const MAX_ART_BYTES = 5 * 1024 * 1024;
const cache = new BufferCache(20 * 1024 * 1024);
const inFlight = new Map<string, Promise<Buffer>>();

/** Cached, de-duplicated load: concurrent callers share one fetch. */
function load(key: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const next = produce()
    .then((buffer) => {
      cache.set(key, buffer);
      return buffer;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, next);
  return next;
}

/** A failure that retrying cannot fix (missing image, oversized response). */
class PermanentArtworkError extends Error {}

async function download(url: URL): Promise<Buffer> {
  let lastError: unknown = null;
  // One retry: a dropped CDN request otherwise leaves the device without art
  // for the whole track.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status >= 400 && response.status < 500) {
        throw new PermanentArtworkError(`artwork responded with HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`artwork responded with HTTP ${response.status}`);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_ART_BYTES) throw new PermanentArtworkError("artwork is too large");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_ART_BYTES) throw new PermanentArtworkError("artwork is too large");
      return buffer;
    } catch (error) {
      if (error instanceof PermanentArtworkError) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** Album art exactly as served by the Spotify CDN. */
export function getArtwork(url: URL): Promise<Buffer> {
  return load(url.toString(), () => download(url));
}

// CoreImage Gaussian blur through JXA: built into macOS, so no image library is
// needed. Reads argv[0], writes a JPEG to argv[1].
const BLUR_SCRIPT = `
ObjC.import("AppKit");
ObjC.import("CoreImage");
function run(argv) {
  const input = $.CIImage.imageWithContentsOfURL($.NSURL.fileURLWithPath(argv[0]));
  if (!input || input.isNil()) throw new Error("unreadable artwork");
  const extent = input.extent;
  const blur = $.CIFilter.filterWithName("CIGaussianBlur");
  blur.setValueForKey(input.imageByClampingToExtent, "inputImage");
  blur.setValueForKey($(Number(argv[2])), "inputRadius");
  const output = blur.valueForKey("outputImage").imageByCroppingToRect(extent);
  const image = $.CIContext.contextWithOptions($()).createCGImageFromRect(output, extent);
  const bitmap = $.NSBitmapImageRep.alloc.initWithCGImage(image);
  const jpeg = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypeJPEG, $({ NSImageCompressionFactor: 0.75 }));
  if (!jpeg.writeToFileAtomically(argv[1], true)) throw new Error("could not write backdrop");
  return "ok";
}
`;

async function blur(jpeg: Buffer): Promise<Buffer> {
  const base = join(tmpdir(), `commandthing-art-${randomUUID()}`);
  const input = `${base}.jpg`;
  const output = `${base}-blur.jpg`;
  try {
    await writeFile(input, jpeg);
    // Radius 14 on the 300px cover: shapes and colour survive, edges don't.
    await execFileAsync("osascript", ["-l", "JavaScript", "-e", BLUR_SCRIPT, input, output, "14"], {
      timeout: 5000,
      killSignal: "SIGKILL",
    });
    return await readFile(output);
  } finally {
    await rm(input, { force: true });
    await rm(output, { force: true });
  }
}

/**
 * Blurred backdrop for a track. Falls back to the 64px cover, which the device
 * upscales into a blockier wash, if CoreImage is unavailable.
 */
export function getBackdrop(url: URL): Promise<Buffer> {
  return load(`backdrop:${url}`, async () => {
    const cover = parseArtworkUrl(spotifyArtworkSize(url.toString(), "cover")) ?? url;
    try {
      return await blur(await getArtwork(cover));
    } catch (error) {
      console.error("[artwork] backdrop blur failed:", error instanceof Error ? error.message : error);
      return getArtwork(parseArtworkUrl(spotifyArtworkSize(url.toString(), "thumb")) ?? url);
    }
  });
}

/**
 * Start loading a new track's cover and backdrop before the device asks for
 * them, so its requests are answered from memory.
 */
export function warmArtwork(rawUrl: string | null): void {
  const url = rawUrl ? parseArtworkUrl(rawUrl) : null;
  if (url) void getBackdrop(url).catch(() => {});
}
