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
      // Dedicated path the SPA uses when it needs to scrape the upstream
      // Bootstrap /submit/ HTML to discover feature flags / packages /
      // routes that aren't available via /api/v3/. Rewrites to /submit/
      // on the backend; bypasses the vite-served SPA route of the same
      // name.
      "/_upstream/submit": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_upstream\/submit/, "/submit"),
      },
      // Same idea for /analysis/ — Recent page falls back to scraping
      // when /api/v3/tasks/ is unavailable.
      "/_upstream/analysis": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_upstream\/analysis/, "/analysis"),
      },
      // /_upstream/statistics → upstream /statistics/<days>/ for the
      // Statistics page scrape fallback.
      "/_upstream/statistics": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_upstream\/statistics/, "/statistics"),
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
