import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Allow docker-compose / SSH tunnel to override the proxy target. Default to
// 127.0.0.1:8000 so plain `npm run dev` keeps working outside of docker.
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: process.env.VITE_HOST ?? undefined,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/apiv2": { target: apiTarget, changeOrigin: true },
      "/apiv3": { target: apiTarget, changeOrigin: true },
      "/accounts": { target: apiTarget, changeOrigin: true },
      "/admin": { target: apiTarget, changeOrigin: true },
      "/static": { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
