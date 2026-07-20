#!/usr/bin/env bun

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(root, "packages", "cli", "runtime");
const packageJson = JSON.parse(readFileSync(join(root, "packages", "cli", "package.json"), "utf8"));

const buildDashboard = Bun.spawnSync(["pnpm", "--filter", "@commandthing/dashboard", "build"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (buildDashboard.exitCode !== 0) process.exit(buildDashboard.exitCode);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [
    join(root, "scripts", "runtime", "feeder.ts"),
    join(root, "scripts", "runtime", "tunnel.ts"),
    join(root, "scripts", "runtime", "device.ts"),
  ],
  outdir: outputDir,
  target: "bun",
  format: "esm",
  minify: false,
  sourcemap: "none",
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exit(1);
}

cpSync(join(root, "apps", "dashboard", "dist"), join(outputDir, "dashboard"), { recursive: true });
writeFileSync(
  join(outputDir, "manifest.json"),
  `${JSON.stringify({ version: packageJson.version, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

console.log(`CommandThing runtime built at ${outputDir}`);
