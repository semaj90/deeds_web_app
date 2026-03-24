/**
 * App Routes Health Check
 *
 * Verifies all (app)/ routes load with 200 status and no SSR 500 errors.
 * Uses DEV_BYPASS_AUTH for access (requires npm run dev).
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

const APP_ROUTES = [
	{ path: '/dashboard', name: 'Dashboard' },
	{ path: '/active-cases', name: 'Active Cases' },
	{ path: '/cases', name: 'Cases' },
	{ path: '/cases/new', name: 'New Case' },
	{ path: '/evidence', name: 'Evidence' },
	{ path: '/evidence-library', name: 'Evidence Library' },
	{ path: '/citations', name: 'Citations' },
	{ path: '/legal-corpus', name: 'Legal Corpus' },
	{ path: '/persons-of-interest', name: 'Persons of Interest' },
	{ path: '/global-search', name: 'Global Search' },
	{ path: '/terminal', name: 'Terminal' },
	{ path: '/analysis-center', name: 'Analysis Center' },
	{ path: '/command-center', name: 'Command Center' },
	{ path: '/rag-search', name: 'RAG Search' },
	{ path: '/admin/knowledge-search', name: 'Admin Knowledge Search' },
	{ path: '/admin/cache', name: 'Admin Cache' },
	{ path: '/admin/dev-tools', name: 'Admin Dev Tools' },
];

const AUTH_ROUTES = [
	{ path: '/login', name: 'Login' },
	{ path: '/register', name: 'Register' },
];

const API_HEALTH_ROUTES = [
	{ path: '/api/health', name: 'API Health' },
	{ path: '/api/auth/me', name: 'Auth Me' },
];

const SCREENSHOT_DIR = 'test-results/route-health-screenshots';

test.describe('App Routes Health Check', () => {
	test.describe.configure({ mode: 'serial' });

	for (const route of APP_ROUTES) {
		test(`${route.name} (${route.path}) loads without errors`, async ({ page }) => {
			const response = await page.goto(`${BASE}${route.path}`, {
				waitUntil: 'domcontentloaded',
				timeout: 60_000,
			});

			expect(response?.status(), `${route.path} returned non-200`).toBe(200);

			const body = await page.textContent('body');
			expect(body).not.toContain('Internal Error');
			expect(body).not.toContain('500 Internal Server Error');
		});
	}

	test('all auth routes load (login, register)', async ({ page }) => {
		for (const route of AUTH_ROUTES) {
			const response = await page.goto(`${BASE}${route.path}`, {
				waitUntil: 'domcontentloaded',
				timeout: 30_000,
			});

			const status = response?.status() ?? 0;
			// Login may 302 redirect when DEV_BYPASS_AUTH is on
			expect([200, 302]).toContain(status);
		}
	});

	test('API health endpoints respond', async ({ request }) => {
		for (const route of API_HEALTH_ROUTES) {
			const response = await request.get(`${BASE}${route.path}`);
			expect(response.status(), `${route.path} failed`).toBe(200);
		}
	});

	test('capture route gallery screenshots', async ({ page }) => {
		const gallery = APP_ROUTES.slice(0, 6); // First 6 routes for gallery
		for (let i = 0; i < gallery.length; i++) {
			const route = gallery[i];
			await page.goto(`${BASE}${route.path}`, {
				waitUntil: 'networkidle',
				timeout: 60_000,
			});
			await page.screenshot({
				path: `${SCREENSHOT_DIR}/${String(i + 1).padStart(2, '0')}-${route.name.toLowerCase().replace(/\s+/g, '-')}.png`,
				fullPage: false,
			});
		}
	});
});
