import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  // The local dev server compiles authenticated routes on first navigation.
  expect: { timeout: 15000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "54325",
      SMTP_ALLOW_LOCAL: "true",
      SMTP_USER: "",
      SMTP_PASS: "",
      SMTP_FROM: "mesa@local.test",
    },
  },
});
