import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { connectCdp } from "./cdp.ts";
import { ensureUserDirectories, screenshotDir } from "./paths.ts";

export async function runDevice(args: string[]): Promise<void> {
  const [command, argument] = args;
  if (!command || !["reload", "screenshot", "shot", "open", "info"].includes(command)) {
    throw new Error("usage: commandthing device <reload|screenshot [out.png]|open <route>|info>");
  }
  const { send, close } = await connectCdp();
  await send("Page.enable");
  try {
    if (command === "reload") {
      await send("Page.reload", { ignoreCache: true });
      console.log("Device reloaded");
      return;
    }
    if (command === "screenshot" || command === "shot") {
      ensureUserDirectories();
      const output = argument || join(screenshotDir, "device-shot.png");
      const result = await send("Page.captureScreenshot", { format: "png" });
      if (!result?.data) throw new Error("device returned no screenshot data");
      await writeFile(output, Buffer.from(result.data, "base64"));
      console.log(`Screenshot saved to ${output}`);
      return;
    }
    if (command === "open") {
      if (!argument) throw new Error("device open requires a route such as /usage");
      const hash = argument.startsWith("#") ? argument : `#${argument}`;
      await send("Runtime.enable");
      await send("Runtime.evaluate", { expression: `location.hash=${JSON.stringify(hash)}` });
      console.log(`Device opened ${hash}`);
      return;
    }
    await send("Runtime.enable");
    const expression =
      "JSON.stringify({url:location.href,ua:navigator.userAgent,dpr:window.devicePixelRatio,size:window.innerWidth+'x'+window.innerHeight})";
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    console.log(result?.result?.value ?? "No device information returned");
  } finally {
    close();
  }
}
