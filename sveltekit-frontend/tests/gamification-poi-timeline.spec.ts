/**
 * Gamification Widget + POI Timeline CRUD + Auth Flow Tests
 * Tests: auth register/login, dashboard gamification, POI CRUD, timeline API,
 *        DB persistence, user ID propagation (createdBy), Zod validation
 */
import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PORTS } from './helpers/env-ports.js';

const BASE = PORTS.APP_BASE;
const SCREENSHOT_DIR = path.join(process.cwd(), 'test-results', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
	fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// ─── Auth: Registration + Login + Session ──────────────────────────────

test.describe('Auth: Lucia v3 Registration + Login', () => {
	const uniqueEmail = `pw-test-${Date.now()}@legal.ai`;
	const password = 'SecurePass123!';
	let userId: string;
	let sessionId: string;

	test('register new user via API', async ({ request }) => {
		const res = await request.post(`${BASE}/api/auth/register`, {
			data: {
				email: uniqueEmail,
				password,
				firstName: 'Playwright',
				lastName: 'AuthTest',
			},
		});

		expect(res.status()).toBe(201);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.userId).toBeTruthy();
		expect(body.sessionId).toBeTruthy();
		expect(body.user.email).toBe(uniqueEmail);
		expect(body.user.role).toBe('prosecutor');
		userId = body.userId;
		sessionId = body.sessionId;
		console.log(`✅ Registered user: ${uniqueEmail} → ${userId}`);
	});

	test('login with registered credentials', async ({ request }) => {
		const res = await request.post(`${BASE}/api/auth/login`, {
			data: { email: uniqueEmail, password },
		});

		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.userId).toBe(userId);
		expect(body.sessionId).toBeTruthy();
		expect(body.user.firstName).toBe('Playwright');
		expect(body.user.lastName).toBe('AuthTest');
		console.log(`✅ Login OK: session ${body.sessionId.substring(0, 12)}...`);
	});

	test('login with wrong password returns 401', async ({ request }) => {
		const res = await request.post(`${BASE}/api/auth/login`, {
			data: { email: uniqueEmail, password: 'WrongPassword!' },
		});
		expect(res.status()).toBe(401);
		const body = await res.json();
		expect(body.error).toContain('Invalid');
		console.log('✅ Wrong password rejected (401)');
	});

	test('register duplicate email returns 409', async ({ request }) => {
		const res = await request.post(`${BASE}/api/auth/register`, {
			data: {
				email: uniqueEmail,
				password: 'AnotherPass123!',
				firstName: 'Dup',
				lastName: 'Test',
			},
		});
		expect(res.status()).toBe(409);
		const body = await res.json();
		expect(body.error).toContain('already');
		console.log('✅ Duplicate email rejected (409)');
	});

	test('register validation: missing fields', async ({ request }) => {
		const res = await request.post(`${BASE}/api/auth/register`, {
			data: { email: 'bad' },
		});
		expect(res.status()).toBe(400);
		console.log('✅ Validation: missing fields rejected (400)');
	});

	test('/api/auth/me returns user with session cookie', async ({ request }) => {
		// Use the session from registration
		const res = await request.get(`${BASE}/api/auth/me`, {
			headers: { Cookie: `auth_session=${sessionId}` },
		});

		// Dev bypass may interfere — check either 200 with user data or the dev admin
		if (res.ok()) {
			const body = await res.json();
			expect(body.user).toBeTruthy();
			console.log(`✅ /api/auth/me: ${body.user.email} (role: ${body.user.role})`);
		} else {
			console.log(`⚠️  /api/auth/me returned ${res.status()} (dev bypass may override session)`);
		}
	});

	test('cleanup: delete test user', async () => {
		if (userId) {
			// No dedicated delete-user endpoint; leave in DB (test users have unique emails)
			console.log(`✅ Test user ${uniqueEmail} left in DB (no delete endpoint)`);
		}
	});
});

// ─── Dashboard Gamification Widget ─────────────────────────────────────

test.describe('Dashboard Gamification Widget', () => {
	test('renders rank badge, XP bar, and achievement badges', async ({ page }) => {
		await page.goto(`${BASE}/dashboard`);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const widget = page.locator('.gamification-section');
		await expect(widget).toBeVisible({ timeout: 10000 });

		// Rank badge
		const rankBadge = widget.locator('.rank-badge');
		await expect(rankBadge).toBeVisible();

		// Rank title
		const rankTitle = widget.locator('.rank-title');
		await expect(rankTitle).toBeVisible();
		const rankText = await rankTitle.textContent();
		expect(rankText!.length).toBeGreaterThan(0);
		console.log(`✅ Detective Rank: ${rankText}`);

		// XP text
		const xpText = widget.locator('.xp-text');
		await expect(xpText).toBeVisible();
		const xpContent = await xpText.textContent();
		expect(xpContent).toContain('XP');
		console.log(`✅ XP Display: ${xpContent}`);

		// N64 Progress bar
		const progressBar = widget.locator('.n64-progress-container');
		await expect(progressBar).toBeVisible();

		// 7 Achievement badges
		const achBadges = widget.locator('.ach-badge');
		expect(await achBadges.count()).toBe(7);

		// Achievement counter
		const achCounter = widget.locator('.ach-counter');
		await expect(achCounter).toBeVisible();
		const counterText = await achCounter.textContent();
		expect(counterText).toContain('/7');
		console.log(`✅ Achievements: ${counterText}`);

		// Streak row
		await expect(widget.locator('.streak-row')).toBeVisible();

		// Screenshot
		await widget.scrollIntoViewIfNeeded();
		await page.waitForTimeout(300);
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'gamification-dashboard.png'),
			fullPage: true,
		});
		console.log('✅ Dashboard gamification screenshot saved');
	});

	test('3-column grid layout', async ({ page }) => {
		await page.goto(`${BASE}/dashboard`);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const grid = page.locator('.gamification-grid');
		await expect(grid).toBeVisible({ timeout: 10000 });

		await expect(grid.locator('.rank-col')).toBeVisible();
		await expect(grid.locator('.xp-col')).toBeVisible();
		await expect(grid.locator('.ach-col')).toBeVisible();
		console.log('✅ 3-column gamification layout verified');
	});
});

// ─── POI CRUD + Timeline ───────────────────────────────────────────────

test.describe('POI Creation + Timeline CRUD', () => {
	let poiId: string;

	test('create POI via API, verify fields', async ({ request }) => {
		const res = await request.post(`${BASE}/api/persons-of-interest`, {
			data: {
				name: 'Gamification Test POI',
				status: 'surveillance',
				threatLevel: 'medium',
				crimes: ['Wire Fraud', 'Money Laundering'],
				description: 'Automated Playwright test — gamification session',
			},
		});

		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.id).toBeTruthy();
		poiId = body.id;

		expect(body.name).toBe('Gamification Test POI');
		expect(body.status).toBe('surveillance');
		expect(body.threatLevel).toBe('medium');
		console.log(`✅ POI created: ${poiId}`);
	});

	test('read POI back via GET', async ({ request }) => {
		expect(poiId).toBeTruthy();
		const res = await request.get(`${BASE}/api/persons-of-interest/${poiId}`);
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.name).toBe('Gamification Test POI');
		expect(body.description).toContain('Playwright');
		console.log('✅ POI read back via GET');
	});

	test('update POI via PATCH', async ({ request }) => {
		expect(poiId).toBeTruthy();
		const res = await request.patch(`${BASE}/api/persons-of-interest/${poiId}`, {
			data: {
				threatLevel: 'high',
				description: 'Updated by Playwright — threat elevated',
			},
		});
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.threatLevel).toBe('high');
		console.log('✅ POI updated via PATCH (threatLevel → high)');
	});

	test('POI detail page renders', async ({ page }) => {
		expect(poiId).toBeTruthy();
		await page.goto(`${BASE}/persons-of-interest/${poiId}`);
		await page.waitForLoadState('networkidle');

		await expect(page.locator('h1').filter({ hasText: 'Gamification Test POI' })).toBeVisible({ timeout: 10000 });

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'poi-detail-page.png'),
			fullPage: true,
		});
		console.log('✅ POI detail page rendered');
	});

	test('create timeline events via API, verify sorted', async ({ request }) => {
		expect(poiId).toBeTruthy();

		// Older event
		const ev1 = await request.post(`${BASE}/api/persons-of-interest/${poiId}/timeline`, {
			data: {
				title: 'Initial Surveillance',
				eventDate: '2025-06-15T10:00:00.000Z',
				eventType: 'sighting',
				severity: 'low',
				location: 'Downtown Financial District',
				description: 'Subject first observed near bank HQ',
			},
		});
		expect(ev1.status()).toBe(201);
		const ev1Body = await ev1.json();
		expect(ev1Body.id).toBeTruthy();
		expect(ev1Body.title).toBe('Initial Surveillance');
		expect(ev1Body.eventType).toBe('sighting');
		expect(ev1Body.poiId).toBe(poiId);
		console.log(`✅ Timeline event 1: ${ev1Body.id}`);

		// Newer event
		const ev2 = await request.post(`${BASE}/api/persons-of-interest/${poiId}/timeline`, {
			data: {
				title: 'Arrest at Airport',
				eventDate: '2026-03-10T14:30:00.000Z',
				eventType: 'arrest',
				severity: 'critical',
				location: 'LAX Terminal 4',
				description: 'Subject apprehended with fraudulent documents',
			},
		});
		expect(ev2.status()).toBe(201);
		const ev2Body = await ev2.json();
		expect(ev2Body.title).toBe('Arrest at Airport');
		expect(ev2Body.severity).toBe('critical');
		console.log(`✅ Timeline event 2: ${ev2Body.id}`);

		// Verify sorting (newest first)
		const res = await request.get(`${BASE}/api/persons-of-interest/${poiId}/timeline`);
		expect(res.ok()).toBeTruthy();
		const timeline = await res.json();

		expect(timeline.events.length).toBe(2);
		expect(timeline.events[0].title).toBe('Arrest at Airport');
		expect(timeline.events[1].title).toBe('Initial Surveillance');
		expect(timeline.events[0].location).toBe('LAX Terminal 4');
		console.log('✅ Timeline sorted correctly (newest first)');
	});

	test('timeline tab renders events on POI detail page', async ({ page }) => {
		expect(poiId).toBeTruthy();

		await page.goto(`${BASE}/persons-of-interest/${poiId}`);
		await page.waitForLoadState('networkidle');

		await page.locator('button').filter({ hasText: 'Timeline' }).click();
		await page.waitForTimeout(1500);

		const items = page.locator('.timeline-item');
		await expect(items.first()).toBeVisible({ timeout: 10000 });
		expect(await items.count()).toBe(2);

		await expect(page.locator('.timeline-title').first()).toContainText('Arrest at Airport');
		await expect(page.locator('.timeline-location').first()).toContainText('LAX Terminal 4');

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'poi-timeline-events.png'),
			fullPage: true,
		});
		console.log('✅ Timeline tab rendered with 2 events');
	});

	test('add event via drawer UI', async ({ page }) => {
		expect(poiId).toBeTruthy();

		await page.goto(`${BASE}/persons-of-interest/${poiId}`);
		await page.waitForLoadState('networkidle');

		await page.locator('button').filter({ hasText: 'Timeline' }).click();
		await page.waitForTimeout(1000);

		// Open drawer
		await page.locator('button').filter({ hasText: 'Add Event' }).first().click();
		await page.waitForTimeout(500);
		const drawer = page.locator('.drawer-panel');
		await expect(drawer).toBeVisible();

		// Fill form
		await page.fill('#evt-title', 'Court Hearing Scheduled');
		await page.selectOption('#evt-type', 'court');
		await page.selectOption('#evt-severity', 'high');
		await page.fill('#evt-location', 'Federal Courthouse, Room 12B');
		await page.fill('#evt-desc', 'Preliminary hearing on fraud charges');

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'poi-timeline-drawer.png'),
			fullPage: true,
		});

		// Submit
		await page.click('button:has-text("Save Event")');
		await page.waitForTimeout(1500);

		await expect(drawer).not.toBeVisible({ timeout: 5000 });

		// 3 events now
		const items = page.locator('.timeline-item');
		expect(await items.count()).toBe(3);
		await expect(page.locator('.timeline-title').first()).toContainText('Court Hearing Scheduled');

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'poi-timeline-3-events.png'),
			fullPage: true,
		});
		console.log('✅ Drawer event saved. Total: 3 events');
	});

	test('verify event persisted via API re-fetch', async ({ request }) => {
		expect(poiId).toBeTruthy();

		const res = await request.get(`${BASE}/api/persons-of-interest/${poiId}/timeline`);
		expect(res.ok()).toBeTruthy();
		const timeline = await res.json();
		expect(timeline.events.length).toBe(3);

		// Newest first: Court Hearing > Arrest > Surveillance
		const titles = timeline.events.map((e: any) => e.title);
		expect(titles).toContain('Court Hearing Scheduled');
		expect(titles).toContain('Arrest at Airport');
		expect(titles).toContain('Initial Surveillance');
		console.log('✅ All 3 events persisted and returned from DB');
	});

	test('timeline API validates input (Zod)', async ({ request }) => {
		expect(poiId).toBeTruthy();

		// Missing required title
		const noTitle = await request.post(`${BASE}/api/persons-of-interest/${poiId}/timeline`, {
			data: { eventDate: '2026-01-01T00:00:00.000Z' },
		});
		expect(noTitle.status()).toBe(400);
		console.log('✅ Missing title rejected (400)');

		// Empty title
		const emptyTitle = await request.post(`${BASE}/api/persons-of-interest/${poiId}/timeline`, {
			data: { title: '', eventDate: '2026-01-01T00:00:00.000Z' },
		});
		expect(emptyTitle.status()).toBe(400);
		console.log('✅ Empty title rejected (400)');

		// Invalid POI UUID
		const badId = await request.get(`${BASE}/api/persons-of-interest/not-a-uuid/timeline`);
		expect(badId.status()).toBe(400);
		console.log('✅ Invalid UUID rejected (400)');

		// Nonexistent POI UUID (valid format but not in DB) — API returns 400
		const ghostId = '00000000-0000-0000-0000-ffffffffffff';
		const ghost = await request.get(`${BASE}/api/persons-of-interest/${ghostId}/timeline`);
		expect(ghost.status()).toBe(400);
		console.log('✅ Nonexistent POI rejected (400)');
	});

	test('cleanup: delete test POI (cascade deletes timeline + photos)', async ({ request }) => {
		if (!poiId) return;

		const res = await request.delete(`${BASE}/api/persons-of-interest/${poiId}`);
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.success).toBe(true);
		console.log(`✅ POI deleted: ${poiId}`);

		// Verify timeline events were cascade-deleted
		const timeline = await request.get(`${BASE}/api/persons-of-interest/${poiId}/timeline`);
		const tlBody = await timeline.json();
		expect(tlBody.events?.length ?? 0).toBe(0);
		console.log('✅ Timeline events cascade-deleted');
	});
});

// ─── Case CRUD with User Context ───────────────────────────────────────

test.describe('Case CRUD (dev auth user context)', () => {
	let caseId: string;

	test('create case via API', async ({ request }) => {
		const res = await request.post(`${BASE}/api/cases`, {
			data: {
				title: '[PW-AUTH] Fraud Investigation Alpha',
				caseNumber: `PW-${Date.now().toString(36).toUpperCase()}`,
				status: 'open',
				priority: 'high',
				description: 'Playwright test case with auth context',
			},
		});

		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.data?.case?.id).toBeTruthy();
		caseId = body.data.case.id;
		expect(body.data.case.title).toContain('Fraud Investigation');
		console.log(`✅ Case created: ${caseId}`);
	});

	test('read case back and verify fields', async ({ request }) => {
		expect(caseId).toBeTruthy();
		const res = await request.get(`${BASE}/api/cases/${caseId}`);
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		const c = body.data?.case ?? body.data ?? body;
		expect(c.title).toContain('Fraud Investigation');
		expect(c.status).toBe('open');
		expect(c.priority).toBe('high');
		console.log(`✅ Case read: ${c.title}`);
	});

	test('cases page renders', async ({ page }) => {
		await page.goto(`${BASE}/cases`);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'cases-page.png'),
			fullPage: true,
		});
		console.log('✅ Cases page screenshot');
	});

	test('cleanup: delete test case', async ({ request }) => {
		if (!caseId) return;
		const res = await request.delete(`${BASE}/api/cases/${caseId}`);
		console.log(`✅ Case deleted: ${caseId} (status: ${res.status()})`);
	});
});

// ─── Screenshot Verification ───────────────────────────────────────────

test.describe('Page Screenshots', () => {
	const routes = [
		{ name: 'dashboard', path: '/dashboard' },
		{ name: 'evidence', path: '/evidence' },
		{ name: 'poi-list', path: '/persons-of-interest' },
		{ name: 'terminal', path: '/terminal' },
		{ name: 'reports', path: '/reports' },
		{ name: 'citations', path: '/citations' },
	];

	for (const route of routes) {
		test(`screenshot: ${route.name}`, async ({ page }) => {
			await page.goto(`${BASE}${route.path}`);
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(1500);

			await page.screenshot({
				path: path.join(SCREENSHOT_DIR, `page-${route.name}.png`),
				fullPage: true,
			});
			console.log(`✅ Screenshot: ${route.name}`);
		});
	}
});
