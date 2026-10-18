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
    port: 1420,
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
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
