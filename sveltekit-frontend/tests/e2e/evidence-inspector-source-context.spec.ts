import { test, expect } from '@playwright/test';

const evidenceId = '22222222-2222-4222-8222-222222222222';
const sourceRevision = `sha256:${'a'.repeat(64)}`;

test('evidence inspector keeps original video, transcript, and source revisions together', async ({ page }, info) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const caseResponse = await page.request.get('/api/cases?limit=100');
	expect(caseResponse.ok()).toBeTruthy();
	const casePayload = await caseResponse.json() as { data?: { cases?: Array<{ id: string; title?: string }> } };
	const caseId = casePayload.data?.cases?.find((item) => item.title?.startsWith('[PW-TEST]'))?.id;
	expect(caseId, 'Playwright global setup should seed an authorized case').toBeTruthy();
	await page.route(`**/api/cases/${caseId}/evidence/${evidenceId}/detail`, (route) => route.fulfill({
		json: {
			evidence: {
				id: evidenceId, fileName: 'corridor-cam-04.mp4', fileType: 'video/mp4', evidenceType: 'video',
				fileSize: 1024, status: 'completed', uploadedAt: '2026-11-14T08:00:00.000Z',
				createdAt: null, updatedAt: null, tags: [], summary: null, text: '', textLength: 0,
			},
			provenance: { sha256: sourceRevision, sourceRevision, note: 'Source bytes are identified by sha256.' },
			jobs: [{ id: '33333333-3333-4333-8333-333333333333', jobType: 'upload_pipeline', status: 'completed', progress: 100, createdAt: '', updatedAt: '' }],
			vectors: [],
			video: {
				status: 'COMPLETE', substages: { frames: { status: 'COMPLETE' } },
				sourceRevision, analysisRevision: 'fixture-video-analysis-v1', frameCount: 1,
				frames: [{ index: 0, timestampMs: 1250, width: 640, height: 360, modelRevision: 'fixture-detector-v1', objects: [{ label: 'person', confidence: 0.91, bbox: [100, 40, 220, 330] }] }],
			},
		},
	}));
	await page.route(`**/api/evidence/${evidenceId}/transcript?*`, (route) => route.fulfill({
		json: {
			ok: true, videoTitle: 'corridor-cam-04', evidenceId, caseId, sourceRevision,
			analysisRevision: 'fixture-transcript-v1', status: 'completed', totalSegments: 1,
			segments: [{ id: '44444444-4444-4444-8444-444444444444', startMs: 1250, endMs: 2100, text: 'A person entered the corridor.', speakerId: 'speaker-1', reviewStatus: 'unreviewed_proposal', analysisRevision: 'fixture-transcript-v1' }],
		},
	}));
	await page.route(`**/api/evidence/${evidenceId}/download?*`, (route) => route.fulfill({
		status: 200,
		headers: { 'content-type': 'video/mp4', 'content-disposition': 'inline; filename="corridor-cam-04.mp4"' },
		body: Buffer.alloc(0),
	}));

	await page.goto(`/cases/${caseId}/evidence/${evidenceId}`);
	await expect(page.getByRole('heading', { name: 'Original evidence' })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Transcript/ })).toBeVisible();
	await expect(page.getByText('Transcript source revision:')).toBeVisible();
	await expect(page.getByText(/source box \[100, 40, 220, 330\]/)).toBeVisible();
	await page.getByRole('button', { name: /A person entered the corridor/ }).click();
	await expect(page.locator('li.rounded.bg-neutral-800')).toBeVisible();
	const screenshotPath = process.env.EVIDENCE_INSPECTOR_SCREENSHOT ?? info.outputPath('evidence-inspector-source-context.png');
	await page.screenshot({ path: screenshotPath, fullPage: true });
	expect(errors).toEqual([]);
});
