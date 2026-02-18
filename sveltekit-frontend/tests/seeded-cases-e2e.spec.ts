/**
 * Seeded Cases E2E Tests
 *
 * Seeds real case data through the authenticated API, then verifies
 * the cases appear in the UI. Uses [PW-SEED] prefix for cleanup.
 *
 * Prerequisites:
 * - Dev server running (npm run dev)
 * - PostgreSQL accessible (legal_ai_db)
 */
import { test, expect } from '@playwright/test';
import {
	registerTestUser,
	seedCasesForUser,
	cleanupSeededCases,
	getSeededCases,
	type SeedCaseResult
} from './utils/seed-cases';

const TEST_CASES = [
	{
		title: 'People v. Doe — Intake',
		description: 'Seeded by Playwright: initial intake for People v. Doe'
	},
	{
		title: 'Case #2026-02 — Evidence Review',
		description: 'Seeded by Playwright: evidence review cycle',
		priority: 'high'
	},
	{
		title: 'State v. Smith — Discovery',
		description: 'Seeded by Playwright: discovery phase pending',
		status: 'open',
		priority: 'critical'
	}
];

test.describe('Seeded Cases — Real Data E2E', () => {
	let seeded: SeedCaseResult[] = [];

	test.beforeAll(async ({ request }) => {
		// Register a fresh test user (sets auth_session cookie on this request context)
		await registerTestUser(request);

		// Seed cases through the authenticated API
		seeded = await seedCasesForUser({ request, cases: TEST_CASES });
	});

	test.afterAll(async ({ request }) => {
		// Clean up: archive all seeded cases
		await cleanupSeededCases({
			request,
			caseIds: seeded.map((c) => c.id)
		});
	});

	test('API returns seeded cases for the authenticated user', async ({ request }) => {
		const res = await request.get('/api/cases?limit=100');
		expect(res.ok()).toBeTruthy();

		const json = await res.json();
		const titles = (json.data ?? []).map((c: SeedCaseResult) => c.title);

		for (const c of seeded) {
			expect(titles).toContain(c.title);
		}
	});

	test('seeded cases appear in /cases UI', async ({ page }) => {
		// Login via page context (page.request shares cookies with the browser)
		await registerTestUser(page.request);
		const pageSeeded = await seedCasesForUser({
			request: page.request,
			cases: [
				{
					title: 'UI Verification Case',
					description: 'Seeded for UI verification'
				}
			]
		});

		await page.goto('/cases');
		await page.waitForLoadState('networkidle');

		// The seeded case title should be visible in the cases list
		await expect(page.getByText(`[PW-SEED] UI Verification Case`)).toBeVisible({
			timeout: 10000
		});

		// Clean up this page-scoped seed
		await cleanupSeededCases({
			request: page.request,
			caseIds: pageSeeded.map((c) => c.id)
		});
	});

	test('seeded case has correct status and priority via API', async ({ request }) => {
		// The third case was seeded with priority: 'critical', status: 'open'
		const criticalCase = seeded.find((c) => c.title.includes('State v. Smith'));
		expect(criticalCase).toBeTruthy();

		const res = await request.get(`/api/cases/${criticalCase!.id}`);
		expect(res.ok()).toBeTruthy();

		const json = await res.json();
		expect(json.data.status).toBe('open');
		expect(json.data.priority).toBe('critical');
	});

	test('seeded case can be updated via API', async ({ request }) => {
		const firstCase = seeded[0];
		const res = await request.patch(`/api/cases/${firstCase.id}`, {
			data: { status: 'in_progress' }
		});
		expect(res.ok()).toBeTruthy();

		const json = await res.json();
		expect(json.data.status).toBe('in_progress');
	});

	test('seeded case can be fetched individually', async ({ request }) => {
		const secondCase = seeded[1];
		const res = await request.get(`/api/cases/${secondCase.id}`);
		expect(res.ok()).toBeTruthy();

		const json = await res.json();
		expect(json.data.title).toContain('Case #2026-02');
		expect(json.data.priority).toBe('high');
	});

	test('GET /api/cases filters by status', async ({ request }) => {
		// Update one to in_progress first (may already be from prior test)
		await request.patch(`/api/cases/${seeded[0].id}`, {
			data: { status: 'in_progress' }
		});

		const res = await request.get('/api/cases?status=in_progress&limit=100');
		expect(res.ok()).toBeTruthy();

		const json = await res.json();
		const titles = (json.data ?? []).map((c: SeedCaseResult) => c.title);
		expect(titles).toContain(seeded[0].title);
	});

	test('GET /api/cases filters by search query', async ({ request }) => {
		const res = await request.get(
			`/api/cases?search=${encodeURIComponent('People v. Doe')}&limit=100`
		);
		expect(res.ok()).toBeTruthy();

		const json = await res.json();
		expect(json.data.length).toBeGreaterThanOrEqual(1);
		expect(json.data[0].title).toContain('People v. Doe');
	});

	test('unauthorized request returns 401', async ({ playwright }) => {
		// Create a fresh request context with no cookies
		const freshContext = await playwright.request.newContext();
		const res = await freshContext.get('/api/cases');
		expect(res.status()).toBe(401);
		await freshContext.dispose();
	});
});
