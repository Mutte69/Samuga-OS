import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each test file gets its own isolated worker so in-memory rate-limit
    // stores don't bleed between suites.
    pool: "forks",
    testTimeout: 15_000,
  },
});
