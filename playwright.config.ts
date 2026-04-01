import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://localhost:7100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 8_000,
  },
  projects: [
    {
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
    },
    {
      name: 'authenticated',
      testIgnore: /auth\.spec\.ts/,
    },
  ],
})
