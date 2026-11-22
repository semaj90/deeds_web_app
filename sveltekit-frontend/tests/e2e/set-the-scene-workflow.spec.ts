import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sceneReadbackSettings, verifySceneGenerationIndependentReadback } from './scene-generation-independent-readback.js';

const caseId = process.env.PW_SCENE_CASE_ID ?? '';
const caseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const verifyStagingWrite = process.env.PW_SCENE_VERIFY_STAGING_WRITE === '1';
const verifyGeneration = process.env.PW_SCENE_VERIFY_GENERATION === '1';
const verifyIndependent = process.env.PW_SCENE_VERIFY_INDEPENDENT_READBACK === '1';
const stagedEvidenceId = process.env.PW_SCENE_EVIDENCE_ID ?? '';
const stagedSourceEventId = process.env.PW_SCENE_SOURCE_EVENT_ID ?? '';
const verifyCaptions = process.env.PW_SCENE_VERIFY_CAPTIONS === '1';
const contourSceneId = process.env.PW_SCENE_CONTOUR_SCENE_ID ?? '';
const contourEditX = process.env.PW_SCENE_CONTOUR_EDIT_X ?? '';

test('authorized Set the Scene handoff reviews a proposal before rendering and selecting an actor', async ({ page }) => {
	test.skip(!caseUuid.test(caseId), 'Set PW_SCENE_CASE_ID to an authorized staging case UUID.');
	const prompt = 'Create an illustrative entry-area blockout and keep all unsupported details unknown.';
	const response = await page.goto(`/cases/${caseId}/crime-scene?${new URLSearchParams({ setScene: '1', mode: 'blockout', prompt })}`);
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { name: 'Build an editable scene' })).toBeVisible();
	await expect(page.getByLabel('Your request')).toHaveValue(prompt);
	await page.getByRole('button', { name: 'Add box blockout' }).click();
	await page.getByRole('button', { name: 'Add timed event' }).click();
	await page.getByRole('button', { name: 'Add timed event' }).click();
	const descriptions = page.getByLabel('Description', { exact: true });
	await descriptions.nth(0).fill('Illustrative marker');
	await descriptions.nth(1).fill('Illustrative alarm');
	await page.getByLabel('End ms').nth(0).fill('500');
	await page.getByLabel('Start ms').nth(1).fill('250');
	await page.getByLabel('End ms').nth(1).fill('750');
	await page.getByLabel('Presentation behavior').nth(1).selectOption('pulse');
	await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
	const review = page.getByRole('region', { name: 'Scene proposal review' });
	await expect(review).toBeVisible();
	await expect(review).toContainText(/Illustrative .* scene/);
	await expect(review).toContainText(/Independent source clocks remain separate/);
	await review.getByRole('button', { name: 'Generate Preview' }).click();
	const canvas = page.locator('canvas[aria-label="Illustrative 3D scene preview"]');
	await expect(canvas).toBeVisible();
	await expect(page.getByText(/Illustrative preview ·/)).toBeVisible();
	const marker = page.getByRole('button', { name: /Illustrative marker/ });
	const alarm = page.getByRole('button', { name: /Illustrative alarm/ });
	await alarm.click();
	await expect(marker).toContainText('At playhead');
	await expect(alarm).toContainText('At playhead');
	await page.getByRole('button', { name: 'Play source lane' }).click();
	await expect(page.getByRole('button', { name: 'Play source lane' })).toBeVisible();
	await expect(page.getByLabel('Source time in milliseconds')).toHaveValue('750');
	await expect(marker).not.toContainText('At playhead');
	await expect(alarm).not.toContainText('At playhead');
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

const stagingScenarios = [
	{ name: 'authorized staging blockout saves a scene-time cue, reopens it and exports the same revision', generated: false, evidenceBacked: false },
	{ name: 'authorized staging job queues, reloads, opens its worker recipe, saves and exports', generated: true, evidenceBacked: false },
	{ name: 'authorized staging generation preserves a reviewed video event and source clock through export', generated: true, evidenceBacked: true }
];

for (const { name, generated, evidenceBacked } of stagingScenarios) {
test(name, async ({ page }, testInfo) => {
	test.skip(!verifyStagingWrite || !caseUuid.test(caseId) || !process.env.PW_SCENE_STORAGE_STATE || !process.env.PW_SCENE_BASE_URL,
		'Requires explicit staging write opt-in, URL, case UUID and signed-in storage state.');
	test.skip(generated && !verifyGeneration, 'Requires explicit staging generation opt-in.');
	test.skip(evidenceBacked && (!caseUuid.test(stagedEvidenceId) || !caseUuid.test(stagedSourceEventId)),
		'Requires a staging video ID and an already approved source event ID.');
	const readbackSettings = generated && verifyIndependent ? sceneReadbackSettings() : null;
	if (generated && verifyIndependent && !readbackSettings) throw new Error('Independent readback was requested but staging database or storage settings are missing.');
	if (generated) test.setTimeout(180_000);
	let eventLabel = 'Show illustrative marker';
	let startMs = 1000;
	let endMs = 3000;
	let sourceSnapshot: { evidenceId: string; sourceRevision: string; sha256: string }[] = [];
	let sourceEvent: { sourceEvidenceId: string; sourceEventId: string; analysisRevision: string; startMs: number; endMs: number } | null = null;
	const noteText = 'Check marker placement during the draft interval.';
	const prompt = 'Create an illustrative room with a timed marker.';
	const query = new URLSearchParams({ setScene: '1', mode: evidenceBacked ? 'evidence' : 'blockout', prompt });
	if (evidenceBacked) query.append('sourceEvidenceId', stagedEvidenceId);
	const response = await page.goto(`/cases/${caseId}/crime-scene?${query}`);
	expect(response?.status()).toBe(200);
	await page.getByLabel('Scene shape').selectOption('indoor');
	await page.getByRole('button', { name: 'Add box blockout' }).click();
	await page.getByLabel('Position · x,y,z meters').fill('1, 0, 2');
	if (evidenceBacked) {
		await page.getByLabel('Video with reviewed events').selectOption(stagedEvidenceId);
		const timelineResponse = page.waitForResponse((candidate) => {
			const path = new URL(candidate.url()).pathname;
			return candidate.request().method() === 'GET' && path === `/api/evidence/${stagedEvidenceId}/video-events`;
		});
		await page.getByRole('button', { name: 'Load reviewed events' }).click();
		const timelineResult = await timelineResponse;
		expect(timelineResult.ok()).toBe(true);
		const { eventTimeline } = await timelineResult.json();
		expect(eventTimeline).toMatchObject({ evidenceId: stagedEvidenceId, sourceRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
		const canonical = eventTimeline.events.find((item: { eventId: string }) => item.eventId === stagedSourceEventId);
		expect(canonical).toMatchObject({ reviewStatus: 'APPROVED', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' });
		sourceSnapshot = [{ evidenceId: stagedEvidenceId, sourceRevision: eventTimeline.sourceRevision, sha256: eventTimeline.sourceRevision.slice(7) }];
		({ startMs, endMs } = canonical);
		sourceEvent = { sourceEvidenceId: stagedEvidenceId, sourceEventId: stagedSourceEventId,
			analysisRevision: eventTimeline.analysisRevision, startMs, endMs };
		await page.getByLabel('Add reviewed source event').selectOption(stagedSourceEventId);
		eventLabel = await page.getByLabel('Description', { exact: true }).inputValue();
		await expect(page.getByLabel('Timeline clock')).toHaveValue(stagedEvidenceId);
		await expect(page.getByLabel('Start ms')).toHaveValue(String(startMs));
		await expect(page.getByLabel('End ms')).toHaveValue(String(endMs));
		await page.getByLabel('Presentation behavior').selectOption('visible');
	} else {
		await page.getByRole('button', { name: 'Add timed event' }).click();
		await page.getByLabel('Description', { exact: true }).fill(eventLabel);
		await page.getByLabel('Timeline clock').selectOption({ label: 'Scene time (illustrative)' });
		await page.getByLabel('Start ms').fill(String(startMs));
		await page.getByLabel('End ms').fill(String(endMs));
	}
	const target = await page.getByLabel('Target', { exact: true }).inputValue();
	const objectId = target.replace(/^primitive:/, '');
	expect(target).toMatch(/^primitive:OBJECT-/);
	await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
	const review = page.getByRole('region', { name: 'Scene proposal review' });
	await expect(review).toBeVisible();
	let workerOutput: { jobId: string; recipe: { caseId: string; sceneId: string; planHash: string; sceneRevision: number } } | null = null;
	if (generated) {
		const jobPath = `/api/cases/${caseId}/scene-reconstruction/jobs`;
		const jobsPanel = page.getByRole('region', { name: 'Scene generation job' });
		const queued = page.waitForResponse((candidate) =>
			candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === jobPath);
		await jobsPanel.getByRole('button', { name: 'Queue scene generation' }).click();
		const receipt = await queued;
		expect(receipt.status()).toBe(202);
		const { job: { jobId } } = await receipt.json();
		expect(jobId).toMatch(caseUuid);
		const recent = page.waitForResponse((candidate) => {
			const url = new URL(candidate.url());
			return candidate.request().method() === 'GET' && url.pathname === jobPath && url.searchParams.get('view') === 'recent';
		});
		await page.reload();
		expect((await (await recent).json()).job.jobId).toBe(jobId);
		const open = jobsPanel.getByRole('button', { name: 'Open generated preview' });
		await expect(open).toBeEnabled({ timeout: 100_000 });
		const recipeResponse = page.waitForResponse((candidate) => {
			const url = new URL(candidate.url());
			return candidate.request().method() === 'GET' && url.pathname === jobPath && url.searchParams.get('view') === 'recipe';
		});
		await open.click();
		const recipe = await recipeResponse;
		expect(recipe.ok()).toBe(true);
		workerOutput = (await recipe.json()).job;
		expect(workerOutput).toMatchObject({ jobId, recipe: { caseId, sceneRevision: 0, planHash: expect.stringMatching(/^[a-f0-9]{64}$/) } });
	} else {
		await review.getByRole('button', { name: 'Generate Preview' }).click();
	}
	await expect(page.getByText(/Illustrative preview ·/)).toBeVisible();
	const preview = page.getByLabel('Generated scene preview');
	const clockLane = preview.getByLabel('Source clock lane');
	if (evidenceBacked) await expect(clockLane).toHaveValue(`evidence:${stagedEvidenceId}`);
	else await expect(clockLane.locator('option:checked')).toHaveText('Scene time (illustrative)');
	await preview.getByLabel('Scene object', { exact: true }).selectOption(objectId);
	await preview.getByLabel('Events in this source clock lane').getByRole('button', { name: eventLabel, exact: false }).click();
	if (evidenceBacked) await expect(preview.locator(`a[href="/cases/${caseId}/evidence/${stagedEvidenceId}"]`).first()).toBeVisible();
	await preview.getByLabel(evidenceBacked ? 'Draft note at the current source time' : 'Draft note at the current scene time').fill(noteText);
	await preview.getByRole('button', { name: 'Add draft note' }).click();
	if (evidenceBacked && verifyCaptions) {
		const captionResponse = page.waitForResponse((candidate) => {
			const url = new URL(candidate.url());
			return url.pathname === `/api/evidence/${stagedEvidenceId}/video-events` && url.searchParams.get('captionEvent') === stagedSourceEventId;
		});
		await preview.getByLabel('Show cited transcript captions').check();
		const response = await captionResponse;
		expect(response.ok()).toBe(true);
		const body = await response.json();
		expect(body.scope).toMatchObject({ caseId, evidenceId: stagedEvidenceId, eventId: stagedSourceEventId,
			sourceRevision: sourceSnapshot[0]?.sourceRevision, analysisRevision: sourceEvent?.analysisRevision, startMs, endMs });
		const caption = body.captions[0];
		expect(caption).toBeDefined();
		const seek = (timeMs: number) => preview.getByLabel('Source time in milliseconds').evaluate((input: HTMLInputElement, value) => {
			input.value = String(value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}, timeMs);
		await seek(Math.max(startMs, caption.startMs));
		await expect(preview.getByLabel('Transcript captions at playhead')).toContainText(caption.text);
		await seek(endMs);
		await expect(preview.getByLabel('Transcript captions at playhead')).toHaveCount(0);
	}

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
	expect(draft.plan.sources).toEqual(sourceSnapshot);
	if (workerOutput) expect(draft.plan).toMatchObject({ sceneId: workerOutput.recipe.sceneId, planHash: workerOutput.recipe.planHash });
	expect(event).toMatchObject({
		label: eventLabel, evidenceIds: sourceSnapshot.map(({ evidenceId }) => evidenceId), sourceEvent, status: 'hypothesis',
		reviewStatus: evidenceBacked ? 'accepted' : 'unreviewed',
		clock: { clockId: evidenceBacked ? `evidence:${stagedEvidenceId}` : `scene:${saved.manifest.sceneId}`,
			evidenceId: evidenceBacked ? stagedEvidenceId : null, startMs, endMs },
		targetRefs: [{ kind: 'primitive', targetId: objectId }]
	});
	expect(draft.plan.placements).toContainEqual(expect.objectContaining({ targetId: objectId, positionMeters: [1, 0, 2] }));
	expect(draft.annotations).toEqual([expect.objectContaining({ eventId: event.eventId, objectId, sourceTimeMs: startMs, text: noteText })]);

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
		sourceEvidence: sourceSnapshot.map(({ evidenceId, sourceRevision }) => ({ evidenceId, sourceRevision })),
		plannedEvents: [expect.objectContaining({ eventId: event.eventId, clock: event.clock, sourceEvent })],
		annotations: draft.annotations, proceduralGeometry: { placements: draft.plan.placements }
	});
	if (workerOutput && readbackSettings) {
		const output = workerOutput;
		await test.step('Verify the committed revision in PostgreSQL and recipe bytes in SeaweedFS', async () => {
			const artifact = await verifySceneGenerationIndependentReadback(readbackSettings, {
				caseId, sceneId: manifest.sceneId, jobId: output.jobId, revision: manifest.revision,
				manifest, manifestSha256, planHash: output.recipe.planHash, recipe: output.recipe, sourceSnapshot
			});
			await testInfo.attach('scene-independent-readback', {
				body: JSON.stringify({ caseId, sceneId: manifest.sceneId, jobId: output.jobId, revision: manifest.revision, manifestSha256, ...artifact }),
				contentType: 'application/json'
			});
		});
	} else if (generated) {
		await test.step.skip('Independent storage readback requires explicit staging opt-in', async () => {});
	}
});
}

test('authorized staging opens a reviewed contour as a scene and reopens its saved vertex edit', async ({ page }) => {
	test.skip(!verifyStagingWrite || !caseUuid.test(caseId) || !process.env.PW_SCENE_STORAGE_STATE || !process.env.PW_SCENE_BASE_URL ||
		!caseUuid.test(contourSceneId) || !contourEditX.trim() || !Number.isFinite(Number(contourEditX)),
		'Requires an authorized staging case, a chapter-only scene with a reviewed contour, and a valid first-vertex X edit.');
	await page.goto(`/cases/${caseId}/crime-scene`);
	const link = page.getByRole('link', { name: /Open reviewed contours/ }).and(page.locator(`a[href*="previewScene=${contourSceneId}"]`));
	await link.click();
	await expect(page.getByText(/Reviewed contours from revision/)).toBeVisible();
	await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
	await page.getByRole('region', { name: 'Scene proposal review' }).getByRole('button', { name: 'Generate Preview' }).click();
	const preview = page.getByLabel('Generated scene preview');
	const object = preview.getByLabel('Scene object', { exact: true });
	const mask = object.locator('option[value^="MASK-"]').first();
	await expect(mask).toBeAttached();
	const objectId = (await mask.getAttribute('value'))!;
	await object.selectOption(objectId);
	const contourNote = 'Recheck this contour against the original image.';
	await preview.getByLabel('Note on this contour', { exact: true }).fill(contourNote);
	await preview.getByRole('button', { name: 'Add contour note' }).click();
	const coordinate = preview.getByLabel('X px', { exact: true }).first();
	const originalX = await coordinate.inputValue();
	const editedX = String(Number(contourEditX));
	expect(Number(originalX)).not.toBe(Number(editedX));
	await coordinate.fill(editedX);
	await coordinate.press('Tab');
	await expect(preview.getByText(/Contour edits are unsaved/)).toBeVisible();
	const savedResponse = page.waitForResponse((candidate) => candidate.request().method() === 'POST' &&
		new URL(candidate.url()).pathname === `/api/cases/${caseId}/scenes/${contourSceneId}/revisions`);
	await preview.getByRole('button', { name: 'Save scene draft' }).click();
	const receipt = await savedResponse;
	expect(receipt.status()).toBe(201);
	const { data: saved } = await receipt.json();
	const edits = saved.manifest.proceduralPreviewDraft.polygonEdits;
	expect(edits).toEqual([expect.objectContaining({ objectId, reviewState: 'UNREVIEWED_SCENE_EDIT' })]);
	expect(edits[0].polygon.outer[0][0]).toBe(Number(editedX));
	const contourNotes = saved.manifest.proceduralPreviewDraft.contourNotes;
	expect(contourNotes).toEqual([expect.objectContaining({ objectId, text: contourNote,
		evidenceId: edits[0].evidenceId, sourceRevision: edits[0].sourceRevision,
		reviewRevision: edits[0].reviewRevision, baseGeometryRevision: edits[0].baseGeometryRevision })]);
	await preview.getByRole('link', { name: `Reopen saved revision ${saved.manifest.revision}` }).click();
	await expect(page.getByText(`Opened saved draft revision ${saved.manifest.revision}`, { exact: false })).toBeVisible();
	await object.selectOption(objectId);
	await expect(coordinate).toHaveValue(editedX);
	await expect(preview.getByLabel('Notes on this contour')).toContainText(contourNote);
	const download = page.waitForEvent('download');
	await preview.getByRole('button', { name: 'Export saved revision report (JSON)' }).click();
	const report = JSON.parse(await readFile(await (await download).path(), 'utf8'));
	expect(report.contourNotes).toEqual(contourNotes);
	await preview.getByRole('button', { name: 'Undo vertex edit' }).click();
	await expect(coordinate).toHaveValue(originalX);
});
