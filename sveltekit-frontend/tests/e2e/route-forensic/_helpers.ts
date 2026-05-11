/**
 * Shared helpers for route-forensic specs.
 *
 * Pattern source: tests/e2e/upload-button-diagnostic.spec.ts (commit 86671e43e5
 * forensic spec that caught Service Worker colon-corruption).
 *
 * Each spec uses attachListeners() + summarise() to capture EVERY browser
 * signal (console info/warn/error with source URL+line, pageerror uncaught
 * exceptions, network requests, network responses with body on 4xx/5xx,
 * requestfailed for DNS/abort/ERR_BLOCKED_BY_RESPONSE).
 */

import type { Page, ConsoleMessage, APIRequestContext } from '@playwright/test';
import pg from 'pg';

export const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

// Port 5434 = deeds-postgres-prod-proxy → legal-ai-postgres container.
// Port 5432 on the host is squatted by a native Windows Postgres.
const DB_URL =
	process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

let _pool: pg.Pool | null = null;
function pool(): pg.Pool {
	if (!_pool) _pool = new pg.Pool({ connectionString: DB_URL });
	return _pool;
}

export interface CapturedLog {
	consoleMessages: Array<{ type: string; text: string; location: string }>;
	pageErrors: Array<{ message: string; stack?: string }>;
	requests: Array<{ method: string; url: string; resourceType: string }>;
	responses: Array<{ url: string; status: number; statusText: string; body?: string }>;
	requestFailures: Array<{ url: string; failure: string }>;
}

export function emptyLog(): CapturedLog {
	return {
		consoleMessages: [],
		pageErrors: [],
		requests: [],
		responses: [],
		requestFailures: [],
	};
}

export function attachListeners(page: Page, log: CapturedLog) {
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

export function summarise(log: CapturedLog, label: string) {
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

export async function loadSeededCaseId(): Promise<string | null> {
	try {
		const result = await pool().query<{ id: string }>(
			"SELECT id FROM cases WHERE title LIKE '[PW-TEST]%' ORDER BY created_at ASC LIMIT 1"
		);
		return result.rows[0]?.id ?? null;
	} catch (err) {
		console.warn(`[forensic helpers] could not load seeded case id: ${(err as Error).message}`);
		return null;
	}
}

export async function loadAnyCaseId(): Promise<string | null> {
	try {
		const result = await pool().query<{ id: string }>(
			'SELECT id FROM cases ORDER BY created_at DESC LIMIT 1'
		);
		return result.rows[0]?.id ?? null;
	} catch {
		return null;
	}
}

export async function loadAnyEvidenceId(): Promise<string | null> {
	try {
		const result = await pool().query<{ id: string }>(
			'SELECT id FROM evidence ORDER BY created_at DESC LIMIT 1'
		);
		return result.rows[0]?.id ?? null;
	} catch {
		return null;
	}
}

export async function loadAnyPoiId(): Promise<string | null> {
	try {
		const result = await pool().query<{ id: string }>(
			'SELECT id FROM persons_of_interest ORDER BY created_at DESC LIMIT 1'
		);
		return result.rows[0]?.id ?? null;
	} catch {
		return null;
	}
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
 * Quick page-load forensic capture. Returns the log without making
 * any hard assertions — caller decides what to assert.
 */
export async function captureRouteLoad(
	page: Page,
	relativePath: string,
	opts: { waitMs?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' } = {}
): Promise<CapturedLog> {
	const log = emptyLog();
	attachListeners(page, log);
	await stubCompletedOnboarding(page);
	await page
		.goto(`${BASE}${relativePath}`, {
			waitUntil: opts.waitUntil ?? 'domcontentloaded',
			timeout: 15000,
		})
		.catch(() => {});
	await page.waitForTimeout(opts.waitMs ?? 1200);
	return log;
}

/** Count hard errors (uncaught exceptions excluding noisy network fetches). */
export function hardErrorCount(log: CapturedLog): number {
	return log.pageErrors.filter((e) => !e.message.includes('Failed to fetch')).length;
}

/**
 * Log in as the seeded demo user via the real /login form action.
 *
 * Why: forensic specs need authenticated content paths, not just login-redirect
 * pages. AUTH_REDIRECT (predicted ~7 routes in triage doc §2) is silenced when
 * specs start with this helper in beforeEach.
 *
 * Works regardless of DEV_BYPASS_AUTH state — uses the same path a real user
 * would. Sets the Lucia session cookie that hooks.server.ts reads on every
 * subsequent request. ~300-500ms per call.
 *
 * Pre-req: `npm run db:seed` has created demo@legal-ai.local with password123
 * (default state — see src/lib/server/db/seed.ts).
 *
 * Usage pattern (copy into any spec that needs an authed user):
 *
 *   import { loginAsDemoUser } from './_helpers';
 *
 *   test.describe.serial('my route', () => {
 *     test.beforeEach(async ({ page }) => {
 *       await loginAsDemoUser(page);
 *     });
 *     test('renders authenticated content', async ({ page }) => {
 *       const log = await captureRouteLoad(page, '/my/route');
 *       expect(log.pageErrors).toHaveLength(0);
 *     });
 *   });
 *
 * Failure modes:
 * - Login form selectors moved → throws; update selectors in this helper
 * - Demo user missing → 400 'Invalid credentials' surfaces in log.responses;
 *   re-seed with `npm run db:seed`
 * - DEV_BYPASS_AUTH=true server-side: login still works (cookie path is fine);
 *   the bypass and the cookie cohabit cleanly per hooks.server.ts:705
 *
 * For tests that explicitly want UNauthenticated state (e.g. testing the
 * redirect path itself), do NOT call this helper.
 */
export async function loginAsDemoUser(
	page: Page,
	opts: { email?: string; password?: string } = {}
): Promise<void> {
	const username = opts.email ?? 'demo@legal-ai.local';
	const password = opts.password ?? 'password123';

	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 10000 });

	// DEV_BYPASS_AUTH=true (set by `npm run dev`) auto-authenticates every request,
	// so /login redirects to / and the form never mounts. Treat that as "already
	// logged in" and bail out — every authed route works without a session cookie.
	// (Real bug fixed 2026-05-11 after cases-list.diagnostic.spec.ts hung waiting
	// for an input that never appears.)
	if (!page.url().includes('/login')) return;

	// The YORHA login form is inside a Bits UI Dialog that mounts post-hydration.
	// Wait for the email/username input to be visible+enabled before fill.
	const userInput = page
		.locator('input[name="username"], input[type="email"], input[name="email"]')
		.first();
	await userInput.waitFor({ state: 'visible', timeout: 10000 });
	await userInput.fill(username);

	const passInput = page.locator('input[name="password"], input[type="password"]').first();
	await passInput.waitFor({ state: 'visible', timeout: 5000 });
	await passInput.fill(password);

	await page.click('button[type="submit"]');
	// SvelteKit form actions redirect on success; wait for landing.
	await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
}

/**
 * Lightweight auth check — visits a small authenticated probe endpoint and
 * returns whether the session is active. Use to decide between login flow
 * and dev-bypass shortcut, or just for diagnostics inside a spec.
 *
 * Returns null when the probe endpoint doesn't exist (older builds).
 */
export async function isAuthenticated(page: Page): Promise<boolean | null> {
	try {
		const res = await page.request.get(`${BASE}/api/auth/me`, { timeout: 3000 });
		if (res.status() === 404) return null;
		return res.ok();
	} catch {
		return null;
	}
}