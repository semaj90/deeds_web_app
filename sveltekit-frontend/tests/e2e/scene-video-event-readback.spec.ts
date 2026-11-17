import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const caseId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const eventId = '55555555-5555-4555-8555-555555555555';
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const analysisRevision = 'scene-event-browser-fixture-v1';
const videoFixture = await readFile(resolve(process.cwd(), 'tests/fixtures/evidence-viewer-2s.webm'));
const frameFixture = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#263244' } }).jpeg().toBuffer();
const poseObservation = (frameIndex: number, framePtsUs: number, hipX: number) => ({
	schema: 'atlas.pose-observation.v1', evidenceId, sourceSha256: sourceRevision, sourceRevision,
	analysisRevision, framePtsUs, frameIndex, frameWidth: 320, frameHeight: 180,
	skeletonSchemaId: 'human.coco17.v1', trackId: 'track-fixture', trackScopeId: 'sha256:fixture-track-scope',
	origin: 'manual', modelRevision: null, reviewState: 'UNREVIEWED',
	keypoints: Array.from({ length: 17 }, (_, index) => ({
		index,
		x: index === 0 ? 40 : index === 11 ? hipX : index === 12 ? hipX + 10 : null,
		y: index === 0 ? 30 : index === 11 || index === 12 ? 90 : null,
		confidence: index === 0 || index === 11 || index === 12 ? 1 : 0,
		visibility: index === 0 || index === 11 || index === 12 ? 'visible' : 'not_labeled'
	}))
});

test('scene event panel verifies the current source and links to its source timestamp', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (cause) => pageErrors.push(cause.message));
	const casesResponse = await page.request.get('/api/cases?status=open&limit=100');
	expect(casesResponse.ok()).toBe(true);
	const casesPayload = await casesResponse.json() as { data?: { cases?: Array<{ id: string; title?: string }> } };
	const caseId = casesPayload.data?.cases?.find((item) => item.title?.startsWith('[PW-TEST]'))?.id;
	expect(caseId, 'global setup should provide a case fixture for the authorized route layout').toBeTruthy();
	if (!caseId) throw new Error('No seeded Playwright case is available.');
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route(`**/api/evidence/${evidenceId}/video-events`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({
			success: true,
			evidenceId,
			reviewEnabled: false,
			error: null,
			eventTimeline: {
				evidenceId,
				sourceRevision,
				analysisRevision,
				events: [{
					eventId,
					startMs: 1_250,
					endMs: 1_400,
					label: 'Subject crosses doorway',
					summary: 'Reviewed source-time proposal.',
					reviewStatus: 'APPROVED',
					sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL'
				}]
			}
		})
	}));
	await page.route(`**/api/evidence/${evidenceId}/versions**`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({ evidenceId, versions: [{ version: 2, metadata: { annotation: { poseObservations: [poseObservation(1, 1_250_000, 40), poseObservation(2, 1_500_000, 70)] } } }] })
	}));
	let frameReadbackMatches = true;
	await page.route(`**/api/evidence/${evidenceId}/video-frame/*`, (route) => {
		const frameIndex = Number(new URL(route.request().url()).pathname.split('/').at(-1));
		return route.fulfill({
			status: 200,
			contentType: 'image/jpeg',
			headers: {
				'X-Source-Revision': frameReadbackMatches ? sourceRevision : `sha256:${'b'.repeat(64)}`,
				'X-Analysis-Revision': analysisRevision,
				'X-Frame-Index': String(frameIndex),
				'X-Frame-Timestamp-Ms': frameIndex === 1 ? '1250' : '1500',
			},
			body: frameFixture,
		});
	});
	await page.route(`**/api/cases/${caseId}/evidence/${evidenceId}/detail`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({
			evidence: { id: evidenceId, fileName: 'scene-event-source.webm', fileType: 'video/webm', evidenceType: 'video', fileSize: videoFixture.byteLength, status: 'ready', uploadedAt: null, createdAt: null, updatedAt: null, tags: [], summary: null, text: '', textLength: 0 },
			provenance: { sha256: sourceRevision, sourceRevision, note: 'Fixture source revision.' }, jobs: [], vectors: [], video: null
		})
	}));
	await page.route(`**/api/evidence/${evidenceId}/transcript?limit=500`, (route) => route.fulfill({
		status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', segments: [], sourceRevision, analysisRevision })
	}));
	await page.route(`**/api/evidence/${evidenceId}/download**`, (route) => route.fulfill({
		status: 200, contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes' }, body: videoFixture
	}));

	await page.goto(`/e2e/scene-video-events?caseId=${encodeURIComponent(caseId)}`);
	const panel = page.getByTestId('scene-video-event-bindings');
	await expect(panel.getByText('Subject crosses doorway')).toBeVisible();
	const posePanel = page.getByTestId('scene-pose-observations');
	const frame2Row = posePanel.getByRole('listitem').filter({ hasText: 'Frame 2 ·' });
	await expect(frame2Row.getByText(/Frame 2 · 3\/17 landmarks · unreviewed · revision 2 · track hypothesis track-fixture/)).toBeVisible();
	await expect(frame2Row.getByText('Hip-center image trail · camera motion not corrected · no world scale')).toBeVisible();
	await expect(frame2Row.locator('.hip-trail')).toHaveAttribute('points', '45,90 75,90');
	await expect(frame2Row.getByRole('img', { name: 'Source-frame skeleton preview, frame 2' })).toBeVisible();
	const sourceFramePreview = frame2Row.locator('.pose-source-preview img');
	await expect(sourceFramePreview).toBeVisible();
	await expect.poll(() => sourceFramePreview.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
	await expect(sourceFramePreview).toHaveAttribute('src', /^blob:/);
	await expect(frame2Row.getByRole('link', { name: 'Open source at 0:01' })).toHaveAttribute('href', `/cases/${caseId}/evidence/${evidenceId}?timeMs=1500`);
	frameReadbackMatches = false;
	await page.reload();
	await expect(page.getByTestId('scene-pose-observations').getByText('Frame preview does not match this pose revision and timestamp.').first()).toBeVisible();
	const sourceLink = panel.getByRole('link', { name: 'Open source at 0:01–0:01' });
	await expect(sourceLink).toHaveAttribute('href', `/cases/${caseId}/evidence/${evidenceId}?timeMs=1250`);
	await sourceLink.click();
	const sourceVideo = page.locator('video[aria-label="Original evidence video"]');
	await expect(sourceVideo).toBeVisible();
	await expect.poll(() => sourceVideo.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
	await expect.poll(() => sourceVideo.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(1.2);
	expect(pageErrors).toEqual([]);
});

test('scene event panel labels a changed source revision stale', async ({ page }) => {
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route(`**/api/evidence/${evidenceId}/video-events`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({
			success: true,
			evidenceId,
			eventTimeline: {
				evidenceId,
				sourceRevision: `sha256:${'b'.repeat(64)}`,
				analysisRevision,
				events: [{ eventId, startMs: 1_250, endMs: 1_400, label: 'Changed source', summary: 'Must not display.', reviewStatus: 'APPROVED', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' }]
			}
		})
	}));

	await page.goto('/e2e/scene-video-events');
	const panel = page.getByTestId('scene-video-event-bindings');
	await expect(panel.getByText('Linked event is stale or no longer approved')).toBeVisible();
	await expect(panel.getByText('Changed source')).toHaveCount(0);
});
