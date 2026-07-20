import { spawn } from "node:child_process";

export function run(command: string, args: string[], silent = true): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: silent ? "ignore" : "inherit" });
    child.once("error", () => resolve(127));
    child.once("close", (code) => resolve(code ?? 1));
  });
}

export function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `exit code ${code}`));
    });
  });
}
