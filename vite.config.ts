import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-")) {
            return "charts";
          }
          if (id.includes("drizzle-orm") || id.includes("drizzle-zod")) {
            return "drizzle";
          }
          if (id.includes("lucide-react")) return "icons";
          if (
            id.includes("react-dom") ||
            id.includes("/react/") ||
            id.includes("scheduler") ||
            id.includes("wouter")
          ) {
            return "react-vendor";
          }
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("framer-motion")) return "framer-motion";
          if (id.includes("date-fns")) return "date-fns";
          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform")
          ) {
            return "forms";
          }
          if (id.includes("embla-carousel")) return "carousel";
          if (id.includes("react-day-picker")) return "day-picker";
          if (id.includes("cmdk")) return "cmdk";
          if (id.includes("input-otp")) return "input-otp";
          if (
            id.includes("/zod/") ||
            id.includes("drizzle-zod") ||
            id.includes("zod-validation-error")
          ) {
            return "zod";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
