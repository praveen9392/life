import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component/unit tests only - E2E lives in e2e/ under Playwright
// (see docs/TESTING.md for how the two layers split responsibilities).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },});
