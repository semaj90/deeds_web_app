/**
 * Authenticated page fixture.
 *
 * Yields a `Page` that has a valid Lucia session cookie. Uses storageState
 * persistence: the first spec that requests `authedPage` performs the real
 * login flow once and writes cookies to `playwright/.auth/user.json`. Every
 * subsequent fixture instance (same worker OR new test run within the cache
 * window) reads cookies from disk and skips the login flow entirely.
 *
 * This eliminates the ~300-500ms per-spec login cost AND the Bits UI dialog
 * timing flake that caused cases-list.diagnostic.spec.ts to fail on
 * 2026-05-11 (input not visible when fill() retries hit the 30s timeout).
 *
 * Usage:
 *   import { test, expect } from './fixtures/authed-page';
 *   test('authed route', async ({ authedPage }) => {
 *     await authedPage.goto('/cases');
 *     // ... session cookie already set
 *   });
 *
 * Invalidation: delete playwright/.auth/user.json (or pass STORAGE_STATE=fresh
 * env var) to force a fresh login on next run. Test seeding script creates
 * demo@legal-ai.local with password123 — re-seed if it changes.
 */

import { test as base, type Page } from '@playwright/test';
import { test as forensicTest } from './forensic-page';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PORTS } from '../../../helpers/env-ports.js';

const BASE = PORTS.APP_BASE;
const STORAGE_STATE = resolve(process.cwd(), 'playwright', '.auth', 'user.json');
const STORAGE_TTL_MS = 30 * 60 * 1000; // 30 min — re-login if file older

function storageStateFresh(): boolean {
	if (process.env.STORAGE_STATE === 'fresh') return false;
	if (!existsSync(STORAGE_STATE)) return false;
	const age = Date.now() - statSync(STORAGE_STATE).mtimeMs;
	return age < STORAGE_TTL_MS;
}

async function performLogin(
	page: Page,
	email = 'demo@legal-ai.local',
	password = 'password123'
): Promise<void> {
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 10000 });

	// DEV_BYPASS_AUTH=true → /login redirects to / and there's no form to fill.
	// Skip the rest; downstream specs will work without a session cookie.
	if (!page.url().includes('/login')) return;

	const userInput = page
		.locator('input[name="username"], input[type="email"], input[name="email"]')
		.first();
	await userInput.waitFor({ state: 'visible', timeout: 10000 });
	await userInput.fill(email);

	const passInput = page.locator('input[name="password"], input[type="password"]').first();
	await passInput.waitFor({ state: 'visible', timeout: 5000 });
	await passInput.fill(password);

	await page.click('button[type="submit"]');
	await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

	mkdirSync(dirname(STORAGE_STATE), { recursive: true });
	await page.context().storageState({ path: STORAGE_STATE });
}

type AuthedFixtures = {
	authedPage: Page;
};

export const test = (forensicTest as typeof base).extend<AuthedFixtures>({
	authedPage: async ({ browser }, use) => {
		const ctx = storageStateFresh()
			? await browser.newContext({ storageState: STORAGE_STATE })
			: await browser.newContext();
		const page = await ctx.newPage();
		if (!storageStateFresh()) {
			await performLogin(page);
		}
		await use(page);
		await ctx.close();
	},
});

export { expect } from '@playwright/test';
