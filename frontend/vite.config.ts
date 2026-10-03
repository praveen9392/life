import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) supports the function form only.
        manualChunks(id: string) {
          // recharts (and its d3/victory deps) is heavy and only needed on
          // chart pages - keep it out of the core "react" vendor chunk so
          // first load stays lean; it lazy-loads with the chart routes.
          if (/node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+|internmap)/.test(id)) {
            return "charts";
          }
          if (/node_modules[\\/](react|react-dom|react-router)/.test(id)) return "react";
          if (id.includes("node_modules/@tanstack")) return "query";
        },
      },
    },
  },
});
