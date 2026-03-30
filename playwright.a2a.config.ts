import { defineConfig } from '@playwright/test';

/**
 * Playwright config for A2A tests.
 * Targets Bridge:5000 directly, no Next.js webServer needed.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'a2a-*.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5000',
  },
  projects: [
    {
      name: 'a2a',
      use: { browserName: 'chromium' },
    },
  ],
});
