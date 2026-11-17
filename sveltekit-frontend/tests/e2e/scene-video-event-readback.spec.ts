import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
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
	})),
	groundContact: { imagePx: [hipX, 150], footSide: 'left', label: 'operator-marked-ground-contact-candidate' }
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
	const annotationRevisionId = '44444444-4444-4444-8444-444444444444';
	const calibration = {
		schema: 'atlas.planar-camera-calibration.v1', evidenceId, sourceRevision, analysisRevision,
		calibrationFrameIndex: 0, calibrationFramePtsUs: 0, frameWidth: 320, frameHeight: 180,
		plane: 'operator-defined-ground-plane', operatorConfirmedFixedCamera: true,
		imageToPlaneHomography: [0.01, 0, 0, 0, 0.01, 0, 0, 0, 1],
		fitResidualsMeters: ['a', 'b', 'c', 'd'].map((anchorId) => ({ anchorId, residualMeters: 0 })),
		validationResidualsMeters: ['v1', 'v2', 'v3', 'v4'].map((anchorId) => ({ anchorId, residualMeters: 0 })),
		toleranceMeters: 0.05, validationStatus: 'CHECKS_PASSED', status: 'UNREVIEWED_CALIBRATION_PROPOSAL',
		semantics: 'image_to_measured_plane_only_no_height_or_camera_motion_compensation'
	};
	const calibrationSha256 = `sha256:${createHash('sha256').update(JSON.stringify(calibration), 'utf8').digest('hex')}`;
	const poseRows = [poseObservation(1, 1_250_000, 40), poseObservation(2, 1_500_000, 70)];
	const reviewRows = poseRows.map((pose) => ({
		version: 4, metadata: {
			schema: 'atlas.pose-review-decision.v1', evidenceId, caseId, sourceSha256: sourceRevision, analysisRevision,
			annotationRevisionId, framePtsUs: pose.framePtsUs, skeletonSchemaId: 'human.coco17.v1', trackId: pose.trackId, trackScopeId: pose.trackScopeId,
			decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false,
			groundContactReviewed: true, groundContactDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL'
		}
	}));
	const versionsPayload = {
		evidenceId,
		versions: [
			...reviewRows,
			{ version: 3, metadata: {
				schema: 'atlas.planar-camera-calibration-review.v1', evidenceId, caseId, sourceSha256: sourceRevision, analysisRevision,
				annotationRevisionId, calibrationSha256, calibrationFrameIndex: 0, calibrationFramePtsUs: 0,
				decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false
			} },
			{ id: annotationRevisionId, version: 2, metadata: {
				schema: 'atlas.evidence-annotation-revision.v1', parentSha256: sourceRevision,
				annotation: { poseObservations: poseRows, planarCameraCalibrations: [calibration] }
			} }
		]
	};
	await page.route(`**/api/evidence/${evidenceId}/versions**`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(versionsPayload)
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
	const frame3Row = posePanel.getByRole('listitem').filter({ hasText: 'Frame 3 ·' });
	await expect(frame3Row.getByText(/Frame 3 · 3\/17 landmarks · accepted proposal · revision 2 · track hypothesis track-fixture/)).toBeVisible();
	await expect(frame3Row.getByText('Hip-center image trail · camera motion not corrected · no world scale')).toBeVisible();
	await expect(frame3Row.getByText(/Reviewed ground-plane proposal: X 0\.700 m, Y 1\.500 m/)).toBeVisible();
	await expect(frame3Row.locator('.ground-contact-marker')).toHaveClass(/ground-contact-reviewed/);
	await expect(frame3Row.locator('.hip-trail')).toHaveAttribute('points', '45,90 75,90');
	await expect(frame3Row.getByRole('img', { name: 'Source-frame skeleton preview, frame 3' })).toBeVisible();
	const sourceFramePreview = frame3Row.locator('.pose-source-preview img');
	await expect(sourceFramePreview).toBeVisible();
	await expect.poll(() => sourceFramePreview.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
	await expect(sourceFramePreview).toHaveAttribute('src', /^blob:/);
	await expect(frame3Row.getByRole('link', { name: 'Open source at 0:01' })).toHaveAttribute('href', `/cases/${caseId}/evidence/${evidenceId}?timeMs=1500`);
	const groundPlot = page.getByTestId('scene-ground-plane-tracks').getByRole('img', { name: 'Top-down measured ground-plane path for track-fixture' });
	await expect(groundPlot).toBeVisible();
	await expect(groundPlot.locator('polyline')).toHaveAttribute('points', /,/);
	const plotPoints = groundPlot.locator('a');
	await expect(plotPoints).toHaveCount(2);
	await expect(plotPoints.nth(0)).toHaveAttribute('href', `/cases/${caseId}/evidence/${evidenceId}?timeMs=1250`);
	await expect(plotPoints.nth(1).locator('circle')).toHaveAttribute('fill', '#c9593e');
	const scrubber = page.getByRole('slider', { name: 'Scrub reviewed samples for track-fixture' });
	await expect(scrubber).toHaveValue('0');
	await scrubber.focus();
	await scrubber.press('ArrowRight');
	await expect(scrubber).toHaveValue('1');
	await expect(panel.getByText(/Frame 3 · 0:01 · X 0\.700 m, Y 1\.500 m · discrete reviewed sample/)).toBeVisible();
	await expect(plotPoints.nth(1)).toHaveClass(/active/);
	await expect(page.getByRole('link', { name: 'Open selected source frame at 0:01' })).toHaveAttribute('href', `/cases/${caseId}/evidence/${evidenceId}?timeMs=1500`);
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
