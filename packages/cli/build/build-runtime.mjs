import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = join(packageRoot, "..", "..");
const outputDir = join(packageRoot, "runtime");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

const dashboard = spawnSync("pnpm", ["--filter", "@commandthing/dashboard", "build"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
if (dashboard.status !== 0) process.exit(dashboard.status ?? 1);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

await build({
  entryPoints: {
    feeder: join(packageRoot, "build", "entries", "feeder.ts"),
    tunnel: join(packageRoot, "build", "entries", "tunnel.ts"),
    device: join(packageRoot, "build", "entries", "device.ts"),
    diagnostics: join(packageRoot, "build", "entries", "diagnostics.ts"),
  },
  outdir: outputDir,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node26",
  banner: {
    js: 'import { createRequire as __commandThingCreateRequire } from "node:module"; const require = __commandThingCreateRequire(import.meta.url);',
  },
  sourcemap: false,
  logLevel: "info",
});

cpSync(join(repositoryRoot, "apps", "dashboard", "dist"), join(outputDir, "dashboard"), {
  recursive: true,
});
writeFileSync(
  join(outputDir, "manifest.json"),
  `${JSON.stringify({ version: packageJson.version, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

console.log(`CommandThing runtime built at ${outputDir}`);
