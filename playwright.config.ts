import { defineConfig } from "@playwright/test";

// One worker: several tests edit projects/closet-built-in/project.ts on disk and must not
// race each other or the tests that read the model.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: { channel: "chrome", baseURL: "http://127.0.0.1:5180", viewport: { width: 1500, height: 900 } },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: true,
  },
});
