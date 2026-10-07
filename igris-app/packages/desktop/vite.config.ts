import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: {
              external: [
                "electron",
                "better-sqlite3",
                "@igris/core",
                "@earendil-works/pi-agent-core",
                "@earendil-works/pi-ai",
              ],
            },
          },
        },
      },
      {
        entry: "src/preload/index.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron/preload",
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@igris/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
