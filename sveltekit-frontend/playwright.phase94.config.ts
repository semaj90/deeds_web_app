import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'phase94-cli.spec.ts',
  fullyParallel: true,
  workers: 1,
  timeout: 30000,
  reporter: 'line',
  use: {},
});