/**
 * Case Notes Lifecycle E2E Tests
 *
 * Tests the full case + notes lifecycle:
 *   1. Create a case via API
 *   2. Navigate to the case notes page
 *   3. Create a note via API
 *   4. Generate an AI note (skip if Ollama unavailable)
 *   5. Cleanup
 *
 * Prerequisites:
 *   - Dev server running (npm run dev)
 *   - PostgreSQL accessible (port 5432)
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
	registerTestUser,
	seedCasesForUser,
	cleanupSeededCases,
	type SeedCaseResult,
} from './utils/seed-cases';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('Case Notes Lifecycle', () => {
	test.describe.configure({ mode: 'serial' });

	let apiContext: APIRequestContext;
	let testCase: SeedCaseResult;
	let noteId: string;

	test.beforeAll(async ({ playwright }) => {
		apiContext = await playwright.request.newContext({ baseURL: BASE_URL });
		await registerTestUser(apiContext);

		const seeded = await seedCasesForUser({
			request: apiContext,
			cases: [
				{
					title: 'Notes Lifecycle Test Case',
					description: 'Playwright test for case notes CRUD lifecycle',
				},
			],
		});
		testCase = seeded[0];
		expect(testCase.id).toBeTruthy();
	});

	test.afterAll(async () => {
		if (testCase?.id) {
			await cleanupSeededCases({ request: apiContext, caseIds: [testCase.id] });
		}
		await apiContext.dispose();
	});

	test('1. case was created with valid ID', async () => {
		expect(testCase.id).toBeTruthy();
		expect(testCase.title).toContain('Notes Lifecycle Test Case');

		// Verify via GET
		const res = await apiContext.get(`/api/cases/${testCase.id}`);
		expect(res.ok()).toBeTruthy();
		const json = await res.json();
		expect(json.data.id).toBe(testCase.id);
	});

	test('2. case notes page renders', async ({ page }) => {
		await registerTestUser(page.request);

		await page.goto(`${BASE_URL}/cases/${testCase.id}/notes`, {
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		});

		// Page should load without 500 errors
		const body = await page.textContent('body');
		expect(body).not.toContain('Internal Error');
		expect(body).not.toContain('500');

		// CaseNotesEditor or notes area should be present
		await page.waitForTimeout(2000);
		await page.screenshot({ path: 'test-results/case-notes-page.png' });
	});

	test('3. create a text note via API', async () => {
		const res = await apiContext.post(`/api/cases/${testCase.id}/notes`, {
			data: {
				title: '[PW-TEST] Manual Test Note',
				content:
					'This is a test note created by Playwright. It contains legal analysis content for verification purposes.',
				isAI: false,
			},
		});

		expect(res.status()).toBe(201);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(json.note).toBeTruthy();
		expect(json.note.content).toContain('test note created by Playwright');
		noteId = json.note.id;
	});

	test('4. notes list contains the created note', async () => {
		const res = await apiContext.get(`/api/cases/${testCase.id}/notes`);
		expect(res.ok()).toBeTruthy();

		const json = await res.json();
		expect(json.success).toBe(true);
		expect(Array.isArray(json.notes)).toBe(true);
		expect(json.notes.length).toBeGreaterThanOrEqual(1);

		const found = json.notes.find((n: any) => n.id === noteId);
		expect(found).toBeTruthy();
		expect(found.title).toBe('[PW-TEST] Manual Test Note');
	});

	test('5. create AI note (skip if Ollama unavailable)', async () => {
		// Check Ollama availability
		let ollamaAvailable = false;
		try {
			const healthRes = await apiContext.fetch('http://127.0.0.1:11434/api/tags', {
				timeout: 5000,
			});
			ollamaAvailable = healthRes.ok();
		} catch {
			ollamaAvailable = false;
		}

		test.skip(!ollamaAvailable, 'Ollama unavailable — skipping AI note test');

		const res = await apiContext.post(`/api/cases/${testCase.id}/notes`, {
			data: {
				title: '[PW-TEST] AI-Generated Note',
				content:
					'AI analysis: The evidence suggests a pattern consistent with the legal precedent established in Terry v. Ohio, 392 U.S. 1 (1968).',
				isAI: true,
			},
		});

		expect(res.status()).toBe(201);
		const json = await res.json();
		expect(json.note.isAI).toBe(true);
	});
});
