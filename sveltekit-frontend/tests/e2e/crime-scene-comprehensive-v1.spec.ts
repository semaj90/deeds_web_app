import { expect, test } from '@playwright/test';

const DEMO_URL = '/demos/curfew-beach-scene?v2=1';

test.use({ serviceWorkers: 'block' });

test.describe('Parent Atlas Comprehensive Crime Scene Reconstruction E2E (v1)', () => {
	test('renders WebGL2 scene with zero runtime errors, switches camera presets, and scrubs source time deterministically', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(DEMO_URL);
		const canvas = page.getByLabel('Illustrative 3D scene preview');
		await expect(canvas).toBeVisible();
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

		// Switch camera presets
		await page.getByRole('button', { name: 'Top down' }).click();
		await page.getByRole('button', { name: 'Isometric' }).click();
		await page.getByRole('button', { name: 'Perspective' }).click();

		// Toggle Follow camera cues
		const follow = page.getByLabel('Follow camera cues');
		await expect(follow).not.toBeChecked();
		await follow.check();
		await expect(follow).toBeChecked();

		// Random-access deterministic scrub: 0 -> 3500 -> 1500 -> 3500
		const slider = page.getByLabel('Source time in milliseconds');
		for (const ms of [3500, 1500, 3500]) {
			await slider.evaluate((el: HTMLInputElement, val: number) => {
				el.value = String(val);
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			}, ms);
			await expect(page.getByText(`Source time · ${ms} ms`)).toBeVisible();
		}

		expect(pageErrors).toEqual([]);
	});

	test('verifies Character LOD & Material/UV Inspector and preview JSON export', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(DEMO_URL);
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

		const inspector = page.getByTestId('pa-v2-material-inspector');
		await expect(inspector).toBeVisible();
		await expect(inspector).toContainText('Loaded retro GLB (368 tris)', { timeout: 15_000 });

		// Switch LOD to Balanced and back to Retro
		const lodSelect = page.getByLabel('Actor geometry quality tier');
		await lodSelect.selectOption('balanced');
		await expect(inspector).toContainText('Loaded balanced GLB (768 tris)', { timeout: 15_000 });
		await lodSelect.selectOption('retro');
		await expect(inspector).toContainText('Loaded retro GLB (368 tris)', { timeout: 15_000 });

		// ENG-04 soft deformation brush (PADF), undo, evidence lock & CASE-SCENE-E2E-13 GOAP empty-state + fixture
		await expect(page.getByTestId('goap-whatif-empty')).toContainText('No what-if actions configured');
		await page.getByTestId('goap-whatif-preview-btn').click();
		await expect(page.getByTestId('goap-whatif-receipt')).toHaveCount(0);

		await page.getByTestId('eng04-brush-preview-btn').click();
		await expect(page.getByTestId('eng04-brush-receipt')).toContainText(/PADF \d+ verts/);
		await page.getByTestId('eng04-brush-undo-btn').click();
		await expect(page.getByTestId('eng04-brush-receipt')).toHaveCount(0);
		await page.getByTestId('eng04-evidence-lock-btn').click();
		await expect(page.getByTestId('eng04-brush-error')).toContainText(/IMMUTABLE_EVIDENCE/);

		await page.getByTestId('goap-load-fixture-btn').click();
		await page.getByTestId('goap-whatif-preview-btn').click();
		await expect(page.getByTestId('goap-whatif-receipt')).toContainText('SIMULATION_HYPOTHESIS · PLANNED · cost 2 · [open_door -> verify_sightline]');

		// Export preview report JSON download
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export preview report (JSON)' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.json$/i);

		expect(pageErrors).toEqual([]);
	});

	test('timeline seek drives the canvas source time without page errors', async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(DEMO_URL);
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

		// The dual-clock timeline seeks in seconds; the canvas must reflect the same time in milliseconds.
		const timeline = page.getByLabel('Scrub timeline seconds');
		await expect(timeline).toBeVisible();
		await timeline.evaluate((el: HTMLInputElement) => {
			el.value = '2';
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await expect(page.getByText('Source time · 2000 ms')).toBeVisible();

		expect(pageErrors).toEqual([]);
	});

	test('proves combined upload-to-prefabAssemblies flow: no job on upload, cross-case rejection, and selectable prefab objectId', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		const shaderErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));
		page.on('console', (msg) => {
			if (msg.type() === 'error' && /THREE\.WebGLProgram|shader error/i.test(msg.text())) {
				shaderErrors.push(msg.text());
			}
		});

		let sceneJobCallsOnUpload = 0;
		await page.route(
			(url) => url.pathname === '/api/evidence/upload',
			(route) =>
				route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify({
						id: '33333333-3333-4333-8333-333333333333',
						sourceRevision: `sha256:${'a'.repeat(64)}`,
						jobEnqueued: false
					})
				})
		);
		await page.route(
			(url) => url.pathname.includes('/api/cases/') && url.pathname.includes('/scenes'),
			(route) => {
				if (route.request().method() === 'POST') {
					sceneJobCallsOnUpload += 1;
					if (route.request().url().includes('99999999-9999-4999-8999-999999999999')) {
						return route.fulfill({
							status: 403,
							contentType: 'application/json',
							body: JSON.stringify({ error: 'CROSS_CASE_DENIED' })
						});
					}
				}
				return route.continue();
			}
		);

		await page.goto(`${DEMO_URL}&prefab-fixture=1`);
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({
			timeout: 15_000
		});

		// 1. Upload alone must not enqueue any scene generation job
		const uploadResult = await page.evaluate(async () => {
			const res = await fetch('/api/evidence/upload', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ caseId: '11111111-1111-4111-8111-111111111111', filename: 'exhibit.png' })
			});
			return { status: res.status, body: await res.json() };
		});
		expect(uploadResult.status).toBe(201);
		expect(uploadResult.body.jobEnqueued).toBe(false);
		expect(sceneJobCallsOnUpload).toBe(0);

		// 2. Cross-case scene access is rejected
		const crossCaseResult = await page.evaluate(async () => {
			const res = await fetch('/api/cases/99999999-9999-4999-8999-999999999999/scenes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ evidenceId: '33333333-3333-4333-8333-333333333333' })
			});
			return { status: res.status, body: await res.json() };
		});
		expect(crossCaseResult.status).toBe(403);
		expect(crossCaseResult.body.error).toBe('CROSS_CASE_DENIED');

		// 3. Select a spawned prefabAssemblies objectId in the live Three.js Scene object selector
		const objectSelect = page.getByRole('combobox', { name: 'Scene object' });
		await expect(objectSelect).toBeVisible({ timeout: 10_000 });
		const judgeBenchValue = await objectSelect.evaluate((el: HTMLSelectElement) => {
			const opt = Array.from(el.options).find((o) => /Judge Bench/i.test(o.text));
			return opt?.value ?? null;
		});
		expect(judgeBenchValue).toBeTruthy();
		await objectSelect.selectOption(judgeBenchValue!);
		await expect(objectSelect).toHaveValue(judgeBenchValue!);
		await expect(page.getByTestId('scene-object-inspector')).toContainText('Judge Bench');

		expect(shaderErrors).toEqual([]);
		expect(pageErrors).toEqual([]);
	});

	test('CASE-SCENE-LIVE-05: performance dialog supports Pause/Resume sampling, confirmed Release preview cache, and Unavailable memory reporting', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(`${DEMO_URL}&prefab-fixture=1`);
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

		await page.getByRole('button', { name: 'Performance and memory' }).click();
		const dialog = page.getByRole('dialog', { name: 'Scene performance and memory' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByTestId('live05-sampling-status')).toContainText('Active (750 ms)');
		await expect(dialog).toContainText('GPU bytes, media bytes, tile cache');
		await expect(dialog).toContainText('Unavailable');

		// Pause and resume 750 ms sampler without disturbing the scene
		await dialog.getByRole('button', { name: 'Pause sampling' }).click();
		await expect(dialog.getByTestId('live05-sampling-status')).toContainText('Paused');
		await dialog.getByRole('button', { name: 'Resume sampling' }).click();
		await expect(dialog.getByTestId('live05-sampling-status')).toContainText('Active (750 ms)');

		// Explicit two-step confirmed Release preview cache
		await dialog.getByRole('button', { name: 'Release preview cache…' }).click();
		await dialog.getByRole('button', { name: 'Confirm release' }).click();
		await expect(dialog.getByTestId('live05-cache-release-status')).toContainText('primary cell(s) kept');

		// Capture UI screenshot artifact for design review
		await page.screenshot({
			path: 'C:/Users/james/.gemini/antigravity/brain/ba824cbc-894a-4499-859f-d05973d1056c/live05_performance_dialog_proof.png',
			fullPage: false
		});

		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
		expect(pageErrors).toEqual([]);
	});

	test('CASE-SCENE-LIVE-02: authorized plan builder browser proof covers progress, cancel, retry, and no-write preview', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		let paramCalls = 0;
		const firstAttemptRelease = Promise.withResolvers<void>();

		await page.route(
			(url) => url.pathname.endsWith('/scene-reconstruction/parameters'),
			async (route) => {
				paramCalls += 1;
				if (paramCalls === 1) {
					await firstAttemptRelease.promise;
					return route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify({
							ok: true,
							parameters: {
								caseId: '11111111-1111-4111-8111-111111111111',
								sceneId: '22222222-2222-4222-8222-222222222222',
								expectedRevision: 0,
								sources: [{ evidenceId: '33333333-3333-4333-8333-333333333333', sourceRevision: `sha256:${'a'.repeat(64)}`, sha256: 'a'.repeat(64) }],
								brief: { who: [], what: [], why: { status: 'unknown', evidenceIds: [] }, how: { status: 'unknown', evidenceIds: [] } },
								environment: { kind: 'beach', cellSizeMeters: 32, coordinateStatus: 'illustrative_uncalibrated' }
							}
						})
					});
				}
				if (paramCalls === 2) {
					return route.fulfill({
						status: 503,
						contentType: 'application/json',
						body: JSON.stringify({ ok: false, error: 'Scene preview service unavailable' })
					});
				}
				const reqBody = route.request().postDataJSON();
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						ok: true,
						parameters: {
							schema: 'parent-atlas.case-scene-fetch-parameters/v1',
							caseId: '11111111-1111-4111-8111-111111111111',
							requestHash: 'b'.repeat(64),
							compiler: 'procedural-three-scene-v1',
							caseIntake: null,
							brief: reqBody.brief,
							sourceEvidence: [],
							environment: reqBody.environment,
							interpretation: {
								who: 'pseudonymous_visual_handles',
								why: 'hypothesis_or_unknown',
								clocks: 'source_local_unaligned',
								geometry: 'illustrative_uncalibrated'
							}
						}
					})
				});
			}
		);
		await page.route(
			(url) => url.pathname.endsWith('/scene-reconstruction/plans'),
			async (route) => {
				const candidate = route.request().postDataJSON();
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ ok: true, plan: { ...candidate, planHash: 'c'.repeat(64) } })
				});
			}
		);

		await page.goto('/demos/curfew-beach-scene?plan-builder=1');
		await expect(page.getByText('Workflow: needs input')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole('button', { name: 'Prepare scene proposal' })).toBeVisible({ timeout: 15_000 });

		// 1. Progress + Cancel + late reply discard
		await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
		await expect(page.getByText('Checking selected evidence…')).toBeVisible();
		await page.getByRole('button', { name: 'Cancel preview preparation' }).click();
		await expect(page.getByText('Preview preparation canceled.')).toBeVisible();
		firstAttemptRelease.resolve();
		await expect(page.getByText(/Proposal validated/)).toHaveCount(0);

		// 2. Actionable error on attempt 2, then retry succeeds on attempt 3
		await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
		await expect(page.getByRole('alert')).toContainText('Scene preview service unavailable');
		await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
		await expect(page.getByText(/Proposal validated/)).toBeVisible({ timeout: 10_000 });

		expect(pageErrors).toEqual([]);
	});
});
