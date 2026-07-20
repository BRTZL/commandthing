import { runTunnel } from "../../src/runtime/tunnel.ts";

runTunnel().catch((error) => {
  console.error(`[commandthing] tunnel failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
