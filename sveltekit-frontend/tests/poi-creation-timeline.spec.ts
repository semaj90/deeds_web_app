import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('POI Creation & Timeline', () => {
	let createdPoiId: string | null = null;

	test('can create a POI with crimes via the form', async ({ page }) => {
		await page.goto(`${BASE_URL}/persons-of-interest/create`);
		await page.waitForLoadState('networkidle');

		// Fill in the form
		await page.fill('#name', 'Test Subject Alpha');
		await page.fill('#aliases', 'Alpha One, The Ghost');
		await page.fill('#relationship', 'Primary suspect');
		await page.selectOption('#status', 'wanted');
		await page.selectOption('#threatLevel', 'high');
		await page.fill('#crimes', 'Wire Fraud, Money Laundering, Identity Theft');
		await page.fill('#description', 'Automated Playwright test POI');

		// Submit
		await page.click('button[type="submit"]');

		// Should redirect to the POI detail page
		await page.waitForURL(/\/persons-of-interest\/[a-f0-9-]+/, { timeout: 10000 });
		const url = page.url();
		const match = url.match(/\/persons-of-interest\/([a-f0-9-]+)/);
		expect(match).toBeTruthy();
		createdPoiId = match?.[1] ?? null;

		// Verify the POI name appears on the detail page (use filter to avoid layout h1)
		await expect(page.locator('h1').filter({ hasText: 'Test Subject Alpha' })).toBeVisible();

		// Verify crimes are displayed (alias-tag class used for both aliases and crimes)
		const tags = page.locator('.alias-tag');
		await expect(tags.first()).toBeVisible({ timeout: 5000 });
	});

	test('can view timeline tab and add an event via drawer', async ({ page }) => {
		// First create a POI via API for a clean test
		const createRes = await page.request.post(`${BASE_URL}/api/persons-of-interest`, {
			data: {
				name: 'Timeline Test Person',
				status: 'surveillance',
				threatLevel: 'medium',
				crimes: ['Fraud', 'Trespassing'],
			},
		});
		expect(createRes.ok()).toBeTruthy();
		const poi = await createRes.json();
		const poiId = poi.id;
		expect(poiId).toBeTruthy();

		// Navigate to POI detail
		await page.goto(`${BASE_URL}/persons-of-interest/${poiId}`);
		await page.waitForLoadState('networkidle');

		// Click Timeline tab
		await page.click('button:has-text("Timeline")');
		await page.waitForTimeout(500);

		// Should show empty state with "Add First Event" button
		await expect(page.locator('text=No timeline events yet')).toBeVisible();

		// Click Add Event to open drawer
		await page.click('button:has-text("Add First Event")');
		await page.waitForTimeout(300);

		// Drawer should be visible
		await expect(page.locator('.drawer-panel')).toBeVisible();

		// Fill in event form
		await page.fill('#evt-title', 'Initial Sighting');
		await page.selectOption('#evt-type', 'sighting');
		await page.selectOption('#evt-severity', 'medium');
		await page.fill('#evt-location', 'Downtown District, Building 7');
		await page.fill('#evt-desc', 'Subject observed near target location at 14:30');

		// Submit
		await page.click('button:has-text("Save Event")');
		await page.waitForTimeout(1000);

		// Drawer should close
		await expect(page.locator('.drawer-panel')).not.toBeVisible();

		// Timeline should now show the event
		await expect(page.locator('.timeline-title')).toContainText('Initial Sighting');
		await expect(page.locator('.timeline-location')).toContainText('Downtown District');

		// Verify event was persisted via API
		const timelineRes = await page.request.get(`${BASE_URL}/api/persons-of-interest/${poiId}/timeline`);
		expect(timelineRes.ok()).toBeTruthy();
		const timeline = await timelineRes.json();
		expect(timeline.events.length).toBeGreaterThanOrEqual(1);
		expect(timeline.events[0].title).toBe('Initial Sighting');

		// Cleanup: delete the test POI
		await page.request.delete(`${BASE_URL}/api/persons-of-interest/${poiId}`);
	});

	test('timeline API returns events sorted by date', async ({ page }) => {
		// Create a POI
		const createRes = await page.request.post(`${BASE_URL}/api/persons-of-interest`, {
			data: { name: 'API Sort Test', status: 'active', threatLevel: 'low' },
		});
		expect(createRes.ok()).toBeTruthy();
		const poi = await createRes.json();
		const poiId = poi.id;
		expect(poiId).toBeTruthy();

		// Add two events with different dates
		const ev1 = await page.request.post(`${BASE_URL}/api/persons-of-interest/${poiId}/timeline`, {
			data: {
				title: 'Older Event',
				eventDate: '2025-01-15T10:00:00.000Z',
				eventType: 'note',
				severity: 'low',
			},
		});
		expect(ev1.ok()).toBeTruthy();

		const ev2 = await page.request.post(`${BASE_URL}/api/persons-of-interest/${poiId}/timeline`, {
			data: {
				title: 'Newer Event',
				eventDate: '2026-03-01T14:00:00.000Z',
				eventType: 'arrest',
				severity: 'high',
			},
		});
		expect(ev2.ok()).toBeTruthy();

		// Fetch timeline - should be newest first
		const timelineRes = await page.request.get(`${BASE_URL}/api/persons-of-interest/${poiId}/timeline`);
		const timeline = await timelineRes.json();
		expect(timeline.events.length).toBe(2);
		expect(timeline.events[0].title).toBe('Newer Event');
		expect(timeline.events[1].title).toBe('Older Event');

		// Cleanup
		await page.request.delete(`${BASE_URL}/api/persons-of-interest/${poiId}`);
	});

	test.afterAll(async ({ request }) => {
		// Cleanup any leftover test POI from the first test
		if (createdPoiId) {
			await request.delete(`${BASE_URL}/api/persons-of-interest/${createdPoiId}`);
		}
	});
});
