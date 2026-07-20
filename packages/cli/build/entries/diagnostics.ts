import { runDiagnostics } from "../../src/runtime/diagnostics.ts";

runDiagnostics(process.argv.slice(2)).catch((error) => {
  console.error(`commandthing diagnostics: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
