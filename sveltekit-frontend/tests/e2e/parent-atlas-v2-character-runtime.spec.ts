import { expect, test } from '@playwright/test';

test('synthetic camera cues switch views while scrubbing and yield to the manual camera on overlap', async ({ page }) => {
	const response = await page.goto('/demos/curfew-beach-scene?v2=1', { waitUntil: 'domcontentloaded' });
	expect(response?.status()).toBe(200);
	const canvas = page.getByLabel('Illustrative 3D scene preview');
	await expect(canvas).toBeVisible();
	await expect(page.getByText(/Illustrative preview ·/)).toBeVisible();
	const follow = page.getByLabel('Follow camera cues');
	await expect(follow).not.toBeChecked();
	const seek = (timeMs: number) => page.getByLabel('Source time in milliseconds').evaluate((input: HTMLInputElement, value) => {
		input.value = String(value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, timeMs);
	await seek(1500);
	const manualFrame = await canvas.screenshot();
	await follow.check();
	await expect(page.getByText('Camera cue: Top down', { exact: true })).toBeVisible();
	await expect.poll(async () => (await canvas.screenshot()).equals(manualFrame)).toBe(false);
	await seek(2500);
	await expect(page.getByText('Conflicting camera cues. Using your manual view.')).toBeVisible();
	await seek(3500);
	await expect(page.getByText('Camera cue: Isometric', { exact: true })).toBeVisible();
	await seek(1500);
	await expect(page.getByText('Camera cue: Top down', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Perspective', exact: true }).click();
	await expect(follow).not.toBeChecked();
	await expect(page.getByText('Camera cue: Top down', { exact: true })).toHaveCount(0);
});

const SCREENSHOT_PATH =
	'C:/Users/james/.gemini/antigravity/brain/ba824cbc-894a-4499-859f-d05973d1056c/pa_v2_recipe_canvas_proof.png';

test('Parent Atlas v2 — Retro/Balanced GLB character runtime, shared Walk clip, 100 deterministic seeks, and focus-scoped material/UV hotkeys in SceneRuntimeRecipeCanvas', async ({
	page
}) => {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	const assetRequests: string[] = [];

	page.on('pageerror', (err) => pageErrors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			consoleErrors.push(msg.text());
		}
	});
	page.on('request', (req) => {
		const url = req.url();
		if (url.includes('/parent-atlas/')) {
			assetRequests.push(new URL(url).pathname);
		}
	});

	const response = await page.goto('/demos/curfew-beach-scene?v2=1', {
		waitUntil: 'domcontentloaded'
	});
	expect(response?.status()).toBe(200);

	const canvas = page.locator('canvas[aria-label="Illustrative 3D scene preview"]');
	await expect(canvas).toBeVisible();

	const inspector = page.getByTestId('pa-v2-material-inspector');
	await expect(inspector).toBeVisible();
	await expect(inspector).toContainText('Loaded retro GLB (368 tris) · Walk/Idle synced', {
		timeout: 15_000
	});

	// Proof Gate 5: Both actors loaded Retro GLB + Walk/Idle/Blink motion clips, but each file was fetched only ONCE
	const retroFetches = assetRequests.filter((p) => p.endsWith('f8a611caa751ce7cfbccf57dd54ca6e1a0b1b1e4cef99ad4627282c87f3ef5af.glb'));
	const walkFetches = assetRequests.filter((p) => p.endsWith('92a2e213417a617ed49ca1fa805e911000770c1e4087e35360df29f82a3a6954.glb'));
	expect(retroFetches).toHaveLength(1);
	expect(walkFetches).toHaveLength(1);

	// Select ACTOR-01 from the Scene object selector
	const objectSelect = page.locator('label', { hasText: 'Scene object' }).locator('select');
	await objectSelect.selectOption('ACTOR-01');
	const sceneObjectInspector = page.getByTestId('scene-object-inspector');
	await expect(sceneObjectInspector).toBeVisible();
	await expect(sceneObjectInspector).toContainText('ACTOR-01');
	await expect(sceneObjectInspector).toContainText('Synthetic demonstration character A');
	await expect(sceneObjectInspector).toContainText('EVENT-WALK-01');
	await expect(sceneObjectInspector).toContainText('camera:');
	await expect(sceneObjectInspector).toContainText('1000–3000 ms');
	await expect(sceneObjectInspector.getByRole('link')).toHaveCount(0);

	// Focus the inspector and test focus-scoped hotkeys: 3 (swatch 3), M (unlit), ] (2x UV), U (box UV)
	await inspector.focus();
	await page.keyboard.press('Digit3');
	await expect(inspector).toContainText('Material preview: standard, 1× UV, existing');
	await page.keyboard.press('KeyM');
	await expect(inspector).toContainText('Material preview: unlit, 1× UV, existing');
	await page.keyboard.press('BracketRight');
	await expect(inspector).toContainText('Material preview: unlit, 2× UV, existing');
	await page.keyboard.press('KeyU');
	await expect(inspector).toContainText('Material preview: unlit, 2× UV, box');

	// Undo & Redo buttons
	await inspector.getByRole('button', { name: 'Undo' }).click();
	await expect(inspector).toContainText('Undid material edit (unlit, 2× UV, existing)');
	await inspector.getByRole('button', { name: 'Redo' }).click();
	await expect(inspector).toContainText('Redid material edit (unlit, 2× UV, box)');

	// Proof Gate 3: Textarea keyboard isolation — typing shortcut keys inside textarea must NOT alter material preview
	const noteTextarea = page.locator('textarea');
	await noteTextarea.click();
	await noteTextarea.fill('12345MU[]KJL');
	await expect(inspector.locator('output[aria-label="Current UV tiling"]')).toHaveText('2×');
	await expect(inspector.getByRole('button', { name: /Cycle UV projection/ })).toContainText(
		'UV: box (U)'
	);

	// Proof Gate 6: 100 consecutive source-clock seeks perform ZERO additional GLB/motion/texture fetches
	const requestCountBeforeSeeks = assetRequests.length;
	const slider = page.locator('input[aria-label="Source time in milliseconds"]');
	await slider.evaluate((el: HTMLInputElement) => {
		for (let i = 0; i < 100; i++) {
			const t = (i * 40) % 4000;
			el.value = String(t);
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}
	});
	expect(assetRequests.length).toBe(requestCountBeforeSeeks);

	// Proof Gate 6 / P0-1: Switch LOD from retro to balanced and verify actor selection & status persist
	const lodSelect = inspector.locator('select[aria-label="Actor geometry quality tier"]');
	await lodSelect.selectOption('balanced');
	await expect(inspector).toContainText('Loaded balanced GLB (768 tris) · Walk/Idle synced', {
		timeout: 15_000
	});
	await expect(sceneObjectInspector).toBeVisible();
	await expect(sceneObjectInspector).toContainText('ACTOR-01');

	await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

	expect(pageErrors).toEqual([]);
	expect(consoleErrors).toEqual([]);
});

test('synthetic overlapping event proposals appear as a conflict in the selected object inspector', async ({ page }) => {
	const response = await page.goto('/demos/curfew-beach-scene?conflict-fixture=1', { waitUntil: 'domcontentloaded' });
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('note')).toContainText('two overlapping illustrative movement proposals');
	await expect(page.locator('canvas[aria-label="Illustrative 3D scene preview"]')).toBeVisible();
	await page.getByLabel('Scene object').selectOption('ACTOR-01');
	const inspector = page.getByTestId('scene-object-inspector');
	await expect(inspector).toBeVisible();
	const conflict = inspector.getByRole('alert');
	await expect(conflict).toContainText('Conflicting timeline proposals');
	await expect(conflict).toContainText('EVENT-WALK-01');
	await expect(conflict).toContainText('EVENT-WALK-ALT-01');
	await expect(conflict).toContainText('camera:33333333-3333-4333-8333-333333333333');
	await expect(conflict).toContainText('Playback leaves this object\'s transform unchanged');
});

test('synthetic reviewed-mask fixture renders and edits source-pixel geometry with local undo and redo', async ({ page }) => {
	await page.route('**/api/evidence/**/download?**', (route) => route.fulfill({
		status: 200,
		contentType: 'image/svg+xml',
		body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#d7d4cb"/><path d="M100 90h320v270H100z" fill="#647b70"/></svg>'
	}));
	const response = await page.goto('/demos/curfew-beach-scene?mask-fixture=1', { waitUntil: 'domcontentloaded' });
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('note')).toContainText('invented test data');
	await expect(page.locator('canvas[aria-label="Illustrative 3D scene preview"]')).toBeVisible();
	const objectSelect = page.getByLabel('Scene object');
	const maskOption = objectSelect.getByRole('option', { name: /Synthetic contour editor fixture/ });
	const maskObjectId = await maskOption.getAttribute('value');
	expect(maskObjectId).toBeTruthy();
	await objectSelect.selectOption(maskObjectId!);
	await expect(page.getByText('Edit reviewed contour · source pixels')).toBeVisible();
	await expect(page.getByRole('img', { name: 'Original evidence with selected mask contour overlay' })).toBeVisible();
	await page.getByLabel('Note on this contour', { exact: true }).fill('Compare the outline to the source image.');
	await page.getByRole('button', { name: 'Add contour note' }).click();
	await expect(page.getByLabel('Notes on this contour')).toContainText('Compare the outline to the source image.');
	await expect(page.getByText('Contour notes are unsaved.')).toBeVisible();
	const thirdVertexX = page.getByLabel('X px').nth(2);
	await thirdVertexX.fill('400');
	await thirdVertexX.press('Tab');
	await expect(thirdVertexX).toHaveValue('400');
	await expect(page.getByText(/draft-1/)).toBeVisible();
	await expect(page.getByText(/Contour edits are unsaved/i)).toBeVisible();
	await page.getByRole('button', { name: 'Undo vertex edit' }).click();
	await expect(thirdVertexX).toHaveValue('420');
	await expect(page.getByText(/draft-2/)).toBeVisible();
	await page.getByRole('button', { name: 'Redo vertex edit' }).click();
	await expect(thirdVertexX).toHaveValue('400');
	await expect(page.getByText(/draft-3/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save scene draft' })).toBeDisabled();
});
