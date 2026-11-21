import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const caseId = process.env.PW_SCENE_CASE_ID ?? '';
const caseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const verifyStagingWrite = process.env.PW_SCENE_VERIFY_STAGING_WRITE === '1';

test('authorized Set the Scene handoff reviews a proposal before rendering and selecting an actor', async ({ page }) => {
	test.skip(!caseUuid.test(caseId), 'Set PW_SCENE_CASE_ID to an authorized staging case UUID.');
	const prompt = 'Create an illustrative entry-area blockout and keep all unsupported details unknown.';
	const response = await page.goto(`/cases/${caseId}/crime-scene?${new URLSearchParams({ setScene: '1', mode: 'blockout', prompt })}`);
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { name: 'Build an editable scene' })).toBeVisible();
	await expect(page.getByLabel('Your request')).toHaveValue(prompt);
	await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
	const review = page.getByRole('region', { name: 'Scene proposal review' });
	await expect(review).toBeVisible();
	await expect(review).toContainText(/Illustrative .* scene/);
	await expect(review).toContainText(/Independent source clocks remain separate/);
	await review.getByRole('button', { name: 'Generate Preview' }).click();
	const canvas = page.locator('canvas[aria-label="Illustrative 3D scene preview"]');
	await expect(canvas).toBeVisible();
	await expect(page.getByText(/Illustrative preview ·/)).toBeVisible();
	await page.getByRole('button', { name: 'Top down' }).click();
	await page.getByRole('button', { name: 'Isometric' }).click();
	await page.getByRole('button', { name: 'Perspective' }).click();
	const objectSelect = page.getByLabel('Scene object');
	await expect(objectSelect).toBeVisible();
	const firstSceneObject = await objectSelect.locator('option').nth(1).getAttribute('value');
	expect(firstSceneObject).toBeTruthy();
	await objectSelect.selectOption(firstSceneObject!);
	await expect(page.getByText(new RegExp(`${firstSceneObject} · Illustrative placement`))).toBeVisible();
	await expect(page.getByRole('button', { name: 'Export saved revision report (JSON)' })).toBeDisabled();
	if (!verifyStagingWrite) {
		await expect(page.getByRole('button', { name: 'Save scene draft' })).toBeDisabled();
		await expect(page.getByText(/Saving is disabled because the scene persistence feature gate is off/)).toBeVisible();
	}
});

test('authorized staging blockout saves a scene-time cue, reopens it and exports the same revision', async ({ page }) => {
	test.skip(!verifyStagingWrite || !caseUuid.test(caseId) || !process.env.PW_SCENE_STORAGE_STATE || !process.env.PW_SCENE_BASE_URL,
		'Requires explicit staging write opt-in, URL, case UUID and signed-in storage state.');
	const eventLabel = 'Show illustrative marker';
	const noteText = 'Check marker placement during the draft interval.';
	const prompt = 'Create an illustrative room with a timed marker.';
	const response = await page.goto(`/cases/${caseId}/crime-scene?${new URLSearchParams({ setScene: '1', mode: 'blockout', prompt })}`);
	expect(response?.status()).toBe(200);
	await page.getByLabel('Scene shape').selectOption('indoor');
	await page.getByRole('button', { name: 'Add box blockout' }).click();
	await page.getByLabel('Position · x,y,z meters').fill('1, 0, 2');
	await page.getByRole('button', { name: 'Add timed event' }).click();
	await page.getByLabel('Description', { exact: true }).fill(eventLabel);
	await page.getByLabel('Timeline clock').selectOption({ label: 'Scene time (illustrative)' });
	await page.getByLabel('Start ms').fill('1000');
	await page.getByLabel('End ms').fill('3000');
	const target = await page.getByLabel('Target', { exact: true }).inputValue();
	const objectId = target.replace(/^primitive:/, '');
	expect(target).toMatch(/^primitive:OBJECT-/);
	await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
	await page.getByRole('region', { name: 'Scene proposal review' }).getByRole('button', { name: 'Generate Preview' }).click();
	await expect(page.getByText(/Illustrative preview ·/)).toBeVisible();
	const preview = page.getByLabel('Generated scene preview');
	await expect(preview.getByLabel('Source clock lane').locator('option:checked')).toHaveText('Scene time (illustrative)');
	await preview.getByLabel('Scene object', { exact: true }).selectOption(objectId);
	await preview.getByRole('button', { name: new RegExp(eventLabel) }).click();
	await preview.getByLabel('Draft note at the current scene time').fill(noteText);
	await preview.getByRole('button', { name: 'Add draft note' }).click();

	const saveButton = preview.getByRole('button', { name: 'Save scene draft' });
	await expect(saveButton, 'Staging must already have scene persistence enabled.').toBeEnabled();
	const savedResponsePromise = page.waitForResponse((candidate) =>
		candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/revisions'));
	await saveButton.click();
	const savedResponse = await savedResponsePromise;
	expect(savedResponse.status()).toBe(201);
	const { data: saved } = await savedResponse.json();
	expect(saved.manifest.caseId).toBe(caseId);
	expect(saved.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
	const draft = saved.manifest.proceduralPreviewDraft;
	const [event] = draft.plan.events;
	expect(draft.plan.sources).toEqual([]);
	expect(event).toMatchObject({
		label: eventLabel, evidenceIds: [], sourceEvent: null, status: 'hypothesis', reviewStatus: 'unreviewed',
		clock: { clockId: `scene:${saved.manifest.sceneId}`, evidenceId: null, startMs: 1000, endMs: 3000 },
		targetRefs: [{ kind: 'primitive', targetId: objectId }]
	});
	expect(draft.plan.placements).toContainEqual(expect.objectContaining({ targetId: objectId, positionMeters: [1, 0, 2] }));
	expect(draft.annotations).toEqual([expect.objectContaining({ eventId: event.eventId, objectId, sourceTimeMs: 1000, text: noteText })]);

	const { manifestSha256, manifest } = saved;
	const revisionUrl = `/api/cases/${caseId}/scenes/${manifest.sceneId}/revisions?revision=${manifest.revision}`;
	const readback = await page.request.get(revisionUrl);
	expect(readback.ok()).toBe(true);
	expect((await readback.json()).data).toMatchObject({ manifestSha256, manifest });
	const reopenLink = preview.getByRole('link', { name: `Reopen saved revision ${manifest.revision}` });
	await reopenLink.click();
	await expect(page.getByText(`Opened saved draft revision ${manifest.revision}`, { exact: false })).toBeVisible();
	await expect(preview.getByText(noteText, { exact: false })).toBeVisible();
	const downloaded = page.waitForEvent('download');
	await preview.getByRole('button', { name: 'Export saved revision report (JSON)' }).click();
	const download = await downloaded;
	const report = JSON.parse(await readFile(await download.path(), 'utf8'));
	expect(report).toMatchObject({
		caseId, sceneId: manifest.sceneId, revision: manifest.revision, manifestSha256,
		sourceEvidence: [], plannedEvents: [expect.objectContaining({ eventId: event.eventId, clock: event.clock })],
		annotations: draft.annotations, proceduralGeometry: { placements: draft.plan.placements }
	});
});
