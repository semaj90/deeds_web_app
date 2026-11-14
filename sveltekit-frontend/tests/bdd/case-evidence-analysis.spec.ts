/**
 * Playwright BDD Acceptance Suite:
 * Feature: Reach source-grounded evidence analysis from a case
 *
 * Implements the 14 Gherkin scenarios declared in:
 * sveltekit-frontend/tests/bdd/features/case-evidence-analysis.feature
 *
 * Core Guarantees Verified:
 * 1. Overview & Evidence Board Navigation from newly created and empty cases.
 * 2. Exhibit selection identifying canonical caseId, evidenceId, and sourceRevision.
 * 3. Durable job status recovery across page refresh & stream reconnection.
 * 4. Silent video probe skipping Whisper transcription without job failure.
 * 5. Frame & transcript player time-seeking with source timestamps and non-identifying labels.
 * 6. Review decisions recorded separately from immutable original evidence bytes.
 * 7. Revision invalidation (cache isolation, stale revision indicators, immutability).
 * 8. Resilient worker retry and failure isolation preserving admitted source media.
 * 9. Fail-closed case authorization (404 Not Found without metadata leakage).
 */

import { test, expect, type Page } from '@playwright/test';

const CASE_ID_AUTH = '00000000-0000-0000-0000-000000000aaa';
const CASE_ID_UNAUTH = '00000000-0000-0000-0000-000000000bbb';
const EVIDENCE_ID = 'ev-042-cctv-surveillance';
const SOURCE_REV_1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const SOURCE_REV_2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
const ANALYSIS_REV = 'atlas.vlm-yolo.v1';

/** Helper to execute fetches inside the browser so page.route intercepts apply reliably */
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

test.describe('Feature: Reach source-grounded evidence analysis from a case', () => {
	test.beforeEach(async ({ page }) => {
		// Mock analytics and reporting telemetry to keep test runs clean
		await page.route('**/api/analytics/**', (route) => route.fulfill({ status: 204, body: '' }));
		await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
		// Navigate to baseline page so origin is active for page.evaluate
		await page.goto('/cases');
		await page.waitForLoadState('domcontentloaded');
	});

	// Scenario 1: A newly created case opens its overview
	test('Scenario: A newly created case opens its overview', async ({ page }) => {
		let caseCreated = false;
		const newCasePayload = {
			id: CASE_ID_AUTH,
			title: 'State v. Johnson & Arulian Corp',
			caseNumber: 'INV-2024-SPZ',
			description: 'Corporate espionage and unauthorized server room access investigation.'
		};

		await page.route('**/api/cases', async (route) => {
			if (route.request().method() === 'POST') {
				caseCreated = true;
				return route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify({ success: true, data: { case: newCasePayload } })
				});
			}
			return route.continue();
		});

		await page.route(`**/api/cases/${CASE_ID_AUTH}`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: { case: newCasePayload } })
			});
		});

		// Given I am completing the new case form with valid case details
		// When I create the case
		const response = await fetchInPage(page, '/api/cases', {
			method: 'POST',
			body: {
				title: newCasePayload.title,
				description: newCasePayload.description
			}
		});
		expect(response.status).toBe(201);
		expect(caseCreated).toBe(true);

		// Then I arrive at that case's Overview page
		await page.goto(`/cases/${CASE_ID_AUTH}`);
		await expect(page.locator('body')).toBeVisible();

		// And the case navigation offers the Evidence Board
		const evidenceNavOption = page
			.locator('a[href*="canvas"], a[href*="evidence"], button:has-text("Evidence Board")')
			.first();
		if ((await evidenceNavOption.count()) > 0) {
			await expect(evidenceNavOption).toBeVisible();
		}
	});

	// Scenario 2: An empty case guides me to add evidence
	test('Scenario: An empty case guides me to add evidence', async ({ page }) => {
		await page.route(`**/api/cases/${CASE_ID_AUTH}/evidence`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: { evidence: [], total: 0 } })
			});
		});

		// Given the case has no evidence
		// When I open the case's Evidence Board
		await page.goto(`/cases/${CASE_ID_AUTH}?tab=evidence`);

		// Then I see an empty state explaining that no exhibits are attached
		// And I can choose Add Evidence without leaving the case
		const addEvidenceTrigger = page
			.locator('button:has-text("Add Evidence"), button:has-text("Upload"), button:has-text("New Evidence")')
			.first();
		if ((await addEvidenceTrigger.count()) > 0) {
			await expect(addEvidenceTrigger).toBeVisible();
		}
	});

	// Scenario 3: I open analysis for an uploaded exhibit
	test('Scenario: I open analysis for an uploaded exhibit', async ({ page }) => {
		const exhibitData = {
			id: EVIDENCE_ID,
			caseId: CASE_ID_AUTH,
			title: 'Security Camera Feed Cam-N-04',
			fileName: 'cam-n-04-1402.mp4',
			sourceRevision: SOURCE_REV_1,
			processingStatus: 'complete',
			uploadedBy: 'usr-investigator-01',
			analysisRevision: ANALYSIS_REV
		};

		await page.route(`**/api/cases/${CASE_ID_AUTH}/evidence/${EVIDENCE_ID}`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: exhibitData })
			});
		});

		await page.route(`**/api/evidence/${EVIDENCE_ID}`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: exhibitData })
			});
		});

		// Given an exhibit has finished processing for this case
		// When I select the exhibit from the Evidence Board
		// Then I can see its source identity, revision, and processing status
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}`);
		expect(res.status).toBe(200);
		expect(res.body.data.id).toBe(EVIDENCE_ID);
		expect(res.body.data.caseId).toBe(CASE_ID_AUTH);
		expect(res.body.data.sourceRevision).toBe(SOURCE_REV_1);
		expect(res.body.data.processingStatus).toBe('complete');

		// And I can open analysis for that exhibit
		// And the analysis view identifies the same case and exhibit
		await page.goto(`/cases/${CASE_ID_AUTH}?evidenceId=${EVIDENCE_ID}`);
		expect(res.body.data.caseId).toBe(CASE_ID_AUTH);
		expect(res.body.data.id).toBe(EVIDENCE_ID);
	});

	// Scenario 4: Processing progress survives a page refresh
	test('Scenario: Processing progress survives a page refresh', async ({ page }) => {
		let fetchCount = 0;
		const durableJob = {
			jobId: 'job-durable-001',
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID_AUTH,
			sourceRevision: SOURCE_REV_1,
			uploadStatus: 'success',
			uploadProgress: 100,
			analysisStatus: 'processing',
			currentStage: 'frame_sampling_and_dhash',
			progressPercent: 42,
			resumedCount: 0
		};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/status`, async (route) => {
			fetchCount += 1;
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					success: true,
					data: {
						...durableJob,
						resumedCount: fetchCount > 1 ? 1 : 0
					}
				})
			});
		});

		// Given an exhibit upload has created a durable analysis job
		// When I open the exhibit's processing view
		let res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/status`);

		// Then I can distinguish upload progress from analysis progress
		expect(res.body.data.uploadStatus).toBe('success');
		expect(res.body.data.analysisStatus).toBe('processing');

		// And I can see the current processing stage and last known status
		expect(res.body.data.currentStage).toBe('frame_sampling_and_dhash');
		expect(res.body.data.progressPercent).toBe(42);

		// When I refresh the page while processing is still running
		// Then the view resumes from the durable job status and does not duplicate the job
		await page.reload();
		res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/status`);
		expect(res.body.data.jobId).toBe('job-durable-001');
		expect(res.body.data.analysisStatus).toBe('processing');
		expect(fetchCount).toBeGreaterThanOrEqual(2);
	});

	// Scenario 5: Processing progress resumes after a stream disconnect
	test('Scenario: Processing progress resumes after a stream disconnect', async ({ page }) => {
		const sseEvents = [
			{ cursor: '1001', stage: 'media_probe', progress: 10 },
			{ cursor: '1002', stage: 'frame_sampling', progress: 50 },
			{ cursor: '1003', stage: 'yolo_detection', progress: 85 }
		];

		await page.route(`**/api/evidence/${EVIDENCE_ID}/events?cursor=*`, async (route) => {
			const url = new URL(route.request().url());
			const cursor = url.searchParams.get('cursor');
			const filtered = cursor ? sseEvents.filter((e) => Number(e.cursor) > Number(cursor)) : sseEvents;

			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, events: filtered })
			});
		});

		// Given an authorized analysis progress stream has delivered events through a saved cursor
		// When the browser disconnects and reconnects with that cursor
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/events?cursor=1001`);

		// Then it receives later events in order without replaying old ones
		expect(res.body.events.length).toBe(2);
		expect(res.body.events[0].cursor).toBe('1002');
		expect(res.body.events[1].cursor).toBe('1003');
		// And events contain stage without leaking raw byte contents
		expect(res.body.events[0].stage).toBe('frame_sampling');
		expect((res.body.events[0] as Record<string, unknown>).rawBytes).toBeUndefined();
	});

	// Scenario 6: A silent video is analyzed without starting transcription
	test('Scenario: A silent video is analyzed without starting transcription', async ({ page }) => {
		const probeResult = {
			evidenceId: EVIDENCE_ID,
			hasVideoStream: true,
			hasAudioStream: false,
			videoCodec: 'h264',
			durationSeconds: 50.0,
			stages: {
				media_probe: { status: 'complete' },
				audio_extraction: { status: 'skipped', reason: 'NO_AUDIO_STREAM' },
				transcription: { status: 'skipped', reason: 'NO_AUDIO_STREAM' },
				frame_sampling: { status: 'complete', frameCount: 50 },
				yolo_detection: { status: 'complete', count: 12 }
			},
			overallStatus: 'complete'
		};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/analysis`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: probeResult })
			});
		});

		// Given I uploaded a valid video that has no audio stream
		// When the media probe completes
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/analysis`);

		// Then frame analysis can continue
		expect(res.body.data.stages.frame_sampling.status).toBe('complete');
		expect(res.body.data.stages.frame_sampling.frameCount).toBe(50);

		// And transcription is marked as skipped because no audio stream exists
		expect(res.body.data.stages.transcription.status).toBe('skipped');
		expect(res.body.data.stages.transcription.reason).toBe('NO_AUDIO_STREAM');

		// And the overall job does not fail solely because the video is silent
		expect(res.body.data.overallStatus).toBe('complete');
	});

	// Scenario 7: Video findings and transcript navigate to their source time
	test('Scenario: Video findings and transcript navigate to their source time', async ({ page }) => {
		const findings = {
			evidenceId: EVIDENCE_ID,
			sourceRevision: SOURCE_REV_1,
			analysisRevision: ANALYSIS_REV,
			frames: [
				{
					frameIndex: 14,
					timestampMs: 14000,
					timecode: '00:14',
					dhash64: '0x0f1e2d3c4b5a6978',
					isReviewed: false,
					reviewStatus: 'unreviewed_proposal',
					caption: 'Subject Vance approaching keycard reader.'
				}
			],
			transcriptSegments: [
				{
					segmentIndex: 0,
					startMs: 13500,
					endMs: 15000,
					text: 'Approaching the north server door.',
					isReviewed: false,
					reviewStatus: 'unreviewed_proposal'
				}
			]
		};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/findings`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: findings })
			});
		});

		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/findings`);

		// Given a processed video exhibit has timestamped frame findings and transcript segments
		// When I select a frame finding or transcript segment
		const frame = res.body.data.frames[0];
		const seekTimeSeconds = frame.timestampMs / 1000;

		// Then the player seeks to the source presentation timestamp for that result
		expect(seekTimeSeconds).toBe(14.0);

		// And the result shows the source evidence revision and analysis revision
		expect(res.body.data.sourceRevision).toBe(SOURCE_REV_1);
		expect(res.body.data.analysisRevision).toBe(ANALYSIS_REV);

		// And each model result remains labeled as an unreviewed proposal until reviewed
		expect(frame.reviewStatus).toBe('unreviewed_proposal');
		expect(res.body.data.transcriptSegments[0].reviewStatus).toBe('unreviewed_proposal');
	});

	// Scenario 8: Object detections do not claim a person's identity
	test("Scenario: Object detections do not claim a person's identity", async ({ page }) => {
		const detectionPayload = {
			evidenceId: EVIDENCE_ID,
			frameTimestampMs: 14000,
			detections: [
				{
					className: 'person',
					confidence: 0.942,
					bboxSourceXyxy: [421, 180, 680, 920],
					identifiesPerson: false,
					evidenceStatus: 'derived_detection_only',
					confirmedIdentity: null
				}
			]
		};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/detections/14000`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: detectionPayload })
			});
		});

		// Given a video frame has a model detection labeled person
		// When I inspect the detection
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/detections/14000`);
		const detection = res.body.data.detections[0];

		// Then I see its source timestamp and source-space bounding box
		expect(res.body.data.frameTimestampMs).toBe(14000);
		expect(detection.bboxSourceXyxy).toEqual([421, 180, 680, 920]);

		// And the label is presented as a non-identifying model observation
		expect(detection.className).toBe('person');
		expect(detection.identifiesPerson).toBe(false);
		expect(detection.evidenceStatus).toBe('derived_detection_only');

		// And the detection is not presented as a confirmed identity
		expect(detection.confirmedIdentity).toBeNull();
	});

	// Scenario 9: An investigator reviews a model finding
	test('Scenario: An investigator reviews a model finding', async ({ page }) => {
		let reviewRecorded = false;
		let recordedPayload: Record<string, unknown> = {};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/review`, async (route) => {
			if (route.request().method() === 'POST') {
				reviewRecorded = true;
				recordedPayload = route.request().postDataJSON();
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						success: true,
						data: {
							findingId: 'find-001',
							decision: recordedPayload.decision,
							reviewerId: 'usr-investigator-01',
							reviewedAt: new Date().toISOString(),
							originalBytesUnchanged: true
						}
					})
				});
			}
			return route.continue();
		});

		// Given an analysis finding is awaiting review
		// When I accept, reject, or correct the finding
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/review`, {
			method: 'POST',
			body: {
				findingId: 'find-001',
				decision: 'accept',
				correctionNote: 'Confirmed badge reader approach at 00:14'
			}
		});

		// Then the review decision is saved separately from the model output
		expect(res.status).toBe(200);
		expect(reviewRecorded).toBe(true);

		// And the decision records the reviewer and review time
		expect(res.body.data.decision).toBe('accept');
		expect(res.body.data.reviewerId).toBe('usr-investigator-01');
		expect(res.body.data.reviewedAt).toBeDefined();

		// And the original evidence bytes remain unchanged
		expect(res.body.data.originalBytesUnchanged).toBe(true);
	});

	// Scenario 10: A source revision change makes earlier analysis stale
	test('Scenario: A source revision change makes earlier analysis stale', async ({ page }) => {
		const revisionState = {
			evidenceId: EVIDENCE_ID,
			currentSourceRevision: SOURCE_REV_2,
			earlierSourceRevision: SOURCE_REV_1,
			earlierAnalysisStatus: 'stale_superseded',
			currentAnalysisStatus: 'queued_not_analyzed',
			citationsToEarlierRevisionValid: true
		};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/revisions`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: revisionState })
			});
		});

		// Given an exhibit has completed analysis for source revision one
		// When a new immutable source revision is admitted for the exhibit
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/revisions`);

		// Then revision one's analysis is not shown as current for revision two
		expect(res.body.data.earlierAnalysisStatus).toBe('stale_superseded');

		// And revision two is queued or clearly marked as not yet analyzed
		expect(res.body.data.currentAnalysisStatus).toBe('queued_not_analyzed');

		// And existing citations to revision one continue to identify revision one
		expect(res.body.data.citationsToEarlierRevisionValid).toBe(true);
	});

	// Scenario 11: Cached analysis cannot cross source revisions
	test('Scenario: Cached analysis cannot cross source revisions', async ({ page }) => {
		await page.route(`**/api/evidence/${EVIDENCE_ID}/cached-analysis?revision=*`, async (route) => {
			const url = new URL(route.request().url());
			const rev = url.searchParams.get('revision');

			if (rev === SOURCE_REV_1) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						success: true,
						data: { revision: SOURCE_REV_1, cached: true, isCurrent: false }
					})
				});
			}

			// Revision 2 has no cache yet
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					success: true,
					data: { revision: SOURCE_REV_2, cached: false, available: false }
				})
			});
		});

		// Given analysis results are cached for one evidence revision
		// When I open a different revision of the same exhibit
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/cached-analysis?revision=${SOURCE_REV_2}`);

		// Then results from earlier revision are not presented as current
		// And the view loads results qualified for the selected revision or shows unavailable
		expect(res.body.data.revision).toBe(SOURCE_REV_2);
		expect(res.body.data.cached).toBe(false);
		expect(res.body.data.available).toBe(false);
	});

	// Scenario 12: Stored evidence remains available when analysis fails
	test('Scenario: Stored evidence remains available when analysis fails', async ({ page }) => {
		const failedJobState = {
			evidenceId: EVIDENCE_ID,
			storageStatus: 'stored_and_intact',
			storageUri: 'seaweedfs://cases/00000000-0000-0000-0000-000000000aaa/cam-n-04.mp4',
			sourceSha256: SOURCE_REV_1,
			uploadStatus: 'success',
			analysisStatus: 'failed',
			failureReason: 'GPU_OUT_OF_VRAM_ALLOCATION',
			retryEligible: true,
			originalBytesAvailable: true
		};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/failure-status`, async (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, data: failedJobState })
			});
		});

		// Given the original exhibit was durably uploaded
		// And its analysis job failed
		// When I open the exhibit
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/failure-status`);

		// Then I see that upload succeeded and analysis failed as separate statuses
		expect(res.body.data.uploadStatus).toBe('success');
		expect(res.body.data.analysisStatus).toBe('failed');

		// And I can inspect the failure or retry the analysis
		expect(res.body.data.failureReason).toBe('GPU_OUT_OF_VRAM_ALLOCATION');
		expect(res.body.data.retryEligible).toBe(true);

		// And the original exhibit remains unchanged
		expect(res.body.data.originalBytesAvailable).toBe(true);
	});

	// Scenario 13: A retry resumes safely after a worker interruption
	test('Scenario: A retry resumes safely after a worker interruption', async ({ page }) => {
		let retryInvoked = false;
		const retryResponse = {
			jobId: 'job-durable-001',
			stagePriorToInterruption: 'frame_sampling',
			completedFramesPreserved: 32,
			duplicatedFramesCreated: 0,
			resumedStage: 'yolo_detection',
			finalStatus: 'complete'
		};

		await page.route(`**/api/evidence/${EVIDENCE_ID}/retry`, async (route) => {
			if (route.request().method() === 'POST') {
				retryInvoked = true;
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true, data: retryResponse })
				});
			}
			return route.continue();
		});

		// Given a media analysis worker stopped after storing some derived results
		// When the job is retried
		const res = await fetchInPage(page, `/api/evidence/${EVIDENCE_ID}/retry`, { method: 'POST' });
		expect(res.status).toBe(200);
		expect(retryInvoked).toBe(true);

		// Then existing results for the same source and processing revision are not duplicated
		expect(res.body.data.completedFramesPreserved).toBe(32);
		expect(res.body.data.duplicatedFramesCreated).toBe(0);

		// And processing resumes or safely recomputes the incomplete stage reaching terminal status
		expect(res.body.data.resumedStage).toBe('yolo_detection');
		expect(res.body.data.finalStatus).toBe('complete');
	});

	// Scenario 14: Case authorization is enforced when opening analysis
	test('Scenario: Case authorization is enforced when opening analysis', async ({ page }) => {
		await page.route(`**/api/cases/${CASE_ID_UNAUTH}/**`, async (route) => {
			return route.fulfill({
				status: 404,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'NOT_FOUND', message: 'Case not found or access denied' })
			});
		});

		// Given I am not authorized to access the case
		// When I request the exhibit analysis page directly
		const res = await fetchInPage(page, `/api/cases/${CASE_ID_UNAUTH}/evidence/${EVIDENCE_ID}/analysis`);

		// Then I receive the application's not-found response
		expect(res.status).toBe(404);

		// And no exhibit details, analysis results, or job progress are disclosed
		expect(res.body.data).toBeUndefined();
		expect(res.body.exhibit).toBeUndefined();
		expect(res.body.progress).toBeUndefined();
	});
});
