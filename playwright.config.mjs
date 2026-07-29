import { defineConfig, devices } from '@playwright/test';

const PORT = 41790;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const executablePath = process.env.KRM_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {})
      }
    }
  ],
  webServer: {
    command: 'node tools/serve.mjs',
    url: `${BASE_URL}/search/`,
    reuseExistingServer: !process.env.CI,
    env: {
      HOST: '127.0.0.1',
      PORT: String(PORT),
      KRM_SERVE_DIR: 'dist'
    }
  }
});
