/**
 * Pure-function helpers for forensic specs.
 *
 * No side effects, no Playwright fixtures, no DB pools. Anything that
 * needs a lifecycle lives in ../fixtures/*.ts. Anything stateless lives
 * here.
 */

import type { Page } from '@playwright/test';
import type { CapturedLog } from '../fixtures/forensic-page';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function summarise(log: CapturedLog, label: string): void {
	const errors = log.consoleMessages.filter((m) => m.type === 'error');
	const warnings = log.consoleMessages.filter((m) => m.type === 'warning' || m.type === 'warn');
	const failedResponses = log.responses.filter((r) => r.status >= 400);

	console.log('');
	console.log(`══════ DIAGNOSTIC: ${label} ══════`);
	console.log(`Console errors:    ${errors.length}`);
	console.log(`Console warnings:  ${warnings.length}`);
	console.log(`Page errors:       ${log.pageErrors.length}`);
	console.log(`Network requests:  ${log.requests.length}`);
	console.log(`Failed responses:  ${failedResponses.length}`);
	console.log(`Request failures:  ${log.requestFailures.length}`);

	if (errors.length > 0) {
		console.log('\n--- console.error ---');
		errors.slice(0, 10).forEach((e, i) => {
			console.log(`  [${i + 1}] ${e.text.slice(0, 200)}`);
			if (e.location !== ':0:0') console.log(`      @ ${e.location}`);
		});
	}

	if (log.pageErrors.length > 0) {
		console.log('\n--- pageerror (uncaught exceptions) ---');
		log.pageErrors.slice(0, 5).forEach((e, i) => {
			console.log(`  [${i + 1}] ${e.message}`);
			if (e.stack) console.log(`      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`);
		});
	}

	if (failedResponses.length > 0) {
		console.log('\n--- failed responses ---');
		failedResponses.slice(0, 10).forEach((r, i) => {
			console.log(`  [${i + 1}] ${r.status} ${r.statusText} ${r.url}`);
			if (r.body) console.log(`      body: ${r.body.slice(0, 150)}`);
		});
	}

	if (log.requestFailures.length > 0) {
		console.log('\n--- request failures (network) ---');
		log.requestFailures.slice(0, 5).forEach((f, i) => {
			console.log(`  [${i + 1}] ${f.failure} ${f.url}`);
		});
	}
	console.log('═══════════════════════════════════════════');
}

export function hardErrorCount(log: CapturedLog): number {
	return log.pageErrors.filter((e) => !e.message.includes('Failed to fetch')).length;
}

export async function stubCompletedOnboarding(page: Page): Promise<void> {
	await page.route('**/api/onboarding', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				hasCompletedOnboarding: true,
				onboardingStep: 9,
			}),
		});
	});
}

/**
 * Convenience for the common "navigate + wait + return log" pattern.
 * Equivalent to the legacy captureRouteLoad() in ../_helpers.ts but takes
 * an already-attached forensic page from the fixture.
 */
export async function navAndCapture(
	page: Page,
	log: CapturedLog,
	relativePath: string,
	opts: { waitMs?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' } = {}
): Promise<CapturedLog> {
	const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
	await stubCompletedOnboarding(page);
	await page
		.goto(`${base}${relativePath}`, {
			waitUntil: opts.waitUntil ?? 'domcontentloaded',
			timeout: 15000,
		})
		.catch(() => {});
	await page.waitForTimeout(opts.waitMs ?? 1200);
	return log;
}
