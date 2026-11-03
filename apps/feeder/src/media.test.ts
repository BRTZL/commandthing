import assert from "node:assert/strict";
import test from "node:test";
import { type NowPlaying, spotifyArtworkSize } from "@commandthing/protocol";
import { ensureLyrics, type LyricsResult } from "./media.ts";

const LRC = "[00:01.50] first line\n[00:04.25] second line";

function track(trackId: string): NowPlaying {
  return {
    source: "spotify",
    state: "playing",
    title: "Song",
    artist: "Artist",
    album: "Album",
    trackId,
    durationSec: 200,
    positionSec: 0,
    volume: 50,
    artworkUrl: null,
    lyrics: null,
    lyricsLoaded: false,
  };
}

/** Answers LRCLIB requests from a queue of [get, search] responses. */
function stubLrclib(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    paths.push(new URL(String(input)).pathname);
    const next = responses.shift() ?? { status: 503 };
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status, headers: next.headers });
  }) as typeof fetch;
  return { paths, restore: () => (globalThis.fetch = original) };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

test("a busy LRCLIB is retried instead of being cached as no lyrics", async () => {
  const stub = stubLrclib([
    { status: 503, headers: { "retry-after": "1" } },
    { status: 503 },
    { status: 200, body: { syncedLyrics: LRC } },
  ]);
  try {
    const settled: LyricsResult[] = [];
    const np = track("retry-then-found");
    assert.deepEqual(
      ensureLyrics(np, (_, result) => settled.push(result)),
      { loaded: false, lines: null },
    );
    await settle();
    assert.deepEqual(stub.paths, ["/api/get", "/api/search"]);
    assert.equal(settled.length, 0);

    // Before the retry delay passes, no new request goes out.
    assert.equal(ensureLyrics(np, () => {}).loaded, false);
    assert.equal(stub.paths.length, 2);

    ensureLyrics(np, (_, result) => settled.push(result), Date.now() + 60_000);
    await settle();
    assert.equal(settled.length, 1);
    assert.deepEqual(settled[0].lines, [
      { t: 1.5, text: "first line" },
      { t: 4.25, text: "second line" },
    ]);
    assert.equal(ensureLyrics(np, () => {}).loaded, true);
  } finally {
    stub.restore();
  }
});

test("a track LRCLIB does not know is settled as no lyrics", async () => {
  const stub = stubLrclib([
    { status: 404, body: { name: "TrackNotFound" } },
    { status: 200, body: [] },
  ]);
  try {
    const settled: LyricsResult[] = [];
    ensureLyrics(track("unknown"), (_, result) => settled.push(result));
    await settle();
    assert.deepEqual(settled, [{ loaded: true, lines: null }]);
    assert.deepEqual(
      ensureLyrics(track("unknown"), () => {}),
      { loaded: true, lines: null },
    );
    assert.equal(stub.paths.length, 2);
  } finally {
    stub.restore();
  }
});

test("lookups give up after a minute of failures, and a replay tries again", async () => {
  const stub = stubLrclib([]); // every request answers 503
  try {
    const settled: LyricsResult[] = [];
    const np = track("always-busy");
    for (let attempt = 0; attempt < 6; attempt++) {
      ensureLyrics(np, (_, result) => settled.push(result), Date.now() + 120_000);
      await settle();
    }
    assert.deepEqual(settled, [{ loaded: true, lines: null }]);
    assert.equal(stub.paths.length, 12);
    assert.equal(ensureLyrics(np, () => {}, Date.now() + 120_000).loaded, true);
    assert.equal(stub.paths.length, 12);

    ensureLyrics(track("something-else"), () => {});
    await settle();
    const before = stub.paths.length;
    assert.equal(ensureLyrics(np, () => {}).loaded, false);
    await settle();
    assert.equal(stub.paths.length, before + 2);
  } finally {
    stub.restore();
  }
});

test("album art is resized through its Spotify size code", () => {
  const art = "https://i.scdn.co/image/ab67616d0000b2730119a5d42a66248bf8fba1fb";
  assert.equal(
    spotifyArtworkSize(art, "cover"),
    "https://i.scdn.co/image/ab67616d00001e020119a5d42a66248bf8fba1fb",
  );
  assert.equal(
    spotifyArtworkSize(art, "thumb"),
    "https://i.scdn.co/image/ab67616d000048510119a5d42a66248bf8fba1fb",
  );
  const podcast = "https://i.scdn.co/image/ab6765630000ba8a0119a5d42a66248bf8fba1fb";
  assert.equal(spotifyArtworkSize(podcast, "cover"), podcast);
});
