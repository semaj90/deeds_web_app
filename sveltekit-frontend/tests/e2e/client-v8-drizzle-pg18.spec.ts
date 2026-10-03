import { expect, test } from '@playwright/test';

test.describe('client runtime -> Drizzle -> PostgreSQL 18', () => {
  test('loads client JavaScript in Chromium and reads the PostgreSQL 18 fingerprint through Drizzle', async ({
    page,
    browserName,
  }) => {
    expect(browserName).toBe('chromium');

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.ok()).toBeTruthy();

    await page.waitForLoadState('load');

    const clientRuntime = await page.evaluate(() => {
      const resources = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name);

      return {
        javascriptExecuted:
          typeof BigInt === 'function' &&
          typeof WebAssembly === 'object' &&
          typeof Promise === 'function',
        userAgent: navigator.userAgent,
        svelteKitClientBundleLoaded: resources.some(
          (name) => name.includes('/_app/') && /\.js(?:\?|$)/.test(name)
        ),
      };
    });

    // Playwright's Chromium project executes page JavaScript in Chromium's V8
    // engine. We prove the browser/runtime surface here without depending on a
    // brittle engine-version string that Playwright does not expose.
    expect(clientRuntime.javascriptExecuted).toBe(true);
    expect(clientRuntime.userAgent).toContain('Chrome/');
    expect(clientRuntime.svelteKitClientBundleLoaded).toBe(true);

    const databaseHealth = await page.evaluate(async () => {
      const health = await fetch('/api/health/database', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      return {
        status: health.status,
        body: await health.json(),
      };
    });

    expect(databaseHealth.status).toBe(200);
    expect(databaseHealth.body).toMatchObject({
      status: 'healthy',
      service: 'database',
      engine: 'postgresql',
      accessPath: 'drizzle-orm/node-postgres',
      postgres: {
        majorVersion: 18,
      },
    });

    expect(databaseHealth.body.postgres.serverVersion).toMatch(/^18\./);
    expect(databaseHealth.body.postgres.serverVersionNum).toBeGreaterThanOrEqual(180000);
    expect(databaseHealth.body.postgres.databaseName).toBeTruthy();
  });
});
