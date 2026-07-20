import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Car Thing kiosk runs a ~Chromium-69 engine (QtWebEngine 5.12.7). It
// supports <script type=module>, so it would otherwise load Vite's MODERN
// bundle — which still contains ?./?? and blank-screens. renderModernChunks:
// false makes the plugin emit ONLY the legacy SystemJS bundle (fully transpiled
// + polyfilled to chrome69), which is what the device must load.
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["chrome >= 69"],
      modernPolyfills: true,
      renderModernChunks: false,
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:4000", ws: true },
      "/api": { target: "http://localhost:4000" },
    },
  },
  build: {
    // Target is governed by @vitejs/plugin-legacy (chrome >= 69) above.
    outDir: "dist",
  },
});
