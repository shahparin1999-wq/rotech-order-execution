import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Gate A end-to-end configuration: the app runs with SERVER persistence (JSON
// file adapter by default, PostgreSQL when DATABASE_URL is set) so the browser
// exercises the real command API instead of localStorage. Tests reset the
// shared state through POST /api/admin/reset before each scenario.

const stateFile = process.env.OEH_STATE_FILE ?? path.join(process.cwd(), ".oeh-data", "e2e-state.json");

export default defineConfig({
  testDir: "./e2e-server",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run start -- --port 3101",
    url: "http://localhost:3101/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      OEH_PERSISTENCE: process.env.DATABASE_URL ? "postgres" : "file",
      OEH_STATE_FILE: stateFile,
      OEH_ALLOW_RESET: "1",
      OEH_UAT_MODE: "1",
      NEXT_PUBLIC_OEH_UAT_MODE: "1"
    }
  },
  projects: [
    {
      name: "server-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
    }
  ]
});
