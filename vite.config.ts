import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { aui } from "@assistant-ui/vite";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// Read from the same environment variable as the chat server, rather than
// hardcoding a second copy of the number. Two sources of truth meant changing
// one silently broke the proxy.
const CHAT_SERVER_PORT = Number(process.env.CHAT_SERVER_PORT ?? 8787);

// The web server's own port, for the same reason. Two checkouts of this
// source on one machine each need their own, and a hardcoded number means the
// second one cannot start at all — Vite is set to fail rather than to move.
//
// The hot-reload socket sits one above it, so the step is a calculation
// rather than a second constant: a port that moved has to take its socket
// with it, or the window reloads against somebody else's server.
const WEB_PORT = Number(process.env.TAVI_WEB_PORT ?? 1420);

// https://vite.dev/config/
export default defineConfig(() => ({
  // `backendless` is required here: the chat route is a bare Node process and
  // cannot import the toolkit's server build, so without it the client would
  // assume the backend knows the tool schemas and stop uploading them.
  // `aui()` returns an array of plugins, so it is spread in.
  plugins: [react(), tailwindcss(), ...aui({ backendless: true })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: WEB_PORT,
    strictPort: true,
    host: host || false,
    proxy: {
      // The Tauri window loads a static bundle, so the streaming chat route is
      // served by the separate AI SDK server in `server/`.
      "/api": {
        target: `http://localhost:${CHAT_SERVER_PORT}`,
        changeOrigin: true,
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: WEB_PORT + 1,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
