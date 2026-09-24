// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact, tailwindcss, etc.
// For Vercel: https://vercel.com/docs/frameworks/full-stack/tanstack-start
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  cloudflare: false,
  plugins: [nitro()],
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      port: 3000,
      strictPort: false,
      proxy: {
        "/api": {
          target: "https://lavenderblush-butterfly-422992.hostingersite.com",
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules")) {
              const path = id.replace(/\\/g, "/");
              if (
                path.includes("node_modules/react/") ||
                path.includes("node_modules/react-dom/") ||
                path.includes("node_modules/react-router-dom/")
              ) {
                return "vendor";
              }
              if (path.includes("node_modules/recharts/")) {
                return "charts";
              }
              if (path.includes("node_modules/framer-motion/")) {
                return "motion";
              }
              if (path.includes("node_modules/@tanstack/react-query/")) {
                return "query";
              }
            }
          },
        },
      },
    },
  },
});
