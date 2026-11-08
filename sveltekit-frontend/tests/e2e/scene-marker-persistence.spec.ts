import { test, expect, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Durable marker persistence (create on placement, move on drag release).
 *
 * SAFETY: this test writes. The dev server it talks to must use a DISPOSABLE database.
 * The playwright webServer reuses any server already on :5173, so the server's database
 * is whatever it was started with. This spec refuses to run unless the readback database
 * name contains "scratch" or "rehearsal", and it reads rows back from that same database.
 *
 * Requires:
 *   SCENE_MARKER_E2E_DATABASE_URL  connection string of the scratch database the server uses
 *   RELIEF_TEST_CASE_ID            a case that the scratch user owns, with an image evidence card
 *
 * Covers durable create/move, direct database readback, and reload hydration. Delete is not persisted yet.
 */
const DB_URL = process.env.SCENE_MARKER_E2E_DATABASE_URL ?? '';
const CASE_ID = process.env.RELIEF_TEST_CASE_ID ?? '';

const fixturePng = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

function assertScratch(url: string) {
	const name = new URL(url).pathname.replace(/^\//, '');
	if (!/scratch|rehearsal|scene_marker_full_\d+/i.test(name)) {
		throw new Error(`Refusing to run: database "${name}" is not a scratch database`);
	}
}

async function openRelief(page: Page) {
	await page.route(/\/api\/evidence\/[^/]+\/download(?:\?.*)?$/, (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: fixturePng })
	);
	await page.route(/\/api\/evidence\/[^/]+\/depth-map$/, (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: fixturePng })
	);
	await page.goto(`/cases/${CASE_ID}/board`);
	const card = page
		.locator('.evidence-card')
		.filter({ hasText: /\.png|\.jpe?g|screenshot|fugitivedex/i })
		.first();
	await expect(card, 'needs an image evidence card on the board').toBeVisible({ timeout: 30_000 });
	await card.click();
	await page.getByRole('button', { name: /3D Relief View/i }).click();
	const dialog = page.locator('.e3d-content');
	await expect(dialog).toBeVisible({ timeout: 30_000 });
	await expect(dialog.locator('.e3d-stage')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
	return dialog;
}

test.describe('scene marker persistence', () => {
	test.skip(!DB_URL || !CASE_ID, 'Set SCENE_MARKER_E2E_DATABASE_URL (scratch) and RELIEF_TEST_CASE_ID');
	test.use({ serviceWorkers: 'block' });

	test('placing then dragging a marker commits create and move with a readback', async ({ page }) => {
		assertScratch(DB_URL);
		const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });
		let markerId: string | null = null;
		let sceneKey: string | null = null;
		try {
			const dialog = await openRelief(page);

			const created = page.waitForResponse(
				(r) => r.request().method() === 'POST' && /\/scenes\/[^/]+\/markers$/.test(new URL(r.url()).pathname)
			);
			await dialog.getByRole('button', { name: /Place marker/i }).click();
			const reliefCanvas = dialog.getByRole('application', {
				name: /Interactive source-bound depth relief/i
			});
			const canvasBox = await reliefCanvas.boundingBox();
			expect(canvasBox, 'relief canvas is visible').not.toBeNull();
			await reliefCanvas.click({ position: { x: canvasBox!.width / 2, y: canvasBox!.height / 2 } });
			const createResponse = await created;
			expect(createResponse.status()).toBe(201);
			const createdBody = (await createResponse.json()) as {
				data: { markerId: string; revision: number; position: { x: number; y: number; z: number } };
			};
			const createPayload = createResponse.request().postDataJSON() as { evidenceId: string };
			markerId = createdBody.data.markerId;
			sceneKey = `evidence:${createPayload.evidenceId}`;
			expect(createdBody.data.revision).toBe(1);

			const pin = dialog.locator(`[data-marker-id="${markerId}"]`);
			const box = await pin.boundingBox();
			expect(box, 'marker pin is visible').not.toBeNull();
			const moved = page.waitForResponse(
				(r) => r.request().method() === 'PATCH' && /\/markers\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname)
			);
			const cx = box!.x + box!.width / 2;
			const cy = box!.y + box!.height / 2;
			await page.mouse.move(cx, cy);
			await page.mouse.down();
			await page.mouse.move(cx + 60, cy + 30, { steps: 8 });
			await page.mouse.up();
			expect((await moved).status()).toBe(200);

			const { rows: markerRows } = await pool.query(
				`select revision, pos_x, pos_y, pos_z from scene_markers
				 where id = $1 and case_id = $2 and scene_key = $3 and deleted_at is null`,
				[markerId, CASE_ID, sceneKey]
			);
			expect(markerRows[0]?.revision).toBe(2);
			expect(markerRows).toHaveLength(1);

			const { rows: eventRows } = await pool.query(
				`select event_type, aggregate_revision from scene_events
				 where case_id = $1 and marker_id = $2 order by aggregate_revision`,
				[CASE_ID, markerId]
			);
			expect(eventRows.map((r) => [r.event_type, r.aggregate_revision])).toEqual([
				['MARKER_CREATED', 1],
				['MARKER_MOVED', 2]
			]);

			// Reload: the saved marker must come back from the server, not from page memory.
			const hydrated = page.waitForResponse(
				(r) => r.request().method() === 'GET' && /\/scenes\/[^/]+\/markers$/.test(new URL(r.url()).pathname)
			);
			const reopened = await openRelief(page);
			const hydration = await hydrated;
			expect(hydration.status()).toBe(200);
			const body = (await hydration.json()) as {
				data: { markers: { markerId: string; revision: number; position: { x: number; y: number; z: number } }[] };
			};
			const hydratedMarker = body.data.markers.find((m) => m.markerId === markerId);
			expect(hydratedMarker?.revision).toBe(2);
			expect(hydratedMarker?.position).toEqual({
				x: Number(markerRows[0].pos_x),
				y: Number(markerRows[0].pos_y),
				z: Number(markerRows[0].pos_z)
			});
			await expect(reopened.getByTestId('e3d-save-status')).toContainText(/Loaded \d+ saved marker/);
			await expect(reopened.locator(`[data-marker-id="${markerId}"]`)).toBeVisible();
		} finally {
			if (markerId && sceneKey) {
				await pool.query(
					`delete from scene_event_outbox where event_id in
					 (select id from scene_events where case_id = $1 and scene_key = $2 and marker_id = $3)`,
					[CASE_ID, sceneKey, markerId]
				);
				await pool.query('delete from scene_events where case_id = $1 and scene_key = $2 and marker_id = $3', [
					CASE_ID,
					sceneKey,
					markerId
				]);
				await pool.query('delete from scene_markers where case_id = $1 and scene_key = $2 and id = $3', [
					CASE_ID,
					sceneKey,
					markerId
				]);
			}
			await pool.end();
		}
	});
});
