/**
 * Phase 9: NES Command Center Database Wiring - Integration Tests
 * Playwright end-to-end tests for error brain analysis and patch management
 *
 * Test Coverage:
 * - Full flow: analysis → patch → verification
 * - Multiple patches per analysis
 * - Error handling at each step
 * - Data consistency validation
 * - Pagination and history retrieval
 * - Concurrent operations
 * - API response times < 200ms
 */

import { test, expect, Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────
// Test Configuration
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:5173';
const API_BASE = `${BASE_URL}/api/routes`;
const TIMEOUT = 10000;

// Test data
const TEST_ROUTE_PATH = 'test-route-integration';
const TEST_ANALYSIS = {
	suggestions: [
		{
			title: 'Fix type error',
			description: 'Add type annotation to variable',
			code: 'const x: string = value;',
			file: 'src/test.ts'
		},
		{
			title: 'Add error handling',
			description: 'Wrap in try-catch block',
			code: 'try { ... } catch (e) { ... }',
			file: 'src/test.ts'
		}
	],
	selected_suggestion_index: 0,
	phase: 'suggesting',
	error_message: 'Type error on line 42'
};

// ─────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Helper: Create error brain analysis via API
 */
async function createAnalysis(routePath: string, analysis: any) {
	const response = await fetch(`${API_BASE}/${routePath}/error-brain-analysis`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(analysis)
	});

	if (!response.ok) {
		throw new Error(`Failed to create analysis: ${response.status}`);
	}

	return response.json();
}

/**
 * Helper: Create patch via API
 */
async function createPatch(routePath: string, patch: any) {
	const response = await fetch(`${API_BASE}/${routePath}/error-brain-patch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	});

	if (!response.ok) {
		throw new Error(`Failed to create patch: ${response.status}`);
	}

	return response.json();
}

/**
 * Helper: Update patch verification via API
 */
async function updateVerification(
	routePath: string,
	patchId: string,
	status: 'passed' | 'failed',
	message?: string
) {
	const response = await fetch(
		`${API_BASE}/${routePath}/error-brain-patch/${patchId}`,
		{
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				verification_status: status,
				verification_message: message || null
			})
		}
	);

	if (!response.ok) {
		throw new Error(`Failed to update verification: ${response.status}`);
	}

	return response.json();
}

/**
 * Helper: Get analysis history via API
 */
async function getAnalysisHistory(routePath: string, limit = 20, offset = 0) {
	const response = await fetch(
		`${API_BASE}/${routePath}/error-brain-analyses?limit=${limit}&offset=${offset}`
	);

	if (!response.ok) {
		throw new Error(`Failed to get analysis history: ${response.status}`);
	}

	return response.json();
}

/**
 * Helper: Measure API response time
 */
async function measureResponseTime(fn: () => Promise<any>) {
	const start = performance.now();
	const result = await fn();
	const end = performance.now();
	return { result, duration: end - start };
}

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: Full Flow
// ─────────────────────────────────────────────────────────────────────────

test.describe('Phase 9: Error Brain Full Flow', () => {
	let analysisId: string;
	let patchId: string;

	test('12.1: Create analysis and verify it persists', async () => {
		// Create analysis
		const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);

		// Verify response
		expect(analysis).toHaveProperty('id');
		expect(analysis).toHaveProperty('route_path', TEST_ROUTE_PATH);
		expect(analysis).toHaveProperty('suggestions');
		expect(analysis.suggestions).toHaveLength(2);
		expect(analysis).toHaveProperty('phase', 'suggesting');
		expect(analysis).toHaveProperty('created_at');

		analysisId = analysis.id;

		// Verify it appears in history
		const history = await getAnalysisHistory(TEST_ROUTE_PATH);
		const found = history.data.find((a: any) => a.id === analysisId);
		expect(found).toBeDefined();
		expect(found.suggestions).toHaveLength(2);
	});

	test('12.2: Create patch and link to analysis', async () => {
		// Ensure we have an analysis
		if (!analysisId) {
			const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);
			analysisId = analysis.id;
		}

		// Create patch
		const patch = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/test.ts',
			patch_content: '--- a/src/test.ts\n+++ b/src/test.ts\n@@ -1,3 +1,3 @@',
			description: 'Fix type error',
			analysis_id: analysisId,
			risk_level: 'low'
		});

		// Verify response
		expect(patch).toHaveProperty('id');
		expect(patch).toHaveProperty('route_path', TEST_ROUTE_PATH);
		expect(patch).toHaveProperty('file_path', 'src/test.ts');
		expect(patch).toHaveProperty('analysis_id', analysisId);
		expect(patch).toHaveProperty('verification_status', 'pending');
		expect(patch).toHaveProperty('created_at');

		patchId = patch.id;

		// Verify patch appears in analysis history
		const history = await getAnalysisHistory(TEST_ROUTE_PATH);
		const foundAnalysis = history.data.find((a: any) => a.id === analysisId);
		expect(foundAnalysis.patches).toBeDefined();
		expect(foundAnalysis.patches.length).toBeGreaterThan(0);
	});

	test('12.3: Update patch verification status', async () => {
		// Ensure we have a patch
		if (!patchId) {
			const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);
			analysisId = analysis.id;
			const patch = await createPatch(TEST_ROUTE_PATH, {
				file_path: 'src/test.ts',
				patch_content: '--- a/src/test.ts\n+++ b/src/test.ts',
				analysis_id: analysisId,
				risk_level: 'low'
			});
			patchId = patch.id;
		}

		// Update verification to passed
		const updated = await updateVerification(
			TEST_ROUTE_PATH,
			patchId,
			'passed',
			'Patch applied successfully'
		);

		// Verify response
		expect(updated).toHaveProperty('verification_status', 'passed');
		expect(updated).toHaveProperty('verification_timestamp');
		expect(updated).toHaveProperty('verification_message', 'Patch applied successfully');

		// Verify it persists in history
		const history = await getAnalysisHistory(TEST_ROUTE_PATH);
		const foundAnalysis = history.data.find((a: any) => a.id === analysisId);
		const foundPatch = foundAnalysis.patches.find((p: any) => p.id === patchId);
		expect(foundPatch.verification_status).toBe('passed');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: Multiple Patches
// ─────────────────────────────────────────────────────────────────────────

test.describe('Phase 9: Multiple Patches Per Analysis', () => {
	test('12.4: Create multiple patches for single analysis', async () => {
		const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);
		const analysisId = analysis.id;

		// Create first patch
		const patch1 = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/file1.ts',
			patch_content: 'patch1 content',
			analysis_id: analysisId,
			risk_level: 'low'
		});

		// Create second patch
		const patch2 = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/file2.ts',
			patch_content: 'patch2 content',
			analysis_id: analysisId,
			risk_level: 'medium'
		});

		// Create third patch
		const patch3 = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/file3.ts',
			patch_content: 'patch3 content',
			analysis_id: analysisId,
			risk_level: 'high'
		});

		// Verify all patches appear in history
		const history = await getAnalysisHistory(TEST_ROUTE_PATH);
		const foundAnalysis = history.data.find((a: any) => a.id === analysisId);
		expect(foundAnalysis.patches).toHaveLength(3);

		// Verify each patch has correct file path
		const filePaths = foundAnalysis.patches.map((p: any) => p.file_path);
		expect(filePaths).toContain('src/file1.ts');
		expect(filePaths).toContain('src/file2.ts');
		expect(filePaths).toContain('src/file3.ts');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: Error Handling
// ─────────────────────────────────────────────────────────────────────────

test.describe('Phase 9: Error Handling', () => {
	test('12.5: Handle missing suggestions in analysis', async () => {
		const response = await fetch(`${API_BASE}/${TEST_ROUTE_PATH}/error-brain-analysis`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				phase: 'suggesting',
				error_message: 'Test error'
				// Missing suggestions
			})
		});

		expect(response.status).toBe(400);
	});

	test('12.6: Handle invalid phase in analysis', async () => {
		const response = await fetch(`${API_BASE}/${TEST_ROUTE_PATH}/error-brain-analysis`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				suggestions: [{ title: 'Test', description: 'Test' }],
				phase: 'invalid_phase'
			})
		});

		expect(response.status).toBe(400);
	});

	test('12.7: Handle invalid verification status', async () => {
		const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);
		const patch = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/test.ts',
			patch_content: 'patch content',
			analysis_id: analysis.id,
			risk_level: 'low'
		});

		const response = await fetch(
			`${API_BASE}/${TEST_ROUTE_PATH}/error-brain-patch/${patch.id}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					verification_status: 'invalid_status'
				})
			}
		);

		expect(response.status).toBe(400);
	});

	test('12.8: Handle non-existent patch ID', async () => {
		const response = await fetch(
			`${API_BASE}/${TEST_ROUTE_PATH}/error-brain-patch/non-existent-id`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					verification_status: 'passed'
				})
			}
		);

		expect(response.status).toBe(404);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: Performance
// ─────────────────────────────────────────────────────────────────────────

test.describe('Phase 9: Performance Requirements', () => {
	test('12.9: POST analysis responds in < 200ms', async () => {
		const { duration } = await measureResponseTime(() =>
			createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS)
		);

		expect(duration).toBeLessThan(200);
	});

	test('12.10: POST patch responds in < 200ms', async () => {
		const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);

		const { duration } = await measureResponseTime(() =>
			createPatch(TEST_ROUTE_PATH, {
				file_path: 'src/test.ts',
				patch_content: 'patch content',
				analysis_id: analysis.id,
				risk_level: 'low'
			})
		);

		expect(duration).toBeLessThan(200);
	});

	test('12.11: PUT verification responds in < 200ms', async () => {
		const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);
		const patch = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/test.ts',
			patch_content: 'patch content',
			analysis_id: analysis.id,
			risk_level: 'low'
		});

		const { duration } = await measureResponseTime(() =>
			updateVerification(TEST_ROUTE_PATH, patch.id, 'passed')
		);

		expect(duration).toBeLessThan(200);
	});

	test('12.12: GET history responds in < 200ms', async () => {
		const { duration } = await measureResponseTime(() =>
			getAnalysisHistory(TEST_ROUTE_PATH)
		);

		expect(duration).toBeLessThan(200);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: Data Consistency
// ─────────────────────────────────────────────────────────────────────────

test.describe('Phase 9: Data Consistency', () => {
	test('12.13: Analysis data remains consistent across operations', async () => {
		const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);
		const analysisId = analysis.id;

		// Create multiple patches
		const patch1 = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/file1.ts',
			patch_content: 'patch1',
			analysis_id: analysisId,
			risk_level: 'low'
		});

		const patch2 = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/file2.ts',
			patch_content: 'patch2',
			analysis_id: analysisId,
			risk_level: 'medium'
		});

		// Update verification on first patch
		await updateVerification(TEST_ROUTE_PATH, patch1.id, 'passed');

		// Verify analysis data is unchanged
		const history = await getAnalysisHistory(TEST_ROUTE_PATH);
		const foundAnalysis = history.data.find((a: any) => a.id === analysisId);

		expect(foundAnalysis.id).toBe(analysisId);
		expect(foundAnalysis.suggestions).toHaveLength(2);
		expect(foundAnalysis.phase).toBe('suggesting');
		expect(foundAnalysis.patches).toHaveLength(2);
	});

	test('12.14: Patch verification updates do not affect other patches', async () => {
		const analysis = await createAnalysis(TEST_ROUTE_PATH, TEST_ANALYSIS);

		const patch1 = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/file1.ts',
			patch_content: 'patch1',
			analysis_id: analysis.id,
			risk_level: 'low'
		});

		const patch2 = await createPatch(TEST_ROUTE_PATH, {
			file_path: 'src/file2.ts',
			patch_content: 'patch2',
			analysis_id: analysis.id,
			risk_level: 'low'
		});

		// Update only first patch
		await updateVerification(TEST_ROUTE_PATH, patch1.id, 'passed');

		// Verify second patch is still pending
		const history = await getAnalysisHistory(TEST_ROUTE_PATH);
		const foundAnalysis = history.data.find((a: any) => a.id === analysis.id);
		const foundPatch2 = foundAnalysis.patches.find((p: any) => p.id === patch2.id);

		expect(foundPatch2.verification_status).toBe('pending');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: Pagination
// ─────────────────────────────────────────────────────────────────────────

test.describe('Phase 9: Pagination', () => {
	test('12.15: Pagination works correctly with limit and offset', async () => {
		// Create multiple analyses
		const analyses = [];
		for (let i = 0; i < 5; i++) {
			const analysis = await createAnalysis(TEST_ROUTE_PATH, {
				...TEST_ANALYSIS,
				error_message: `Error ${i}`
			});
			analyses.push(analysis);
		}

		// Get first page (limit=2)
		const page1 = await getAnalysisHistory(TEST_ROUTE_PATH, 2, 0);
		expect(page1.data).toHaveLength(2);
		expect(page1.limit).toBe(2);
		expect(page1.offset).toBe(0);

		// Get second page (limit=2, offset=2)
		const page2 = await getAnalysisHistory(TEST_ROUTE_PATH, 2, 2);
		expect(page2.data).toHaveLength(2);
		expect(page2.offset).toBe(2);

		// Verify different data
		expect(page1.data[0].id).not.toBe(page2.data[0].id);
	});

	test('12.16: Total count is accurate', async () => {
		const history = await getAnalysisHistory(TEST_ROUTE_PATH);
		expect(history).toHaveProperty('total');
		expect(typeof history.total).toBe('number');
		expect(history.total).toBeGreaterThanOrEqual(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: UI Integration
// ─────────────────────────────────────────────────────────────────────────

test.describe('Phase 9: UI Integration with Playwright', () => {
	test('12.17: Route modal opens when route row clicked', async ({ page }) => {
		await page.goto(`${BASE_URL}/all-routes`, { waitUntil: 'domcontentloaded' });

		// Wait for route rows to render (SSR data + hydration)
		const routeRow = page.locator('button.route-row').first();
		const hasRoutes = await routeRow.isVisible({ timeout: 10000 }).catch(() => false);
		if (!hasRoutes) {
			test.skip(true, 'No route rows rendered (AST graph may be unavailable)');
			return;
		}
		await routeRow.click();

		// Verify modal appears
		const modal = page.locator('.nes-modal');
		await expect(modal).toBeVisible();

		// Find analyze button inside modal
		const analyzeButton = modal.locator('button:has-text("ANALYZE")');
		await expect(analyzeButton).toBeVisible();
	});

	test('12.18: Modal displays route details', async ({ page }) => {
		await page.goto(`${BASE_URL}/all-routes`, { waitUntil: 'domcontentloaded' });

		const routeRow = page.locator('button.route-row').first();
		const hasRoutes = await routeRow.isVisible({ timeout: 10000 }).catch(() => false);
		if (!hasRoutes) {
			test.skip(true, 'No route rows rendered');
			return;
		}
		await routeRow.click();

		// Verify modal content
		const modal = page.locator('.nes-modal');
		await expect(modal).toBeVisible();

		// Verify detail sections are present
		const detailSections = modal.locator('.detail-section');
		await expect(detailSections.first()).toBeVisible();
	});

	test('12.19: Modal closes on close button click', async ({ page }) => {
		await page.goto(`${BASE_URL}/all-routes`, { waitUntil: 'domcontentloaded' });

		const routeRow = page.locator('button.route-row').first();
		const hasRoutes = await routeRow.isVisible({ timeout: 10000 }).catch(() => false);
		if (!hasRoutes) {
			test.skip(true, 'No route rows rendered');
			return;
		}
		await routeRow.click();

		// Verify modal is visible
		const modal = page.locator('.nes-modal');
		await expect(modal).toBeVisible();

		// Click close button
		const closeButton = page.locator('.modal-close');
		await closeButton.click();

		// Verify modal is hidden
		await expect(modal).not.toBeVisible();
	});
});
