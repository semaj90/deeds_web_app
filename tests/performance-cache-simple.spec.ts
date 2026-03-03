/**
 * Simplified Performance Tests - No Auth Required
 * Uses dev server's DEV_BYPASS_AUTH=true mode
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const RESULTS_DIR = path.join(process.cwd(), 'scripts', 'tests', 'performance-results');

if (!fs.existsSync(RESULTS_DIR)) {
	fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

interface PerformanceResult {
	test: string;
	timestamp: string;
	metrics: any;
	success: boolean;
	error?: string;
}

const results: PerformanceResult[] = [];

/**
 * Test 4: Cache Dashboard UI (No auth required)
 */
test('Test 4: Cache Dashboard UI', async ({ page }) => {
	const result: PerformanceResult = {
		test: 'Test 4: Cache Dashboard UI',
		timestamp: new Date().toISOString(),
		metrics: {},
		success: false
	};

	try {
		console.log('[Test 4] Testing cache dashboard UI');

		// Navigate to dashboard
		await page.goto(`${BASE_URL}/admin/cache`);
		await page.waitForLoadState('networkidle', { timeout: 10000 });

		// Check for overview cards
		const overviewCards = await page.locator('.stat-card').count();
		console.log(`[Test 4] Found ${overviewCards} overview cards (expected: 5)`);

		// Check for cache sections
		const cacheSections = await page.locator('.cache-section').count();
		console.log(`[Test 4] Found ${cacheSections} cache sections (expected: ≥4)`);

		// Check for export cache section
		const exportSection = await page.locator('text=Report Export Cache').count();
		console.log(`[Test 4] Export cache section: ${exportSection > 0 ? 'found' : 'missing'}`);

		// Check for format breakdown
		const formatBadges = await page.locator('.format-badge').count();
		console.log(`[Test 4] Found ${formatBadges} export format badges`);

		// Verify stats are loading
		const statsVisible = await page.locator('text=/\\d+ total keys/i').first().isVisible();
		console.log(`[Test 4] Stats visible: ${statsVisible}`);

		result.metrics = {
			overviewCards,
			cacheSections,
			exportSectionFound: exportSection > 0,
			formatBadges,
			statsVisible,
			status: overviewCards >= 5 && cacheSections >= 4 ? 'PASS' : 'FAIL'
		};

		result.success = overviewCards >= 5 && cacheSections >= 4;

		expect(overviewCards).toBeGreaterThanOrEqual(5);
		expect(cacheSections).toBeGreaterThanOrEqual(4);
		expect(exportSection).toBeGreaterThan(0);

		console.log('[Test 4] ✅ PASS - Dashboard UI verified');

	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		console.error('[Test 4] ❌ FAIL:', result.error);
		throw error;
	} finally {
		results.push(result);
	}
});

/**
 * Test API: Cache Stats (No auth required in dev)
 */
test('Cache Stats API', async ({ page }) => {
	const result: PerformanceResult = {
		test: 'Cache Stats API',
		timestamp: new Date().toISOString(),
		metrics: {},
		success: false
	};

	try {
		console.log('[Cache Stats] Testing /api/cache/stats');

		const response = await page.request.get(`${BASE_URL}/api/cache/stats`);
		const data = await response.json();

		console.log(`[Cache Stats] Response status: ${response.status()}`);
		console.log(`[Cache Stats] Redis connected: ${data.data?.redis?.connected}`);
		console.log(`[Cache Stats] Template keys: ${data.data?.template?.totalKeys}`);
		console.log(`[Cache Stats] Export keys: ${data.data?.export?.totalKeys}`);
		console.log(`[Cache Stats] LLM responses: ${data.data?.llm?.totalResponses}`);

		result.metrics = {
			statusCode: response.status(),
			redisConnected: data.data?.redis?.connected,
			templateKeys: data.data?.template?.totalKeys,
			exportKeys: data.data?.export?.totalKeys,
			llmResponses: data.data?.llm?.totalResponses,
			status: response.ok() ? 'PASS' : 'FAIL'
		};

		result.success = response.ok() && data.success;

		expect(response.ok()).toBeTruthy();
		expect(data.success).toBeTruthy();
		expect(data.data.redis.connected).toBeTruthy();

		console.log('[Cache Stats] ✅ PASS - API working');

	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		console.error('[Cache Stats] ❌ FAIL:', result.error);
		throw error;
	} finally {
		results.push(result);
	}
});

/**
 * Save results after all tests
 */
test.afterAll(async () => {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const resultsFile = path.join(RESULTS_DIR, `performance-simple-${timestamp}.json`);

	const summary = {
		timestamp: new Date().toISOString(),
		totalTests: results.length,
		passed: results.filter(r => r.success).length,
		failed: results.filter(r => !r.success).length,
		results
	};

	fs.writeFileSync(resultsFile, JSON.stringify(summary, null, 2));

	console.log('\n=== Simple Performance Test Summary ===');
	console.log(`Total Tests: ${summary.totalTests}`);
	console.log(`Passed: ${summary.passed}`);
	console.log(`Failed: ${summary.failed}`);
	console.log(`Results saved to: ${resultsFile}`);
});
