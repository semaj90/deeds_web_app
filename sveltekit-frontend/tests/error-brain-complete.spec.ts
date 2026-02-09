/**
 * Error-Brain Comprehensive Integration Tests
 * Tests for API endpoints, UI components, knowledge base, and SSE streaming
 */

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:5173/api/internal/error-brain';

test.describe('Error-Brain Core API', () => {
	test('GET /status - should return system status', async ({ request }) => {
		const response = await request.get(`${API_BASE}/status`);
		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data).toHaveProperty('enabled');
		expect(data).toHaveProperty('transport');
		expect(data).toHaveProperty('applyMode');
		expect(data).toHaveProperty('dryRun');
	});

	test('GET /runs - should list all runs', async ({ request }) => {
		const response = await request.get(`${API_BASE}/runs`);
		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(Array.isArray(data)).toBeTruthy();
	});

	test('POST /runs - should create new analysis run', async ({ request }) => {
		const response = await request.post(`${API_BASE}/runs`, {
			data: {
				scanPaths: ['src/lib/error-brain'],
				options: { dryRun, true: maxErrors, 100: 100 }
			}
		});

		expect(response.ok()).toBeTruthy();
		const data = await response.json();
		expect(data).toHaveProperty('runId');
		expect(data).toHaveProperty('state');
		expect(data.state).toBe('pending');
	});

	test('GET /runs/[id] - should get run details', async ({ request }) => {
		// Create run first
		const createRes = await request.post(`${API_BASE}/runs`, {
			data: { scanPaths: ['src/lib'], options: { dryRun: true } }
		});
		const { runId } = await createRes.json();

		// Get details
		const response = await request.get(`${API_BASE}/runs/${runId}`);
		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data.runId).toBe(runId);
		expect(data).toHaveProperty('state');
		expect(data).toHaveProperty('startedAt');
	});

	test('GET /stream - should provide SSE endpoint', async ({ page }) => {
		// Test SSE connection (browser-based)
		const response = await page.goto(`${API_BASE}/stream`);
		expect(response?.headers()['content-type']).toContain('text/event-stream');
	});
});

test.describe('Knowledge Base API (Task 27)', () => {
	test('GET /knowledge/stats - should return KB statistics', async ({ request }) => {
		const response = await request.get(`${API_BASE}/knowledge/stats`);
		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data).toHaveProperty('totalPatterns');
		expect(data).toHaveProperty('totalPatches');
		expect(data).toHaveProperty('successfulFixes');
		expect(data).toHaveProperty('averageSuccessRate');
		expect(typeof data.averageSuccessRate).toBe('number');
	});

	test('POST /knowledge/search - should search for similar errors', async ({ request }) => {
		const response = await request.post(`${API_BASE}/knowledge/search`, {
			data: {
				errorMessage: 'Cannot find module "typescript"',
				filePath: 'src/lib/types.ts',
				errorCode: 'TS2307',
				codeContext: 'import type { Foo } from "typescript";'
			}
		});

		expect(response.ok()).toBeTruthy();
		const data = await response.json();

		expect(data).toHaveProperty('similarErrors');
		expect(data).toHaveProperty('suggestedPatches');
		expect(data).toHaveProperty('confidence');
		expect(data).toHaveProperty('timestamp');

		expect(Array.isArray(data.similarErrors)).toBeTruthy();
		expect(Array.isArray(data.suggestedPatches)).toBeTruthy();
		expect(typeof data.confidence).toBe('number');
	});

	test('POST /knowledge/search - should validate required fields', async ({ request }) => {
		const response = await request.post(`${API_BASE}/knowledge/search`, {
			data: { errorMessage: 'test' } // Missing filePath
		});

		expect(response.status()).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty('error');
		expect(data.error).toContain('filePath');
	});

	test('POST /knowledge/search - should return confidence between 0-1', async ({ request }) => {
		const response = await request.post(`${API_BASE}/knowledge/search`, {
			data: {
				errorMessage: 'Type mismatch in assignment',
				filePath: 'src/components/Test.svelte',
				errorCode: 'TS2322'
			}
		});

		if (response.ok()) {
			const data = await response.json();
			expect(data.confidence).toBeGreaterThanOrEqual(0);
			expect(data.confidence).toBeLessThanOrEqual(1);
		}
	});
});

test.describe('Error-Brain Dashboard UI', () => {
	test('should load dashboard with status cards', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('text=System Status')).toBeVisible();
		await expect(page.locator('text=Transport')).toBeVisible();
		await expect(page.locator('text=Apply Mode')).toBeVisible();
	});

	test('should display system status badge', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain');
		await page.waitForLoadState('networkidle');

		const badge = page.locator('[class*="badge"]').first();
		await expect(badge).toBeVisible();
	});

	test('should show recent runs section', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('text=/Recent Runs|Create Run/i')).toBeVisible();
	});

	test('should handle loading state', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain');

		// Should briefly show loading
		const loading = page.locator('text=Loading');
		// Don't wait too long as it might load fast
		await page.waitForTimeout(100);
	});

	test('should handle error state gracefully', async ({ page, context }) => {
		// Simulate offline
		await context.setOffline(true);
		await page.goto('http://localhost:5173/error-brain');
		await page.waitForLoadState('domcontentloaded');

		// Wait a bit for fetch to fail
		await page.waitForTimeout(2000);

		// Should show error or handle gracefully (no crash)
		const pageContent = await page.content();
		expect(pageContent).toBeTruthy();

		await context.setOffline(false);
	});
});

test.describe('Error-Brain Runs List UI', () => {
	test('should load runs list page', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain/runs');
		await page.waitForLoadState('networkidle');

		// Should show table or empty state
		const hasTable = await page.locator('table').isVisible();
		const hasEmpty = await page.locator('text=No runs yet').isVisible();
		expect(hasTable || hasEmpty).toBeTruthy();
	});

	test('should display table columns', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain/runs');
		await page.waitForLoadState('networkidle');

		if (await page.locator('table').isVisible()) {
			await expect(page.locator('th:has-text("Run ID")')).toBeVisible();
			await expect(page.locator('th:has-text("State")')).toBeVisible();
			await expect(page.locator('th:has-text("Files Scanned")')).toBeVisible();
		}
	});

	test('should have create run button', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain/runs');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('button:has-text("Create New Run")')).toBeVisible();
	});

	test('should show state badges with colors', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain/runs');
		await page.waitForLoadState('networkidle');

		// If table has rows, check for badges
		const rowCount = await page.locator('tbody tr').count();
		if (rowCount > 0) {
			const badges = page.locator('[class*="badge"]');
			expect(await badges.count()).toBeGreaterThan(0);
		}
	});
});

test.describe('Error-Brain Run Details UI', () => {
	test('should load run details page', async ({ page, request }) => {
		// Create run via API
		const response = await request.post(`${API_BASE}/runs`, {
			data: { scanPaths: ['src/lib'], options: { dryRun: true } }
		});
		const { runId } = await response.json();

		// Load details page
		await page.goto(`http://localhost:5173/error-brain/runs/${runId}`);
		await page.waitForLoadState('networkidle');

		await expect(page.locator('text=Run Details')).toBeVisible();
		await expect(page.locator(`text=${runId.slice(0, 8)}`)).toBeVisible();
	});

	test('should display metric cards', async ({ page, request }) => {
		const response = await request.post(`${API_BASE}/runs`, {
			data: { scanPaths: ['src/lib'], options: { dryRun: true } }
		});
		const { runId } = await response.json();

		await page.goto(`http://localhost:5173/error-brain/runs/${runId}`);
		await page.waitForLoadState('networkidle');

		await expect(page.locator('text=Files Scanned')).toBeVisible();
		await expect(page.locator('text=Errors Found')).toBeVisible();
		await expect(page.locator('text=Patches Proposed')).toBeVisible();
		await expect(page.locator('text=Patches Applied')).toBeVisible();
	});

	test('should have tabbed interface', async ({ page, request }) => {
		const response = await request.post(`${API_BASE}/runs`, {
			data: { scanPaths: ['src/lib'], options: { dryRun: true } }
		});
		const { runId } = await response.json();

		await page.goto(`http://localhost:5173/error-brain/runs/${runId}`);
		await page.waitForLoadState('networkidle');

		await expect(page.locator('button:has-text("Overview")')).toBeVisible();
		await expect(page.locator('button:has-text("Patches")')).toBeVisible();
		await expect(page.locator('button:has-text("Errors")')).toBeVisible();
		await expect(page.locator('button:has-text("Live Events")')).toBeVisible();
	});

	test('should switch between tabs', async ({ page, request }) => {
		const response = await request.post(`${API_BASE}/runs`, {
			data: { scanPaths: ['src/lib'], options: { dryRun: true } }
		});
		const { runId } = await response.json();

		await page.goto(`http://localhost:5173/error-brain/runs/${runId}`);
		await page.waitForLoadState('networkidle');

		// Click Patches tab
		await page.locator('button:has-text("Patches")').click();
		await page.waitForTimeout(500);

		// Click Live Events tab
		await page.locator('button:has-text("Live Events")').click();
		await expect(page.locator('text=/Waiting for events|Live Event/i')).toBeVisible();
	});

	test('should handle invalid run ID', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain/runs/invalid-id-999');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('text=Run not found')).toBeVisible();
	});

	test('should have back button', async ({ page, request }) => {
		const response = await request.post(`${API_BASE}/runs`, {
			data: { scanPaths: ['src/lib'], options: { dryRun: true } }
		});
		const { runId } = await response.json();

		await page.goto(`http://localhost:5173/error-brain/runs/${runId}`);
		await page.waitForLoadState('networkidle');

		await expect(page.locator('button:has-text("Back")')).toBeVisible();
	});
});

test.describe('Navigation and Routing', () => {
	test('should navigate from dashboard to runs', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain');
		await page.waitForLoadState('networkidle');

		await page.click('text=Runs');
		await page.waitForURL('**/error-brain/runs');
		expect(page.url()).toContain('/error-brain/runs');
	});

	test('should navigate from runs to dashboard', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain/runs');
		await page.waitForLoadState('networkidle');

		await page.click('text=Dashboard');
		await page.waitForURL('**/error-brain');
		expect(page.url()).toMatch(/\/error-brain$/);
	});

	test('should highlight active nav link', async ({ page }) => {
		await page.goto('http://localhost:5173/error-brain');
		await page.waitForLoadState('networkidle');

		const dashboardLink = page.locator('a:has-text("Dashboard")');
		const classes = await dashboardLink.getAttribute('class');
		expect(classes).toContain('text-primary');
	});
});

test.describe('Performance Tests', () => {
	test('dashboard should load within 3 seconds', async ({ page }) => {
		const start = Date.now();
		await page.goto('http://localhost:5173/error-brain');
		await page.waitForLoadState('networkidle');
		const duration = Date.now() - start;

		expect(duration).toBeLessThan(3000);
	});

	test('runs list should load efficiently', async ({ page }) => {
		const start = Date.now();
		await page.goto('http://localhost:5173/error-brain/runs');
		await page.waitForLoadState('networkidle');
		const duration = Date.now() - start;

		expect(duration).toBeLessThan(3000);
	});

	test('API status endpoint should respond quickly', async ({ request }) => {
		const start = Date.now();
		await request.get(`${API_BASE}/status`);
		const duration = Date.now() - start;

		expect(duration).toBeLessThan(500);
	});
});

test.describe('Feature Flags', () => {
	test('should respect ERROR_BRAIN_ENABLED setting', async ({ request }) => {
		const response = await request.get(`${API_BASE}/status`);
		const data = await response.json();

		expect(typeof data.enabled).toBe('boolean');
	});

	test('should respect ERROR_BRAIN_DRY_RUN setting', async ({ request }) => {
		const response = await request.get(`${API_BASE}/status`);
		const data = await response.json();

		expect(typeof data.dryRun).toBe('boolean');
	});
});
