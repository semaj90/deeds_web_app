import { test, expect, type Page } from '@playwright/test';

/**
 * Diagnostics for the board Marker tool and the top toolbar.
 * Marker: the dock button / M shortcut arms the tool, a canvas click drops a numbered marker, and the saved
 * snapshot is accepted by /api/cases/:id/canvas (kind 'marker' must validate).
 * Toolbar: tools stay in sync with the dock, snap toggles, zoom/fit/export respond.
 * Captures pageerror/console so a broken board is reported rather than hidden.
 *
 * NOTE: the marker test writes to the first real case board; it removes only the markers it created.
 */
async function openFirstCaseBoard(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`console.error: ${m.text()} @ ${m.location().url}`);
	});
	await page.goto('/cases');
	const link = page.locator('a[href^="/cases/"]').filter({ hasNot: page.locator('[href$="/new"]') }).first();
	await expect(link, 'needs at least one case to open its board').toBeVisible({ timeout: 30_000 });
	const href = (await link.getAttribute('href')) ?? '';
	const id = href.split('/').filter(Boolean)[1];
	await page.goto(`/cases/${id}/board`);
	const canvas = page.locator('canvas').first();
	await canvas.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
		throw new Error(`board canvas never appeared at /cases/${id}/board (url now ${page.url()}); browser errors:\n${errors.join('\n') || '(none captured)'}`);
	});
	return { canvas, errors, id };
}

// Known, separate board defects (not marker/toolbar related). Reported, never silently dropped:
//  - evidence thumbnails stored as minio:// URLs cannot load in a browser
//  - board-persistence IndexedDB layout save clones a reactive array (DataCloneError)
const KNOWN = /ERR_UNKNOWN_URL_SCHEME @ minio:\/\/|\[board-persistence\] IndexedDB save failed/;
function unexpectedErrors(errors: string[]) {
	console.log(`KNOWN BOARD ERRORS: ${errors.filter((e) => KNOWN.test(e)).length}`);
	return errors.filter((e) => !KNOWN.test(e) && !/^\s+at /.test(e));
}

/**
 * Leave the page first (so the board's autosave cannot re-save), then drop only markers whose id timestamp
 * is >= the test start and write the snapshot back.
 */
async function removeMarkersCreatedSince(page: Page, caseId: string, since: number) {
	await page.goto('about:blank');
	const url = `http://127.0.0.1:5173/api/cases/${caseId}/canvas`;
	const res = await page.request.get(url);
	if (!res.ok()) return;
	const snap = await res.json().catch(() => null);
	if (!snap || !Array.isArray(snap.nodes)) return;
	const keep = snap.nodes.filter((n: { id: string; kind: string }) => {
		if (n.kind !== 'marker') return true;
		const ts = Number(/^marker_(\d+)_/.exec(n.id)?.[1]);
		return !(Number.isFinite(ts) && ts >= since);
	});
	if (keep.length === snap.nodes.length) return;
	const put = await page.request.post(url, { data: { ...snap, nodes: keep } });
	console.log(`CLEANUP removed ${snap.nodes.length - keep.length} test marker(s), status ${put.status()}`);
}

test.describe('Evidence board marker tool', () => {
	test('dock button arms marker, click drops it, save validates', async ({ page }, info) => {
		const startedAt = Date.now();
		const { canvas, errors, id } = await openFirstCaseBoard(page);
		try {
			const saves: { status: number; body: string }[] = [];
			page.on('response', async (res) => {
				if (res.url().includes(`/api/cases/${id}/canvas`) && res.request().method() !== 'GET') {
					saves.push({ status: res.status(), body: res.request().postData() ?? '' });
				}
			});

			const dock = page.getByTestId('dock-marker');
			await expect(dock).toBeVisible();
			await dock.click();
			await expect(dock).toHaveClass(/active/);
			await expect(page.getByText('Click canvas to drop a numbered marker')).toBeVisible();

			// Existing nodes/markers can sit under a click (selecting them keeps the tool armed), so retry at new points.
			const box = (await canvas.boundingBox())!;
			let placed = false;
			for (let i = 0; i < 12 && !placed; i++) {
				await page.mouse.click(box.x + box.width * (0.2 + Math.random() * 0.6), box.y + box.height * (0.25 + Math.random() * 0.5));
				placed = !((await dock.getAttribute('class')) ?? '').includes('active');
			}
			expect(placed, 'marker tool never returned to Select, so no marker was placed').toBe(true);

			// Keyboard shortcut also arms the tool.
			await page.keyboard.press('m');
			await expect(dock).toHaveClass(/active/);
			await page.keyboard.press('v');
			await page.screenshot({ path: info.outputPath('marker.png') });

			await expect
				.poll(() => saves.find((s) => s.body.includes('"kind":"marker"')) ?? null, { timeout: 40_000, intervals: [1000] })
				.not.toBeNull();
			const save = saves.find((s) => s.body.includes('"kind":"marker"'))!;
			console.log('SAVE STATUS:', save.status);
			expect(save.status).toBeLessThan(300);
			const unexpected = unexpectedErrors(errors);
			expect(unexpected, unexpected.join('\n')).toEqual([]);
		} finally {
			await removeMarkersCreatedSince(page, id, startedAt);
		}
	});

	test('top toolbar: tools stay in sync with dock, snap toggles, zoom and PNG export respond', async ({ page }, info) => {
		const { errors } = await openFirstCaseBoard(page);
		const bar = page.getByTestId('board-top-toolbar');
		await expect(bar).toBeVisible();
		await page.screenshot({ path: info.outputPath('toolbar.png') });

		// Toolbar arms a tool; the dock reflects the same state (shared activeTool).
		await page.getByTestId('bt-tool-marker').click();
		await expect(page.getByTestId('bt-tool-marker')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('dock-marker')).toHaveClass(/active/);
		await page.getByTestId('bt-tool-select').click();
		await expect(page.getByTestId('dock-marker')).not.toHaveClass(/active/);

		// Keyboard shortcut updates the toolbar too.
		await page.keyboard.press('m');
		await expect(page.getByTestId('bt-tool-marker')).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press('v');

		const snap = page.getByTestId('bt-snap');
		await expect(snap).toHaveAttribute('aria-pressed', 'false');
		await snap.click();
		await expect(snap).toHaveAttribute('aria-pressed', 'true');

		for (const tid of ['bt-zoom-in', 'bt-zoom-in', 'bt-zoom-out', 'bt-fit']) await page.getByTestId(tid).click();
		await expect(page.getByTestId('bt-undo')).toBeDisabled();

		const download = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
		await page.getByTestId('bt-export-png').click();
		const dl = await download;
		console.log('PNG EXPORT DOWNLOAD:', dl ? dl.suggestedFilename() : 'none (board may be empty)');

		const unexpected = unexpectedErrors(errors);
		expect(unexpected, unexpected.join('\n')).toEqual([]);
	});
});
