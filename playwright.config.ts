import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    // Fresh demo database for every run; requires `npm run build` first.
    command: `node scripts/e2e-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
