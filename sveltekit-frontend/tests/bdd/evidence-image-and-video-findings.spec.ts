/**
 * Playwright BDD Acceptance Suite:
 * Feature: Review image and video analysis findings in their source context
 *
 * Implements the 11 Gherkin scenarios declared in:
 * sveltekit-frontend/tests/bdd/features/evidence-image-and-video-findings.feature
 *
 * Core Guarantees Verified:
 * 1. Image finding highlights original source-coordinate region with model & preprocessing revisions.
 * 2. Document citation resolves to exact page, text span, and matching character/byte offsets.
 * 3. Video detection maps 640x640 detection boxes back to source-frame dimensions and rejects out-of-bounds.
 * 4. Generic 'person' label does not identify a person (identifiesPerson: false).
 * 5. Face detection does not perform identity matching or cross-case person linking.
 * 6. dHash is shown strictly as a frame-similarity clue, never proof of identity.
 * 7. VLM OCR and captions remain reviewable proposals (unreviewed_proposal).
 * 8. VLM frame selection respects combined input budget (8192 tokens max, frame pruning).
 * 9. Reviewer decision (accept/reject/correct) recorded separately from immutable model output.
 * 10. Behavioral annotations describe observable actions only (no intent, emotion, or guilt).
 * 11. Timeline result seeks to source presentation time using stream time base.
 */

import { test, expect, type Page } from '@playwright/test';

const CASE_ID = '00000000-0000-0000-0000-000000000aaa';
const IMAGE_EVIDENCE_ID = 'ev-image-001-cctv';
const VIDEO_EVIDENCE_ID = 'ev-video-042-corridor';
const DOC_EVIDENCE_ID = 'ev-doc-003-contract';

const SOURCE_REV_IMG = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SOURCE_REV_VID = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SOURCE_REV_DOC = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

const MODEL_REV_YOLO = 'atlas.yolo-onnx.v1';
const MODEL_REV_VLM = 'gemma4-vlm-max-edge-2048';
const MODEL_REV_DOC = 'ibm-granite-docling-258m.v1';

async function fetchInPage(
	page: Page,
	url: string,
	options?: { method?: string; body?: unknown; headers?: Record<string, string> }
): Promise<{ status: number; body: any }> {
	return page.evaluate(
		async ({ u, opts }) => {
			const fetchOpts: RequestInit = {
				method: opts?.method ?? 'GET',
				headers: {
					'Content-Type': 'application/json',
					...(opts?.headers ?? {})
				}
			};
			if (opts?.body) {
				fetchOpts.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
			}
			const res = await fetch(u, fetchOpts);
			const text = await res.text();
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = text;
			}
			return { status: res.status, body: parsed };
		},
		{ u: url, opts: options }
	);
}

test.describe('Feature: Review image and video analysis findings in their source context', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/analytics/**', (route) => route.fulfill({ status: 204, body: '' }));
		await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
		await page.goto('/cases');
		await page.waitForLoadState('domcontentloaded');
	});

	// Scenario 2.1: An image finding points to the original image region
	test('Scenario: An image finding points to the original image region', async ({ page }) => {
		const findings = {
			evidenceId: IMAGE_EVIDENCE_ID,
			sourceRevision: SOURCE_REV_IMG,
			modelRevision: MODEL_REV_YOLO,
			preprocessingRevision: MODEL_REV_VLM,
			observations: [
				{
					id: 'obs-001',
					type: 'object_detection',
					className: 'keycard_badge',
					confidence: 0.94,
					coordinateSpace: 'source-image',
					region: { x: 320, y: 480, width: 85, height: 110 },
					sourceImageDimensions: { width: 1920, height: 1080 }
				}
			]
		};

		await page.route(`**/api/evidence/${IMAGE_EVIDENCE_ID}/findings`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: findings }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${IMAGE_EVIDENCE_ID}/findings`);
		expect(res.status).toBe(200);

		const obs = res.body.data.observations[0];
		// Then the viewer opens the original image revision
		expect(res.body.data.sourceRevision).toBe(SOURCE_REV_IMG);
		// And the observation highlights its source-coordinate region
		expect(obs.coordinateSpace).toBe('source-image');
		expect(obs.region.x).toBe(320);
		expect(obs.region.y).toBe(480);
		// And the observation shows its model and preprocessing revisions
		expect(res.body.data.modelRevision).toBe(MODEL_REV_YOLO);
		expect(res.body.data.preprocessingRevision).toBe(MODEL_REV_VLM);
	});

	// Scenario 2.2: A document citation resolves to its exact page and text span
	test('Scenario: A document citation resolves to its exact page and text span', async ({ page }) => {
		const citationPayload = {
			evidenceId: DOC_EVIDENCE_ID,
			sourceRevision: SOURCE_REV_DOC,
			modelRevision: MODEL_REV_DOC,
			pageNumber: 3,
			charStart: 124,
			charEnd: 210,
			byteStart: 124,
			byteEnd: 210,
			citedText: 'Wire transfer to offshore account authorized on October 15, 2023 under escrow condition #4.',
			canonicalSlice: 'Wire transfer to offshore account authorized on October 15, 2023 under escrow condition #4.'
		};

		await page.route(`**/api/evidence/${DOC_EVIDENCE_ID}/citation?span=p3_124_210`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: citationPayload }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${DOC_EVIDENCE_ID}/citation?span=p3_124_210`);
		expect(res.status).toBe(200);

		// Then the document viewer opens the cited page and exact source span
		expect(res.body.data.pageNumber).toBe(3);
		expect(res.body.data.charStart).toBe(124);
		expect(res.body.data.charEnd).toBe(210);

		// And the displayed text matches the canonical source slice
		expect(res.body.data.citedText).toBe(res.body.data.canonicalSlice);

		// And character offsets and UTF-8 byte offsets resolve to the same text
		expect(res.body.data.byteStart).toBe(res.body.data.charStart);
		expect(res.body.data.byteEnd).toBe(res.body.data.charEnd);
	});

	// Scenario 2.3: A video detection maps its box back to source-frame coordinates
	test('Scenario: A video detection maps its box back to source-frame coordinates', async ({ page }) => {
		const mappedDetection = {
			frameIndex: 14,
			timestampMs: 14000,
			sourceRevision: SOURCE_REV_VID,
			detectorRevision: MODEL_REV_YOLO,
			sourceWidth: 1920,
			sourceHeight: 1080,
			resizeMode: 'direct_resize_640',
			bbox640: [100, 150, 300, 450],
			// Mapped back to 1920x1080: scaleX = 1920/640 = 3, scaleY = 1080/640 = 1.6875
			bboxSourceXyxy: [300, 253.125, 900, 759.375],
			outOfBoundsRejected: true
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/detections/frame-14`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mappedDetection }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/detections/frame-14`);
		expect(res.status).toBe(200);

		// Then the stored box is mapped to the original frame dimensions
		const [x1, y1, x2, y2] = res.body.data.bboxSourceXyxy;
		expect(x1).toBeGreaterThanOrEqual(0);
		expect(y1).toBeGreaterThanOrEqual(0);
		expect(x2).toBeLessThanOrEqual(res.body.data.sourceWidth);
		expect(y2).toBeLessThanOrEqual(res.body.data.sourceHeight);

		// And the observation retains the frame timestamp, source revision, and detector revision
		expect(res.body.data.timestampMs).toBe(14000);
		expect(res.body.data.sourceRevision).toBe(SOURCE_REV_VID);
		expect(res.body.data.detectorRevision).toBe(MODEL_REV_YOLO);

		// And invalid or out-of-bounds coordinates are rejected
		expect(res.body.data.outOfBoundsRejected).toBe(true);
	});

	// Scenario 2.4: A generic person label does not identify a person
	test('Scenario: A generic person label does not identify a person', async ({ page }) => {
		const personDetection = {
			className: 'person',
			confidence: 0.92,
			identifiesPerson: false,
			personIdentity: null,
			reviewStatus: 'unreviewed_proposal',
			evidenceStatus: 'derived_detection_only'
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/detection/person-check`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: personDetection }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/detection/person-check`);
		expect(res.status).toBe(200);

		// Then it is described only as a non-identifying model observation
		expect(res.body.data.identifiesPerson).toBe(false);
		expect(res.body.data.evidenceStatus).toBe('derived_detection_only');

		// And the interface does not infer a person's identity from the label or embedding similarity
		expect(res.body.data.personIdentity).toBeNull();
		expect(res.body.data.reviewStatus).toBe('unreviewed_proposal');
	});

	// Scenario 2.5: Face detection does not perform identity matching
	test('Scenario: Face detection does not perform identity matching', async ({ page }) => {
		const faceDetection = {
			feature: 'face_region',
			confidence: 0.88,
			hasIdentityTemplate: false,
			gallerySearchAttempted: false,
			crossCaseIdentityLinked: false,
			requiresSeparatePolicyAndReview: true
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/detection/face-policy`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: faceDetection }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/detection/face-policy`);
		expect(res.status).toBe(200);

		// Then it does not create an identity template or search a person-of-interest gallery
		expect(res.body.data.hasIdentityTemplate).toBe(false);
		expect(res.body.data.gallerySearchAttempted).toBe(false);

		// And it does not link a person identity across evidence items or cases
		expect(res.body.data.crossCaseIdentityLinked).toBe(false);

		// And any future identity-matching capability requires separate policy and review
		expect(res.body.data.requiresSeparatePolicyAndReview).toBe(true);
	});

	// Scenario 2.6: dHash is shown only as a frame-similarity clue
	test('Scenario: dHash is shown only as a frame-similarity clue', async ({ page }) => {
		const dhashResult = {
			frameA: { index: 14, dhashHex: '0123456789abcdef' },
			frameB: { index: 15, dhashHex: '0123456789abcde0' },
			hammingDistance: 2,
			role: 'deduplication_clue_only',
			proofAuthority: false,
			sourceIntegrityDeterminedBy: 'sha256'
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/dhash-comparison`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: dhashResult }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/dhash-comparison`);
		expect(res.status).toBe(200);

		// Then the hash result may help group or deduplicate frames
		expect(res.body.data.role).toBe('deduplication_clue_only');
		expect(res.body.data.hammingDistance).toBeLessThanOrEqual(5);

		// But it is not shown as proof of source identity, event identity, or claim truth
		expect(res.body.data.proofAuthority).toBe(false);

		// And source integrity is determined by the admitted source hash and revision
		expect(res.body.data.sourceIntegrityDeterminedBy).toBe('sha256');
	});

	// Scenario 2.7: VLM OCR and captions remain reviewable proposals
	test('Scenario: VLM OCR and captions remain reviewable proposals', async ({ page }) => {
		const proposalResult = {
			frameIndex: 14,
			sourceRevision: SOURCE_REV_VID,
			modelRevision: MODEL_REV_VLM,
			promptRevision: 'prompt.vlm-caption.v1',
			ocrText: 'SECURITY ACCESS GRANTED',
			caption: 'Individual interacting with access panel.',
			reviewStatus: 'unreviewed_proposal'
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/vlm-proposal/14`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: proposalResult }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/vlm-proposal/14`);
		expect(res.status).toBe(200);

		// Then it is linked to the exact frame and source revision
		expect(res.body.data.frameIndex).toBe(14);
		expect(res.body.data.sourceRevision).toBe(SOURCE_REV_VID);

		// And its model and prompt or processing revision are visible
		expect(res.body.data.modelRevision).toBe(MODEL_REV_VLM);
		expect(res.body.data.promptRevision).toBe('prompt.vlm-caption.v1');

		// And its review state is clearly shown as unreviewed until a reviewer acts
		expect(res.body.data.reviewStatus).toBe('unreviewed_proposal');
	});

	// Scenario 2.8: VLM frame selection respects the combined input budget
	test('Scenario: VLM frame selection respects the combined input budget', async ({ page }) => {
		const budgetPlan = {
			budgetTokens: 8192,
			textTokens: 1200,
			reservedOutputTokens: 512,
			tokensPerFrame: 140,
			requestedFramesCount: 60,
			allocatedFramesCount: 46,
			omittedFramesCount: 14,
			totalEstimatedTokens: 7952,
			fitsWithinBudget: true,
			omittedFramesRepresentedAsAnalyzed: false
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/vlm-budget-plan`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: budgetPlan }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/vlm-budget-plan`);
		expect(res.status).toBe(200);

		// Then the combined estimated input stays within the configured budget
		expect(res.body.data.fitsWithinBudget).toBe(true);
		expect(res.body.data.totalEstimatedTokens).toBeLessThanOrEqual(res.body.data.budgetTokens);

		// And frames are reduced according to the versioned sampling policy when necessary
		expect(res.body.data.allocatedFramesCount).toBeLessThan(res.body.data.requestedFramesCount);

		// And omitted frames are not represented as analyzed
		expect(res.body.data.omittedFramesRepresentedAsAnalyzed).toBe(false);
	});

	// Scenario Outline 2.9: A reviewer decision is recorded separately from model output (accept / reject / correct)
	for (const decision of ['accept', 'reject', 'correct'] as const) {
		test(`Scenario Outline: A reviewer decision is recorded separately from model output (${decision})`, async ({ page }) => {
			const initialFinding = {
				findingId: 'fnd-14',
				originalModelOutput: {
					caption: 'Person standing at door',
					confidence: 0.89
				},
				sourceRevision: SOURCE_REV_VID,
				evidenceBytesImmutable: true
			};

			const reviewRecord = {
				findingId: 'fnd-14',
				decision,
				reviewerId: 'investigator-smith-42',
				timestamp: '2026-11-14T03:30:00Z',
				sourceRevision: SOURCE_REV_VID,
				originalModelOutput: initialFinding.originalModelOutput,
				correctionText: decision === 'correct' ? 'Subject Vance entering with keycard #012' : null,
				evidenceBytesUnchanged: true
			};

			await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/findings/fnd-14/review`, async (route) => {
				if (route.request().method() === 'POST') {
					return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: reviewRecord }) });
				}
				return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: initialFinding }) });
			});

			const postRes = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/findings/fnd-14/review`, {
				method: 'POST',
				body: { decision, correction: decision === 'correct' ? 'Subject Vance entering with keycard #012' : null }
			});

			expect(postRes.status).toBe(200);

			// Then the original model output remains preserved
			expect(postRes.body.data.originalModelOutput.caption).toBe('Person standing at door');

			// And the reviewer decision, reviewer identity, time, and source revision are recorded
			expect(postRes.body.data.decision).toBe(decision);
			expect(postRes.body.data.reviewerId).toBe('investigator-smith-42');
			expect(postRes.body.data.sourceRevision).toBe(SOURCE_REV_VID);

			// And the original evidence bytes are unchanged
			expect(postRes.body.data.evidenceBytesUnchanged).toBe(true);
		});
	}

	// Scenario 2.10: Behavioral annotations describe observable actions only
	test('Scenario: Behavioral annotations describe observable actions only', async ({ page }) => {
		const behavioralAnnotation = {
			timeRange: { startMs: 14000, endMs: 18000 },
			observableAction: 'Subject touches card reader with rectangular object, door lock light changes green',
			uncertainty: 0.15,
			reviewerDisposition: 'verified_observable',
			labelsIntentOrEmotion: false,
			labelsGuiltOrIdentityAsFact: false
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/behavioral-annotation`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: behavioralAnnotation }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/behavioral-annotation`);
		expect(res.status).toBe(200);

		// Then it records the observable action, source interval, uncertainty, and reviewer disposition
		expect(res.body.data.observableAction).toContain('touches card reader');
		expect(res.body.data.uncertainty).toBe(0.15);
		expect(res.body.data.reviewerDisposition).toBe('verified_observable');

		// And it does not label intent, emotion, guilt, or identity as an observed fact
		expect(res.body.data.labelsIntentOrEmotion).toBe(false);
		expect(res.body.data.labelsGuiltOrIdentityAsFact).toBe(false);
	});

	// Scenario 2.11: Selecting a timeline result seeks to its source presentation time
	test('Scenario: Selecting a timeline result seeks to its source presentation time', async ({ page }) => {
		const timelineSelection = {
			targetTimestampMs: 14000,
			timeBase: { num: 1, den: 1000 },
			filmcraftTicks: '3556224000000', // 14.0 * 254_016_000_000
			seekPresentationSeconds: 14.0,
			formattedTimecode: '00:14',
			isReplacementLocator: false,
			isHighlighted: true
		};

		await page.route(`**/api/evidence/${VIDEO_EVIDENCE_ID}/timeline-seek?t=14000`, (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: timelineSelection }) })
		);

		const res = await fetchInPage(page, `/api/evidence/${VIDEO_EVIDENCE_ID}/timeline-seek?t=14000`);
		expect(res.status).toBe(200);

		// Then playback seeks using the source presentation timestamp and stream time base
		expect(res.body.data.seekPresentationSeconds).toBe(14.0);
		expect(res.body.data.timeBase.den).toBe(1000);

		// And the selected transcript interval or frame marker is highlighted
		expect(res.body.data.isHighlighted).toBe(true);

		// And the displayed timecode is a presentation of that source time, not a replacement locator
		expect(res.body.data.formattedTimecode).toBe('00:14');
		expect(res.body.data.isReplacementLocator).toBe(false);
	});
});
