import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { BufferCache, HttpError, parseArtworkUrl, readJsonBody, websocketOriginAllowed } from "./http.ts";

function requestBody(value: string, contentLength?: number): IncomingMessage {
  const stream = Readable.from([value]) as IncomingMessage;
  stream.headers = contentLength == null ? {} : { "content-length": String(contentLength) };
  return stream;
}

test("artwork proxy accepts only the exact Spotify image origin", () => {
  assert.equal(parseArtworkUrl("https://i.scdn.co/image/abc")?.hostname, "i.scdn.co");
  assert.equal(parseArtworkUrl("https://i.scdn.co.evil.example/image/abc"), null);
  assert.equal(parseArtworkUrl("http://i.scdn.co/image/abc"), null);
  assert.equal(parseArtworkUrl("https://user@i.scdn.co/image/abc"), null);
});

test("websocket browser origins must match the request host", () => {
  assert.equal(websocketOriginAllowed(undefined, "localhost:4000"), true);
  assert.equal(websocketOriginAllowed("http://localhost:4000", "localhost:4000"), true);
  assert.equal(websocketOriginAllowed("https://example.com", "localhost:4000"), false);
  assert.equal(websocketOriginAllowed("not a url", "localhost:4000"), false);
});

test("buffer cache evicts the oldest entries to stay within its byte budget", () => {
  const cache = new BufferCache(5);
  cache.set("a", Buffer.from("123"));
  cache.set("b", Buffer.from("45"));
  assert.equal(cache.get("a")?.toString(), "123");
  cache.set("c", Buffer.from("678"));
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c")?.toString(), "678");
});

test("JSON request bodies are parsed and size-limited", async () => {
  assert.deepEqual(await readJsonBody(requestBody('{"ok":true}')), { ok: true });
  await assert.rejects(readJsonBody(requestBody("nope")), (error) => {
    assert.equal(error instanceof HttpError && error.status, 400);
    return true;
  });
  await assert.rejects(readJsonBody(requestBody("{}", 20), 10), (error) => {
    assert.equal(error instanceof HttpError && error.status, 413);
    return true;
  });
});
