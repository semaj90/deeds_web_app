/**
 * Forensic page fixture.
 *
 * Yields a `{ page, log }` pair where the page already has all 5 forensic
 * listeners attached (console, pageerror, request, response with 4xx/5xx
 * body capture, requestfailed). Replaces the captureRouteLoad() helper
 * for new specs.
 *
 * Backward compat: existing specs that import captureRouteLoad/summarise
 * from ./_helpers.ts keep working unchanged. Migrate one at a time.
 *
 * Usage:
 *   import { test, expect } from './fixtures/forensic-page';
 *   test('foo', async ({ forensicPage, summarise }) => {
 *     const { page, log } = forensicPage;
 *     await page.goto('/foo');
 *     await page.waitForTimeout(1500);
 *     summarise(log, 'GET /foo');
 *     expect(log.pageErrors).toHaveLength(0);
 *   });
 */

import { test as base, type Page, type ConsoleMessage } from '@playwright/test';
import { test as dbTest } from './db';

export interface CapturedLog {
	consoleMessages: Array<{ type: string; text: string; location: string }>;
	pageErrors: Array<{ message: string; stack?: string }>;
	requests: Array<{ method: string; url: string; resourceType: string }>;
	responses: Array<{ url: string; status: number; statusText: string; body?: string }>;
	requestFailures: Array<{ url: string; failure: string }>;
}

function emptyLog(): CapturedLog {
	return {
		consoleMessages: [],
		pageErrors: [],
		requests: [],
		responses: [],
		requestFailures: [],
	};
}

function attachListeners(page: Page, log: CapturedLog) {
	page.on('console', (msg: ConsoleMessage) => {
		const loc = msg.location();
		log.consoleMessages.push({
			type: msg.type(),
			text: msg.text(),
			location: `${loc.url}:${loc.lineNumber}:${loc.columnNumber}`,
		});
	});

	page.on('pageerror', (err) => {
		log.pageErrors.push({ message: err.message, stack: err.stack });
	});

	page.on('request', (req) => {
		log.requests.push({
			method: req.method(),
			url: req.url(),
			resourceType: req.resourceType(),
		});
	});

	page.on('requestfailed', (req) => {
		log.requestFailures.push({
			url: req.url(),
			failure: req.failure()?.errorText ?? 'unknown',
		});
	});

	page.on('response', async (res) => {
		const status = res.status();
		let body: string | undefined;
		if (status >= 400 && status < 600) {
			try {
				body = (await res.text()).slice(0, 500);
			} catch {
				body = '<unreadable>';
			}
		}
		log.responses.push({ url: res.url(), status, statusText: res.statusText(), body });
	});
}

type ForensicFixtures = {
	forensicPage: { page: Page; log: CapturedLog };
};

// Re-extend the db fixture so test files only need one import.
export const test = (dbTest as typeof base).extend<ForensicFixtures>({
	forensicPage: async ({ page }, use) => {
		const log = emptyLog();
		attachListeners(page, log);
		await use({ page, log });
	},
});

export { expect } from '@playwright/test';
