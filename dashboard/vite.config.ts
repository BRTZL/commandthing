import { resolve } from "node:path";
import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Car Thing's Nocturne kiosk runs Chromium ~v69. The legacy plugin emits
// SystemJS bundles + polyfills targeting that engine; build.target matches.
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["chrome >= 69"],
      modernPolyfills: true,
    }),
  ],
  resolve: {
    alias: { "@shared": resolve(__dirname, "../shared") },
  },
  server: {
    port: 5173,
    fs: { allow: [".."] }, // allow importing ../shared/protocol.ts
  },
  build: {
    // Target is governed by @vitejs/plugin-legacy (chrome >= 69) above.
    outDir: "dist",
  },
});
