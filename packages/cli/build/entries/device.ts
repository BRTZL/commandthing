import { runDevice } from "../../src/runtime/device.ts";

runDevice(process.argv.slice(2)).catch((error) => {
  console.error(`commandthing device: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
