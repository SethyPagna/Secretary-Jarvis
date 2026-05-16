import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5175,
    proxy: {
      "/api": "http://127.0.0.1:4317"
    }
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 760,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (!normalizedId.includes("node_modules")) {
            return undefined;
          }
          if (normalizedId.includes("/node_modules/@react-three/")) {
            return "r3f-vendor";
          }
          if (normalizedId.includes("/node_modules/three/")) {
            return "three-vendor";
          }
          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
          if (
            normalizedId.includes("/node_modules/framer-motion/") ||
            normalizedId.includes("/node_modules/motion-dom/") ||
            normalizedId.includes("/node_modules/motion-utils/")
          ) {
            return "motion-vendor";
          }
          if (normalizedId.includes("/node_modules/lucide-react/")) {
            return "icon-vendor";
          }
          if (normalizedId.includes("/node_modules/@jarvis/core/")) {
            return "jarvis-core";
          }
          return "vendor";
        }
      }
    }
  }
});
