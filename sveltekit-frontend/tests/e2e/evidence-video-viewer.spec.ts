import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { encodeVideoMotionLutV1, VIDEO_MOTION_LUT_HEIGHT_V1, VIDEO_MOTION_LUT_WIDTH_V1 } from '../../src/lib/shared/video-motion-lut-v1.js';
import { stableStringifySceneDocumentV1 } from '../../src/lib/splat/scene-document-v1.js';

const evidenceId = '4cf3e0c4-f3c7-4e0a-9a7e-1adf01dd7291';
const caseId = 'b8fbe1be-7024-4b72-bdae-e3a1b4a83f8e';
const suppliedFixturePath = process.env.PLAYWRIGHT_VIDEO_FIXTURE_PATH?.trim();
const fixturePath = suppliedFixturePath
	? resolve(suppliedFixturePath)
	: fileURLToPath(new URL('../fixtures/evidence-viewer-2s.webm', import.meta.url));
const extension = extname(fixturePath).toLowerCase();
if (extension !== '.webm' && extension !== '.mp4') throw new Error('Video fixture must be .webm or .mp4.');
const mediaType = extension === '.webm' ? 'video/webm' : 'video/mp4';
const isSyntheticFixture = !suppliedFixturePath;
const title = isSyntheticFixture ? 'Synthetic hallway video' : 'Local video playback fixture';
const fixtureVideo = await readFile(fixturePath);
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const analysisRevision = 'video-analysis-motion-fixture-v1';
const videoEventId = '55555555-5555-4555-8555-555555555555';
const videoEventTimeline = {
	schema: 'atlas.video-event-timeline.v1', processingRevision: 'video-event-fusion-v1', evidenceId, caseId,
	sourceRevision, analysisRevision, status: 'PROPOSED', canonicalAuthority: false,
	orderingSemantics: 'SOURCE_TIME_DISPLAY_ONLY_NOT_CAUSAL', bucketWidthMs: 10_000, omittedObservationCount: 0,
	events: [{
		eventId: videoEventId, startMs: 1000, endMs: 1800, label: 'Evidence observations 00:00:01.000–00:00:01.800',
		summary: 'Unreviewed transcript excerpt: “Door opens.”',
		sourceReferences: [{ kind: 'transcript_segment', referenceId: '66666666-6666-4666-8666-666666666666', transcriptId: '77777777-7777-4777-8777-777777777777', segmentIndex: 0, startMs: 1000, endMs: 1800, text: 'Door opens.', modelRevision: 'fixture-whisper' }],
		reviewStatus: 'APPROVED', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', reviewedBy: 7, reviewedAt: '2026-11-16T20:00:00.000Z'
	}]
};
const motionTile = Buffer.from(encodeVideoMotionLutV1(
	new Uint8Array(VIDEO_MOTION_LUT_WIDTH_V1 * VIDEO_MOTION_LUT_HEIGHT_V1),
	new Uint8Array(VIDEO_MOTION_LUT_WIDTH_V1 * VIDEO_MOTION_LUT_HEIGHT_V1).fill(255),
).bytes);
const proofScreenshot = resolve(process.cwd(), '../docs/reports/screenshots/evidence-video-viewer-transcript-20261115.png');
const liveCaseId = process.env.PLAYWRIGHT_LIVE_VIDEO_CASE_ID;
const liveEvidenceId = process.env.PLAYWRIGHT_LIVE_VIDEO_EVIDENCE_ID;
const liveStorageState = process.env.PLAYWRIGHT_LIVE_VIDEO_STORAGE_STATE ?? process.env.RELIEF_LIVE_STORAGE_STATE;

test('native video modal decodes and a transcript cue seeks with byte-range loading', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const pageWarnings: string[] = [];
	let posePostBody: Record<string, any> | null = null;
	const evidenceApiTrace: string[] = [];
	const evidenceApiRequests: string[] = [];
	const rangeResponses: number[] = [];
	const mediaRequests: string[] = [];
	let savedSceneRevision: { revision: number; manifestSha256: string; manifest: Record<string, any> } | null = null;
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => { if (message.type() === 'warning') pageWarnings.push(message.text()); });
	page.on('response', (response) => {
		const url = new URL(response.url());
		if (url.pathname.startsWith('/api/evidence/')) evidenceApiTrace.push(`${response.status()} ${response.request().method()} ${url.pathname}${url.search}`);
	});
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.pathname.startsWith('/api/evidence/')) evidenceApiRequests.push(`${request.method()} ${url.pathname}${url.search}`);
	});

	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.route(`**/api/evidence/${evidenceId}`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({
			id: evidenceId,
			caseId,
			title,
			fileName: isSyntheticFixture ? 'synthetic-hallway.webm' : `local-fixture${extension}`,
			fileType: mediaType,
			fileSize: fixtureVideo.byteLength,
			hash: `sha256:${'a'.repeat(64)}`
		})
	}));
	await page.addInitScript(({ targetEvidenceId, targetCaseId, targetAnalysisRevision, targetEventTimeline, targetMotionTileBytes }) => {
		const previousPose = {
			schema: 'atlas.pose-observation.v1', evidenceId: targetEvidenceId,
			sourceSha256: `sha256:${'a'.repeat(64)}`, sourceRevision: `sha256:${'a'.repeat(64)}`,
			analysisRevision: targetAnalysisRevision, framePtsUs: 1_500_000, frameIndex: 1,
			frameWidth: 320, frameHeight: 180, skeletonSchemaId: 'human.coco17.v1',
			trackId: 'track-0001', trackScopeId: 'sha256:fixture-track-scope',
			origin: 'manual', modelRevision: null, reviewState: 'UNREVIEWED',
			keypoints: Array.from({ length: 17 }, (_, index) => ({ index, x: 20 + index, y: 30 + index, confidence: 1, visibility: 'visible' })),
			groundContact: { imagePx: [40, 150], footSide: 'left', label: 'operator-marked-ground-contact-candidate' },
		};
		const revisions: Array<Record<string, unknown>> = [
			{ id: '10000000-0000-4000-8000-000000000001', version: 1, createdAt: '2026-11-16T19:00:00Z', changeReason: 'Fixture prior frame pose',
				metadata: { schema: 'atlas.evidence-annotation-revision.v1', parentSha256: `sha256:${'a'.repeat(64)}`, annotation: { poseObservations: [previousPose] } } },
			{ id: 'pose-review-previous', version: 2, createdAt: '2026-11-16T19:01:00Z', changeReason: 'Fixture pose review', metadata: {
				schema: 'atlas.pose-review-decision.v1', evidenceId: targetEvidenceId, caseId: targetCaseId,
				sourceSha256: `sha256:${'a'.repeat(64)}`, analysisRevision: targetAnalysisRevision,
				annotationRevisionId: '10000000-0000-4000-8000-000000000001', framePtsUs: 1_500_000, skeletonSchemaId: 'human.coco17.v1',
				trackId: 'track-0001', trackScopeId: 'sha256:fixture-track-scope', decision: 'ACCEPTED_FOR_SCENE_PROPOSAL',
				sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', groundContactReviewed: true,
				groundContactDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL', canonicalAuthority: false,
			} },
		];
		const nativeFetch = window.fetch.bind(window);
		(window as any).__poseFixture = { postBody: null, calibrationPostBody: null, calibrationReviewBody: null, reviewBody: null, requests: [] as string[] };
		window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
			const requestMethod = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
			if (requestUrl.pathname.startsWith(`/api/evidence/${targetEvidenceId}/`)) {
				(window as any).__poseFixture.requests.push(`${requestMethod} ${requestUrl.pathname}${requestUrl.search}`);
			}
			if (requestUrl.pathname === `/api/evidence/${targetEvidenceId}/transcript`) {
				return new Response(JSON.stringify({
					ok: true, evidenceId: targetEvidenceId, caseId: targetCaseId, sourceRevision: `sha256:${'a'.repeat(64)}`,
					analysisRevision: targetAnalysisRevision, status: 'completed', reviewEnabled: false,
					segments: [{ id: 'cue-door', startMs: 1000, endMs: 1800, text: 'Door opens.', speakerId: 'speaker-01', reviewStatus: 'unreviewed_proposal' }],
				}), { status: 200, headers: { 'Content-Type': 'application/json' } });
			}
			if (requestUrl.pathname === `/api/evidence/${targetEvidenceId}/motion-preview/0`) {
				return new Response(Uint8Array.from(targetMotionTileBytes), { status: 200, headers: {
					'Content-Type': 'application/vnd.atlas.video-motion-lut-v1',
					'Cache-Control': 'private, no-store',
					'X-Source-Revision': `sha256:${'a'.repeat(64)}`,
					'X-Analysis-Revision': targetAnalysisRevision,
					'X-Frame-Timestamp-Ms': '1000',
				} });
			}
			if (requestUrl.pathname === `/api/evidence/${targetEvidenceId}/video-events`) {
				return new Response(JSON.stringify({ success: true, eventTimeline: targetEventTimeline, reviewEnabled: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
			}
			if (requestUrl.pathname === `/api/evidence/${targetEvidenceId}/pose-review` && requestMethod === 'POST') {
				const body = JSON.parse(String(init?.body ?? '{}'));
				(window as any).__poseFixture.reviewBody = body;
				const poseRevision = revisions.find((revision) => revision.id === body.annotationRevisionId);
				const reviewedContact = Boolean((poseRevision?.metadata as any)?.annotation?.poseObservations?.some((pose: any) => pose.framePtsUs === body.framePtsUs && pose.groundContact));
				revisions.unshift({ id: 'pose-review-decision-1', version: 3, createdAt: '2026-11-16T20:01:00Z', changeReason: 'Pose review', metadata: {
					schema: 'atlas.pose-review-decision.v1', evidenceId: targetEvidenceId, caseId: targetCaseId,
					sourceSha256: body.parentSha256, analysisRevision: body.analysisRevision,
					annotationRevisionId: body.annotationRevisionId, frameIndex: body.frameIndex, framePtsUs: body.framePtsUs,
					skeletonSchemaId: body.skeletonSchemaId, trackId: body.trackId, trackScopeId: body.trackScopeId,
					decision: body.decision, reviewerUserId: 7, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL',
					groundContactReviewed: reviewedContact, groundContactDecision: reviewedContact ? body.decision : 'NOT_PRESENT', canonicalAuthority: false,
				} });
				return new Response(JSON.stringify({ ok: true, evidenceId: targetEvidenceId, decision: body.decision, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false }), { status: 201, headers: { 'Content-Type': 'application/json' } });
			}
			if (requestUrl.pathname === `/api/evidence/${targetEvidenceId}/calibration-review` && requestMethod === 'POST') {
				const body = JSON.parse(String(init?.body ?? '{}'));
				(window as any).__poseFixture.calibrationReviewBody = body;
				revisions.unshift({ id: 'calibration-review-1', version: 5, createdAt: '2026-11-16T20:03:00Z', changeReason: 'Planar calibration review', metadata: {
					schema: 'atlas.planar-camera-calibration-review.v1', evidenceId: targetEvidenceId, caseId: targetCaseId,
					sourceSha256: body.parentSha256, analysisRevision: body.analysisRevision, annotationRevisionId: body.annotationRevisionId,
					calibrationSha256: body.calibrationSha256, calibrationFrameIndex: body.calibrationFrameIndex,
					calibrationFramePtsUs: body.calibrationFramePtsUs, decision: body.decision,
					sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false,
				} });
				return new Response(JSON.stringify({ ok: true, evidenceId: targetEvidenceId, decision: body.decision, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false }), { status: 201, headers: { 'Content-Type': 'application/json' } });
			}
			if (requestUrl.pathname !== `/api/evidence/${targetEvidenceId}/versions`) return nativeFetch(input, init);
			if (requestMethod === 'POST') {
				const body = JSON.parse(String(init?.body ?? '{}'));
				if (Array.isArray(body.annotation?.planarCameraCalibrations)) {
					(window as any).__poseFixture.calibrationPostBody = body;
				revisions.unshift({ id: '10000000-0000-4000-8000-000000000003', version: 4, createdAt: '2026-11-16T20:02:00Z', changeReason: 'Fixed-camera planar calibration', metadata: { schema: 'atlas.evidence-annotation-revision.v1', parentSha256: body.parentSha256, annotation: body.annotation } });
					return new Response(JSON.stringify({ ok: true, committed: true, version: 4 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
				}
				(window as any).__poseFixture.postBody = body;
				revisions.unshift({ id: '10000000-0000-4000-8000-000000000002', version: 2, createdAt: '2026-11-16T20:00:00Z', changeReason: 'Manual pose proposal', metadata: { schema: 'atlas.evidence-annotation-revision.v1', parentSha256: body.parentSha256, annotation: body.annotation } });
				return new Response(JSON.stringify({ ok: true, committed: true, version: 2 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
			}
			return new Response(JSON.stringify({ evidenceId: targetEvidenceId, versions: revisions, count: revisions.length, reviewEnabled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
		};
	}, { targetEvidenceId: evidenceId, targetCaseId: caseId, targetAnalysisRevision: analysisRevision, targetEventTimeline: videoEventTimeline, targetMotionTileBytes: Array.from(motionTile) });
	await page.route(`**/api/evidence/${evidenceId}/frames**`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({ frames: [
			{
				id: `${analysisRevision}:0`, timestamp: 1, timestampMs: 1000, frameIndex: 0, framePath: null,
				description: 'Synthetic detector proposal.', objects: ['person'],
				detections: [{ label: 'person', confidence: 0.9, bbox: [10, 10, 40, 80], trackId: 'track-0001', velocityPxPerSecond: null, trackState: 'UNREVIEWED_TRACK_HYPOTHESIS' }],
				tags: ['UNREVIEWED_PROPOSAL'], confidence: 0.9, width: 320, height: 180,
				analysisRevision, sourceRevision, trackScopeId: 'sha256:fixture-track-scope',
				motionLut: { schema: 'atlas.video-motion-lut.v1', width: 64, height: 128, timestampMs: 1000, motionScore: 1, url: `/api/evidence/${evidenceId}/motion-preview/0` },
			},
			{
				id: `${analysisRevision}:1`, timestamp: 1.5, timestampMs: 1500, frameIndex: 1, framePath: null,
				description: 'Second synthetic frame for track-linked pose readback.', objects: ['person'],
				detections: [{ label: 'person', confidence: 0.88, bbox: [15, 10, 45, 80], trackId: 'track-0001', velocityPxPerSecond: [10, 0], trackState: 'UNREVIEWED_TRACK_HYPOTHESIS' }],
				tags: ['UNREVIEWED_PROPOSAL'], confidence: 0.88, width: 320, height: 180,
				analysisRevision, sourceRevision, trackScopeId: 'sha256:fixture-track-scope',
			},
		] })
	}));
	await page.route((url) => new URL(url).pathname === `/api/evidence/${evidenceId}/motion-preview/0`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/vnd.atlas.video-motion-lut-v1',
		headers: {
			'Cache-Control': 'private, no-store',
			'X-Source-Revision': sourceRevision,
			'X-Analysis-Revision': analysisRevision,
			'X-Frame-Timestamp-Ms': '1000',
		},
		body: motionTile,
	}));
	await page.route(`**/api/evidence/${evidenceId}/video-events`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({ success: true, eventTimeline: videoEventTimeline, reviewEnabled: false })
	}));
	await page.route('**/api/cases/*/scenes/*/revisions', async (route) => {
		if (route.request().method() === 'GET') {
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: savedSceneRevision, message: savedSceneRevision ? 'OK' : 'No scene revision' }) });
		}
		const command = route.request().postDataJSON() as { manifest: Record<string, any> };
		const manifest = command.manifest;
		const manifestSha256 = createHash('sha256').update(stableStringifySceneDocumentV1(manifest), 'utf8').digest('hex');
		savedSceneRevision = { revision: manifest.revision, manifestSha256, manifest };
		return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...savedSceneRevision, replayed: false }, message: 'Saved' }) });
	});
	await page.route(`**/api/evidence/${evidenceId}/transcript**`, (route) => {
		const url = new URL(route.request().url());
		if (url.searchParams.has('export')) {
			return route.fulfill({
				status: 200,
				contentType: 'text/vtt',
				headers: { 'Content-Disposition': `attachment; filename="Synthetic_hallway_${evidenceId}_transcript.vtt"` },
				body: 'WEBVTT\n\n00:00:01.000 --> 00:00:01.800\nDoor opens.\n'
			});
		}
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				ok: true,
				videoTitle: title,
				evidenceId,
				caseId,
				sourceRevision: `sha256:${'a'.repeat(64)}`,
				status: 'completed',
				segments: [{ id: 'cue-door', startMs: 1000, endMs: 1800, text: 'Door opens.', speakerId: 'speaker-01', reviewStatus: 'unreviewed_proposal' }]
			})
		});
	});
	await page.route(`**/api/evidence/${evidenceId}/download**`, async (route) => {
		mediaRequests.push(route.request().url());
		const requestUrl = new URL(route.request().url());
		if (requestUrl.searchParams.get('caseId') !== caseId) return route.fulfill({ status: 404, body: '' });
		const range = route.request().headers().range;
		if (range) {
			const match = /^bytes=(\d+)-(\d*)$/.exec(range);
			if (!match) return route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${fixtureVideo.byteLength}` } });
			const start = Number(match[1]);
			const end = Math.min(match[2] ? Number(match[2]) : fixtureVideo.byteLength - 1, fixtureVideo.byteLength - 1);
			if (start > end || start >= fixtureVideo.byteLength) return route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${fixtureVideo.byteLength}` } });
			const body = fixtureVideo.subarray(start, end + 1);
			rangeResponses.push(206);
			return route.fulfill({
				status: 206,
				contentType: mediaType,
				headers: {
					'Accept-Ranges': 'bytes',
					'Content-Range': `bytes ${start}-${end}/${fixtureVideo.byteLength}`,
					'Content-Length': String(body.byteLength)
				},
				body
			});
		}
		return route.fulfill({ status: 200, contentType: mediaType, headers: { 'Accept-Ranges': 'bytes' }, body: fixtureVideo });
	});

	await page.goto('/e2e/video-viewer');
	const modal = page.getByRole('dialog', { name: title });
	await expect(modal).toBeVisible();
	const video = page.getByTestId('evidence-video-player');
	await expect(video).toBeVisible();
	await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
	const media = await video.evaluate((element) => {
		const node = element as HTMLVideoElement;
		return { duration: node.duration, width: node.videoWidth, height: node.videoHeight, controls: node.controls, error: node.error?.message ?? null };
	});
	expect(media.duration).toBeGreaterThan(1.9);
	expect(media.width).toBeGreaterThan(0);
	expect(media.height).toBeGreaterThan(0);
	if (isSyntheticFixture) {
		expect(media.width).toBe(320);
		expect(media.height).toBe(180);
	}
	expect(media.controls).toBe(true);
	expect(media.error).toBeNull();

	await page.locator('.filmstrip-frame-card').first().click();
	const motionPreview = page.getByRole('figure', { name: 'Low-resolution frame-to-frame motion cue' });
	await expect(motionPreview).toBeVisible();
	await expect.poll(() => motionPreview.textContent(), { timeout: 15_000 }).toContain('100% change').catch(async () => {
		const motionStatus = await motionPreview.textContent();
		const clientRequests = await page.evaluate(() => (window as any).__poseFixture?.requests ?? []);
		throw new Error(`Expected the fixture motion tile to render at 100% change; preview="${motionStatus}", evidence responses=${JSON.stringify(evidenceApiTrace)}, client requests=${JSON.stringify(clientRequests)}, warnings=${JSON.stringify(pageWarnings)}`);
	});
	await expect(motionPreview.locator('canvas:not(.hidden)')).toBeVisible();
	const motionRenderer = await motionPreview.getAttribute('data-renderer');
	expect(['webgpu', 'webgl2', 'canvas2d']).toContain(motionRenderer);
	if (testInfo.project.name === 'chromium-webgl2-motion') expect(motionRenderer).toBe('webgl2');
	await testInfo.attach('motion-preview-renderer', { body: motionRenderer ?? 'unknown', contentType: 'text/plain' });
	await expect(page.getByText(/track IDs are hypotheses scoped to this evidence revision and analysis run/i)).toBeVisible();
	await page.getByRole('button', { name: 'Add manual human pose' }).click();
	await page.getByLabel('Link pose to detector track hypothesis').selectOption('track-0001');
	await page.getByRole('button', { name: 'Capture selected video frame' }).click();
	const poseStage = page.locator('.pose-stage');
	await expect(poseStage).toBeVisible();
	await page.getByRole('button', { name: 'Place nose on the captured frame' }).click();
	await expect(page.getByText('1/17 placed · current: left_eye')).toBeVisible();
	await page.getByRole('button', { name: 'Mark ground contact' }).click();
	await page.getByLabel('Contact side').selectOption('left');
	const poseStageBox = await poseStage.boundingBox();
	expect(poseStageBox).not.toBeNull();
	await poseStage.locator('.pose-stage-target').click({ position: { x: poseStageBox!.width * 0.5, y: poseStageBox!.height * 0.8 } });
	await page.getByRole('button', { name: 'Save unreviewed pose and contact' }).click();
	await expect(page.getByText(/Unreviewed pose and ground-contact candidate saved as evidence revision 2 and verified from revision history/i)).toBeVisible();
	posePostBody = await page.evaluate(() => (window as any).__poseFixture.postBody);
	expect(posePostBody?.annotation.poseObservations[0]).toMatchObject({
		evidenceId,
		sourceSha256: `sha256:${'a'.repeat(64)}`,
		sourceRevision: `sha256:${'a'.repeat(64)}`,
		analysisRevision,
		frameIndex: 0,
		trackId: 'track-0001',
		trackScopeId: 'sha256:fixture-track-scope',
		reviewState: 'UNREVIEWED',
		groundContact: { footSide: 'left', label: 'operator-marked-ground-contact-candidate' },
	});
	expect(posePostBody?.annotation.poseObservations[0].groundContact.imagePx[0]).toBeCloseTo(160, 0);
	expect(posePostBody?.annotation.poseObservations[0].groundContact.imagePx[1]).toBeCloseTo(144, 0);
	expect(posePostBody?.annotation.poseObservations[0].keypoints).toHaveLength(17);
	await expect(page.getByText('1/17 placed · current: left_eye')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Saved pose samples for selected track' }).getByText('2 source-frame pose samples for track-0001')).toBeVisible();
	const poseSamples = page.getByRole('region', { name: 'Saved pose samples for selected track' });
	await poseSamples.getByRole('button', { name: 'Accept pose and contact candidate' }).first().click();
	await expect(page.getByText('Pose accepted for scene proposal; it is still not calibrated world geometry.')).toBeVisible();
	await expect(poseSamples.getByText(/Accepted pose and contact candidate for scene proposal/).first()).toBeVisible();
	const poseReviewBody = await page.evaluate(() => (window as any).__poseFixture.reviewBody);
	expect(poseReviewBody).toMatchObject({
		schema: 'atlas.pose-review-request.v1', caseId, parentSha256: sourceRevision,
		analysisRevision, frameIndex: 0, framePtsUs: 1_000_000,
		annotationRevisionId: '10000000-0000-4000-8000-000000000002', decision: 'ACCEPTED_FOR_SCENE_PROPOSAL',
	});
	await expect(page.getByRole('region', { name: 'Adjacent pose sample motion in source pixels' }).getByText('Frame 0 → 1 · 500 ms')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Adjacent pose sample motion in source pixels' }).getByText(/nose: Δx .* px, Δy .* px/)).toBeVisible();
	await page.getByRole('button', { name: 'Seek to pose sample frame 1' }).click();
	await expect(page.getByText('Seeked to pose sample at 00:01.')).toBeVisible();
	await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(1.45);
	await expect(page.getByLabel('Link pose to detector track hypothesis')).toHaveValue('track-0001');
	await expect(page.getByText('Loaded this frame’s saved, unreviewed pose proposal.')).toBeVisible();
	await page.getByRole('button', { name: 'Ground-plane calibration' }).click();
	await page.getByRole('button', { name: 'Capture selected video frame' }).click();
	await expect(page.getByRole('region', { name: 'Ground-plane calibration proposal' })).toBeVisible();
	await page.getByLabel('I confirm the camera was fixed during this recording.').check();
	const planeStage = page.locator('.pose-stage');
	const stageBox = await planeStage.boundingBox();
	expect(stageBox).not.toBeNull();
	const anchorFractions = [0.1, 0.9, 0.9, 0.1, 0.25, 0.75, 0.75, 0.25].map((x, index) => [x, index % 4 < 2 ? 0.1 : 0.9] as const);
	for (let index = 0; index < 8; index += 1) {
		const row = page.locator('.plane-anchor-row').nth(index);
		await row.locator('button').click();
		const [fx, fy] = anchorFractions[index]!;
		await planeStage.locator('.pose-stage-target').click({ position: { x: stageBox!.width * fx, y: stageBox!.height * fy } });
		const pixelX = fx * 320;
		const pixelY = fy * 180;
		await row.getByLabel('Ground X (m)').fill((pixelX / 100).toFixed(3));
		await row.getByLabel('Ground Y (m)').fill((pixelY / 100).toFixed(3));
	}
	await page.getByRole('button', { name: 'Check calibration' }).click();
	await expect(page.getByText(/Four validation anchors passed/)).toBeVisible();
	await page.getByRole('button', { name: 'Save unreviewed calibration' }).click();
	await expect(page.getByText(/Unreviewed calibration proposal saved and matched from authorized evidence revision history/)).toBeVisible();
	const calibrationPostBody = await page.evaluate(() => (window as any).__poseFixture.calibrationPostBody);
	expect(calibrationPostBody?.annotation.planarCameraCalibrations[0]).toMatchObject({
		evidenceId, sourceRevision, analysisRevision, validationStatus: 'CHECKS_PASSED', status: 'UNREVIEWED_CALIBRATION_PROPOSAL',
	});
	expect(calibrationPostBody?.annotation.planarCameraCalibrations[0].validationResidualsMeters).toHaveLength(4);
	await page.getByLabel('Review note (optional)').fill('Independent fixture review of the measured plane anchors.');
	await page.getByRole('region', { name: 'Ground-plane calibration proposal' }).getByRole('button', { name: 'Accept for scene proposal' }).click();
	await expect(page.getByText(/Calibration accepted for a scene proposal/)).toBeVisible();
	const calibrationReviewBody = await page.evaluate(() => (window as any).__poseFixture.calibrationReviewBody);
	expect(calibrationReviewBody).toMatchObject({
		schema: 'atlas.planar-camera-calibration-review-request.v1', caseId, parentSha256: sourceRevision,
		annotationRevisionId: '10000000-0000-4000-8000-000000000003', analysisRevision, calibrationFrameIndex: 1,
		calibrationFramePtsUs: 1_500_000, decision: 'ACCEPTED_FOR_SCENE_PROPOSAL',
		notes: 'Independent fixture review of the measured plane anchors.',
	});
	const frameCards = page.locator('.filmstrip-frame-card');
	if (await frameCards.count() > 1) {
		await frameCards.first().click();
		// The keyed editor resets its captured pixels when the selected analyzed frame changes.
		await expect(page.locator('.pose-stage')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Capture selected video frame' })).toBeVisible();
		await page.getByRole('button', { name: 'Capture selected video frame' }).click();
		await expect(page.locator('.pose-stage')).toBeVisible();
	}
	await testInfo.attach('network-api-trace', { body: evidenceApiTrace.join('\n'), contentType: 'text/plain' });
	await testInfo.attach('fixture-api-trace', {
		body: JSON.stringify(await page.evaluate(() => (window as any).__poseFixture.requests), null, 2),
		contentType: 'application/json',
	});

	await page.getByTestId('open-video-transcript').click();
	const drawer = page.getByTestId('video-transcript-drawer');
	await testInfo.attach('evidence-api-trace', { body: evidenceApiTrace.join('\n'), contentType: 'text/plain' });
	await expect(drawer.getByText('Door opens.', { exact: true })).toBeVisible();
	await drawer.getByRole('button', { name: 'Add to scene timeline' }).click();
	await expect(drawer.getByRole('status').filter({ hasText: /Saved as scene revision 1; source time 0:01–0:01/ })).toBeVisible();
	expect(savedSceneRevision?.manifest.videoEventBindings).toEqual([{
		evidenceId, sourceRevision, analysisRevision, eventId: videoEventId, startMs: 1000, endMs: 1800,
		reviewState: 'APPROVED_FOR_SCENE_PROPOSAL'
	}]);
	await drawer.getByRole('button', { name: 'Add reviewed track to scene' }).click();
	await expect(drawer.getByRole('status').filter({ hasText: /Saved reviewed 2D ground-plane track as scene revision 2/ })).toBeVisible();
	expect(savedSceneRevision?.manifest.groundPlaneTrackProposals).toHaveLength(1);
	expect(savedSceneRevision?.manifest.groundPlaneTrackProposals[0]).toMatchObject({
		evidenceId, sourceRevision, analysisRevision, trackId: 'track-0001', trackScopeId: 'sha256:fixture-track-scope',
		status: 'REVIEWED_GROUND_PLANE_PROPOSAL', semantics: 'image_to_measured_plane_only_no_height_or_camera_motion_compensation',
	});
	expect(savedSceneRevision?.manifest.groundPlaneTrackProposals[0].points).toHaveLength(2);
	await drawer.getByRole('button', { name: 'Seek to 0:01' }).last().click();
	await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(0.95);
	if (isSyntheticFixture) {
		await mkdir(dirname(proofScreenshot), { recursive: true });
		await page.screenshot({ path: proofScreenshot, fullPage: false });
		await testInfo.attach('video-viewer-transcript', { path: proofScreenshot, contentType: 'image/png' });
	}

	await expect.poll(() => rangeResponses.length).toBeGreaterThan(0);
	expect(mediaRequests.length).toBeGreaterThan(0);
	expect(pageErrors).toEqual([]);
});

test.describe('authorized persisted video viewer', () => {
	if (liveStorageState) test.use({ storageState: liveStorageState });

	test('keeps a running progress bar below complete when an event over-reports', async ({ page }) => {
		test.skip(!liveCaseId || !liveEvidenceId, 'Set PLAYWRIGHT_LIVE_VIDEO_CASE_ID and PLAYWRIGHT_LIVE_VIDEO_EVIDENCE_ID to an authorized video.');
		if (!liveCaseId || !liveEvidenceId) return;

		const detailPath = `/api/cases/${liveCaseId}/evidence/${liveEvidenceId}/detail`;
		let liveProgressJobId: string | null = null;
		await page.route((url) => new URL(url).pathname === detailPath, async (route) => {
			const response = await route.fetch();
			const payload = await response.json() as { jobs?: Array<Record<string, unknown>> };
			const existingJob = payload.jobs?.find((job) => job.jobType === 'upload_pipeline') ?? payload.jobs?.[0];
			if (!existingJob || typeof existingJob.id !== 'string') {
				await route.fulfill({ response });
				return;
			}
			liveProgressJobId = existingJob.id;
			await route.fulfill({ response, json: { ...payload, jobs: [{ ...existingJob, status: 'running', progress: '0' }] } });
		});
		await page.route((url) => {
			const requestUrl = new URL(url);
			return requestUrl.pathname === '/api/evidence/realtime' && requestUrl.searchParams.get('jobId') === liveProgressJobId;
		}, async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
				body: `event: connected\ndata: {"jobId":"${liveProgressJobId}"}\n\nevent: progress\ndata: {"jobId":"${liveProgressJobId}","step":"frame_embedding","progress":137,"message":"Document embedding (137%)"}\n\n`,
			});
		});

		await page.goto(`/cases/${encodeURIComponent(liveCaseId)}/evidence/${encodeURIComponent(liveEvidenceId)}`);
		const progress = page.getByRole('progressbar', { name: /processing progress/ }).first();
		await expect(progress).toBeVisible();
		await expect.poll(() => progress.getAttribute('aria-valuenow')).toBe('99');
		await expect(page.locator('.analysis-job-progress-label').first()).toContainText('running');
		await expect(page.locator('.analysis-job-progress-note').first()).toContainText('99% completion');
	});

	test('opens real evidence and seeks a persisted transcript cue', async ({ page }) => {
		test.skip(!liveCaseId || !liveEvidenceId, 'Set PLAYWRIGHT_LIVE_VIDEO_CASE_ID and PLAYWRIGHT_LIVE_VIDEO_EVIDENCE_ID to an authorized transcribed video.');
		if (!liveCaseId || !liveEvidenceId) return;

		const responses = new Map<string, number>();
		let rangeResponseCount = 0;
		let rangeHeadersValid = false;
		let skimPreviewStatus: number | null = null;
		let skimPreviewHeadersValid = false;
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		page.on('response', (response) => {
			const url = new URL(response.url());
			if (
				url.pathname === `/api/evidence/${liveEvidenceId}` ||
				url.pathname.endsWith(`/api/evidence/${liveEvidenceId}/transcript`) ||
				url.pathname.endsWith(`/api/evidence/${liveEvidenceId}/frames`)
			) {
				responses.set(url.pathname, response.status());
			}
			if (url.pathname === `/api/evidence/${liveEvidenceId}/skim-preview/0`) {
				skimPreviewStatus = response.status();
				const headers = response.headers();
				skimPreviewHeadersValid = headers['content-type']?.startsWith('image/jpeg') === true &&
					headers.etag?.startsWith('"sha256-') === true;
			}
			if (url.pathname === `/api/evidence/${liveEvidenceId}/download` && response.status() === 206) {
				const requestHeaders = response.request().headers();
				const headers = response.headers();
				if (requestHeaders.range && url.searchParams.get('caseId') === liveCaseId) {
					rangeResponseCount += 1;
					rangeHeadersValid = headers['accept-ranges'] === 'bytes' && typeof headers['content-range'] === 'string';
				}
			}
		});

		const detailResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/evidence/${liveEvidenceId}`);
		const framesResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/evidence/${liveEvidenceId}/frames`);
		const skimPreviewResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/evidence/${liveEvidenceId}/skim-preview/0`);
		await page.goto(`/e2e/video-viewer?caseId=${encodeURIComponent(liveCaseId)}&evidenceId=${encodeURIComponent(liveEvidenceId)}`);
		const detailResponse = await detailResponsePromise;
		expect(detailResponse.status()).toBe(200);
		const detail = await detailResponse.json();
		const framesResponse = await framesResponsePromise;
		expect(framesResponse.status()).toBe(200);
		const framesPayload = await framesResponse.json();
		expect(framesPayload.success).toBe(true);
		expect(framesPayload.frames.length).toBeGreaterThan(0);
		expect(framesPayload.skimPreview?.sampleTimestampsMs.length).toBeGreaterThan(1);
		const modal = page.getByRole('dialog').first();
		await expect(modal).toBeVisible();
		const video = page.getByTestId('evidence-video-player');
		await expect(video).toBeVisible();
		await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
		await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration)).toBeGreaterThan(0);
		await expect.poll(() => rangeResponseCount).toBeGreaterThan(0);
		expect(rangeHeadersValid).toBe(true);
		const skimPreview = page.getByRole('group', { name: 'Full-video skim preview' });
		await expect(skimPreview).toBeVisible();
		const skimPreviewResponse = await skimPreviewResponsePromise;
		expect(skimPreviewResponse.status()).toBe(200);
		expect(skimPreviewResponse.headers()['content-type']).toContain('image/jpeg');
		expect(skimPreviewResponse.headers()['etag']).toContain('sha256-');
		const skimRange = page.getByRole('slider', { name: 'Scrub the full-video preview' });
		const finalSkimTimeMs: number = framesPayload.skimPreview.sampleTimestampsMs.at(-1);
		await skimRange.evaluate((element) => {
			const input = element as HTMLInputElement;
			input.value = input.max;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(finalSkimTimeMs / 1000 - 0.1);
		expect(skimPreviewStatus).toBe(200);
		expect(skimPreviewHeadersValid).toBe(true);

		const transcriptResponsePromise = page.waitForResponse((response) => {
			const url = new URL(response.url());
			return url.pathname === `/api/evidence/${liveEvidenceId}/transcript` && response.request().method() === 'GET';
		});
		await page.getByTestId('open-video-transcript').click();
		const transcriptResponse = await transcriptResponsePromise;
		expect(transcriptResponse.status()).toBe(200);
		const transcript = await transcriptResponse.json();
		expect(transcript.ok).toBe(true);
		expect(transcript.segments.length).toBeGreaterThan(0);
		const cueButton = page.getByTestId('video-transcript-drawer').getByRole('button', { name: /^Seek to / }).first();
		await expect(cueButton).toBeVisible();
		const cueLabel = await cueButton.getAttribute('aria-label');
		const timeMatch = /^Seek to (\d+):(\d{2})$/.exec(cueLabel ?? '');
		expect(timeMatch).not.toBeNull();
		const targetSeconds = Number(timeMatch?.[1]) * 60 + Number(timeMatch?.[2]);
		await cueButton.click();
		await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(targetSeconds);
		await expect.poll(() => responses.get(`/api/evidence/${liveEvidenceId}`)).toBe(200);
		expect(responses.get(`/api/evidence/${liveEvidenceId}/frames`)).toBe(200);
		expect(responses.get(`/api/evidence/${liveEvidenceId}/transcript`)).toBe(200);
		const sourceRevision = transcript.sourceRevision ?? transcript.source_sha256;
		const detailRevision = detail.sourceRevision ?? detail.hash ?? detail.sha256;
		if (typeof sourceRevision === 'string' && typeof detailRevision === 'string') {
			expect(sourceRevision.replace(/^sha256:/, '')).toBe(detailRevision.replace(/^sha256:/, ''));
		}
		const liveProofScreenshot = resolve(process.cwd(), '../docs/reports/screenshots/evidence-video-viewer-live-20261115.png');
		await page.screenshot({ path: liveProofScreenshot, animations: 'disabled' });

		const evidenceDetailResponsePromise = page.waitForResponse((response) =>
			new URL(response.url()).pathname === `/api/cases/${liveCaseId}/evidence/${liveEvidenceId}/detail`,
		);
		await page.goto(`/cases/${encodeURIComponent(liveCaseId)}/evidence/${encodeURIComponent(liveEvidenceId)}`);
		const evidenceDetailResponse = await evidenceDetailResponsePromise;
		expect(evidenceDetailResponse.status()).toBe(200);
		const analysisProgress = page.getByRole('progressbar', { name: /processing progress/ }).first();
		await expect(analysisProgress).toBeVisible();
		await expect(analysisProgress).toHaveAttribute('aria-valuenow', '100');
		const progressScreenshot = resolve(process.cwd(), '../docs/reports/screenshots/evidence-analysis-progress-live-20261115.png');
		await page.screenshot({ path: progressScreenshot, animations: 'disabled' });
		expect(pageErrors).toEqual([]);
	});
});
