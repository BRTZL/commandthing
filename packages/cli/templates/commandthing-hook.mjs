#!/usr/bin/env node

const FEEDER_URL = __COMMANDTHING_FEEDER_URL__;
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 900);
try {
  await fetch(new URL("/hook", FEEDER_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: Buffer.concat(chunks),
    signal: controller.signal,
  });
} catch {
  // Never block Claude Code when CommandThing is stopped or unavailable.
} finally {
  clearTimeout(timer);
}
