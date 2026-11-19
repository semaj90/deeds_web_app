// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneIntentSchema } from '$lib/server/reconstruction/crime-scene-schema.js';
import { buildStorybookImageObservationReadModelV1 } from '$lib/server/evidence/storybook-image-observation-read-model-v1.js';
import { buildStorybookImageIntentV1, buildStorybookImagePrefillV1 } from '$lib/server/reconstruction/storybook-image-prefill-v1.js';
import { buildReviewedImageStorybookChapterV1 } from '$lib/shared/storybook-image-chapter-v1.js';
import { POST } from './+server.js';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), lookup: vi.fn(), extract: vi.fn() }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.authorize }));
vi.mock('$lib/server/db/client.js', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.lookup }) }) }) } }));
vi.mock('$lib/server/reconstruction/scene-intent-extractor.js', () => ({
	extractSceneIntent: mocks.extract,
	buildDegradedFixture: () => null,
}));

const caseId = '00000000-0000-4000-8000-0000000000bb';
const evidenceId = '00000000-0000-4000-8000-0000000000aa';
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const artifactSha256 = `sha256:${'b'.repeat(64)}`;
const analysisRevision = 'analysis-1';
const frame = { frameIndex: 0, timestampMs: 250, width: 100, height: 80, sourceRevision, analysisRevision,
	modelRevision: 'yolox-1', detectionStatus: 'COMPLETED',
	artifact: { sha256: artifactSha256, sourceRevision, analysisRevision, contentType: 'image/jpeg' },
	objects: [{ label: 'person', confidence: 0.9, bbox: [0, 0, 80, 60] }] };
const source = { hash: sourceRevision, aiAnalysis: { videoAnalysis: {
	schema: 'atlas.video-analysis.v1', sourceRevision, analysisRevision, analysisJobId: '00000000-0000-4000-8000-0000000000cc', frames: [frame],
} } };

const request = (overrides: Record<string, unknown> = {}) => ({
	locals: { user: { id: 7 } },
	request: new Request('http://localhost/api/reconstruction/scene-intent', { method: 'POST', body: JSON.stringify({
		caseId, narrative: 'Review', storybookFrame: { evidenceId, sourceRevision, analysisRevision, artifactSha256, frameIndex: 0, ...overrides },
	}) }),
}) as never;

describe('authorized frame to storyboard proposal', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.authorize.mockResolvedValue({ id: caseId });
		mocks.lookup.mockResolvedValue([source]);
		mocks.extract.mockImplementation(async ({ storybookPrefill }) => {
			const input = JSON.parse(storybookPrefill);
			const actor = { actor_id: 'actor-1', label: 'Unidentified person', role: 'unknown' };
			return { ok: true, source: 'llm', diagnostics: {}, sceneIntent: SceneIntentSchema.parse({
				scene_id: 'draft', case_id: caseId, title: 'Frame review', duration_s: 20,
				environment: { city: 'unspecified' }, actors: [actor], events: [{
					id: 'beat-1', time_s: 0, duration_s: 5, who: [actor], action: 'idle', confidence: 'low', kind: 'hypothesis',
					what: 'A detector proposed a person.', how: 'Inspect the box.', citations: [{ source: 'image_observation',
						evidence_id: evidenceId, source_revision: sourceRevision, frame_index: 0, frame_timestamp_s: 0.25,
						observation_kind: 'detection', model_version: 'yolox-1', observation_id: input.observations[0].observationId }],
				}],
			}) };
		});
	});

	it('rechecks the source after synthesis and returns a cited hypothesis', async () => {
		const result = await POST(request());
		expect(result.status).toBe(200);
		expect(await result.json()).toMatchObject({ ok: true, prefillSha256: expect.stringMatching(/^sha256:/) });
		expect(mocks.lookup).toHaveBeenCalledTimes(2);
		expect(mocks.extract).toHaveBeenCalledTimes(1);
	});

	it('keeps unauthorized and stale observations out of model context', async () => {
		mocks.authorize.mockResolvedValueOnce(null);
		expect((await POST(request())).status).toBe(404);
		expect((await POST(request({ analysisRevision: 'stale' }))).status).toBe(409);
		expect(mocks.extract).not.toHaveBeenCalled();
	});

	it('discards a valid draft if the analysis changes before readback', async () => {
		mocks.lookup.mockResolvedValueOnce([source]).mockResolvedValueOnce([]);
		const result = await POST(request());
		expect(result.status).toBe(409);
		expect(await result.json()).toMatchObject({ ok: false, sceneIntent: null });
	});
});

const stillAnalysis = {
	sourceRevision, visionSummary: 'A courtroom-like interior may be visible behind the person.', visionModelId: 'fixture-vision',
	objectDetections: [{ class: 'person', confidence: 0.9, bbox: [0, 0, 80, 60] }], stageErrors: [],
	silhouettes: [{ artifactKind: 'sam2_alpha_silhouette' as const, is3DReconstruction: false as const, targetBoxIndex: 0,
		sourceDetectionIndex: 0, label: 'person', iouScore: 0.85, modelRevision: 'fixture-sam2',
		maskSha256: 'b'.repeat(64), maskObjectKey: `derived/sam2/${'b'.repeat(64)}.png` }],
};
const stillManifest = buildStorybookImageObservationReadModelV1({
	evidenceId, sourceRevision, analysisRevision, width: 100, height: 80, analysis: stillAnalysis,
})!.manifest;
const imageScope = { evidenceId, sourceRevision, analysisRevision, observationRevision: stillManifest.observationRevision };
const stillReadback = { status: 'CURRENT', caseId, evidenceId, sourceRevision, analysisRevision, storybook: stillManifest };
const readImage = vi.fn();
const imageRequest = (extra: Record<string, unknown> = {}) => ({
	locals: { user: { id: 7 } }, fetch: readImage,
	request: new Request('http://localhost/api/reconstruction/scene-intent', { method: 'POST', body: JSON.stringify({
		caseId, narrative: 'Client-supplied narrative', storybookImage: imageScope, ...extra,
	}) }),
}) as never;

describe('authorized still image to storyboard proposal', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.authorize.mockResolvedValue({ id: caseId });
		readImage.mockImplementation(async () => Response.json(stillReadback));
		mocks.extract.mockImplementation(async ({ storybookImagePrefill }) => {
			const draft = {
				title: 'Image review', events: [{
					what: 'A detector proposed a person.', how: 'Inspect the box and scene description.',
					citation_refs: [1, 2, 3],
				}],
			};
			return { ok: true, source: 'llm', diagnostics: {}, sceneIntent: SceneIntentSchema.parse(buildStorybookImageIntentV1(draft, storybookImagePrefill)) };
		});
	});

	it('passes distinct canonical observations and returns exact citations without invented frame time', async () => {
		const acceptedMask = { observationId: stillManifest.masks[0].observationId, versionId: caseId, decision: 'ACCEPTED' };
		readImage.mockImplementation(async () => Response.json({ ...stillReadback,
			storybook: { ...stillManifest, reviews: [acceptedMask, {
				observationId: stillManifest.sceneContext?.observationId, versionId: evidenceId, decision: 'ACCEPTED',
			}] } }));
		const result = await POST(imageRequest({ useAce: true }));
		expect(result.status).toBe(200);
		expect(readImage).toHaveBeenCalledTimes(2);
		expect(readImage).toHaveBeenCalledWith(`/api/evidence/${evidenceId}/multimodal-analysis`, { cache: 'no-store', redirect: 'error' });
		const input = mocks.extract.mock.calls[0]?.[0];
		expect(input.narrative).not.toContain('Client-supplied');
		expect(input.aceContext).toBeUndefined();
		const packet = input.storybookImagePrefill;
		expect(packet.observations.map((entry: { kind: string }) => entry.kind)).toEqual(['detection', 'segmentation_mask', 'scene_context']);
		expect(packet.observations[2]).toMatchObject({ reviewState: 'UNREVIEWED_PROPOSAL', modelId: 'fixture-vision' });
		expect(JSON.stringify(packet)).not.toContain('derived/sam2/');
		const response = await result.json();
		expect(response.spatialReviews).toEqual([acceptedMask]);
		expect(response.prefillSha256).toBe(packet.prefillSha256);
		expect(response.sceneIntent).toMatchObject({ case_id: caseId, duration_s: 20, actors: [{ role: 'unknown', label: 'Source review' }],
			events: [{ kind: 'hypothesis', time_s: 0, duration_s: 20, action: 'idle', path: [] }] });
		expect(response.sceneIntent.events[0].citations[1]).toMatchObject({ artifact_sha256: artifactSha256, model_version: 'fixture-sam2' });
		expect(response.sceneIntent.events[0].citations.every((entry: Record<string, unknown>) => !('frame_timestamp_s' in entry))).toBe(true);
	});

	it('cites an OCR span on its exact observation revision and retains its text in the chapter', async () => {
		const manifest = buildStorybookImageObservationReadModelV1({
			evidenceId, sourceRevision, analysisRevision, width: 100, height: 80, analysis: stillAnalysis,
			imageOcr: { sourceRevision, status: 'COMPLETED', engine: 'tesseract',
				policyRevision: 'atlas.image-ocr.eng-oriented-png-1280.v1', inputSha256: artifactSha256,
				text: 'EXIT ONLY', truncated: false },
		})!.manifest;
		const scope = { ...imageScope, observationRevision: manifest.observationRevision };
		readImage.mockImplementation(async () => Response.json({ ...stillReadback, storybook: manifest }));
		mocks.extract.mockImplementation(async ({ storybookImagePrefill }) => ({
			ok: true, source: 'llm', diagnostics: {}, sceneIntent: SceneIntentSchema.parse(buildStorybookImageIntentV1({
				title: 'Read signage', events: [{ what: 'OCR suggests EXIT ONLY.', how: 'Compare with the image.', citation_refs: [4] }],
			}, storybookImagePrefill)),
		}));
		const response = await POST(imageRequest({ storybookImage: scope }));
		expect(response.status).toBe(200);
		const { prefillSha256, sceneIntent } = await response.json();
		const [citation] = sceneIntent.events[0].citations;
		expect(citation).toMatchObject({ observation_kind: 'image_ocr_span', observation_id: manifest.ocrSpan?.observationId });
		expect(citation).not.toHaveProperty('frame_index');
		const chapter = buildReviewedImageStorybookChapterV1(manifest, {
			chapterId: caseId, prefillSha256, title: 'Read signage',
			beats: [{ what: 'OCR suggests EXIT ONLY.', how: 'Compare with the image.', observationIds: [citation.observation_id] }],
		});
		expect(chapter?.citations).toEqual([expect.objectContaining({ text: 'EXIT ONLY', startUtf16: 0, endUtf16: 9 })]);
		expect((await POST(imageRequest())).status).toBe(409);
	});

	it('excludes a rejected box and its mask and discards a draft when a review changes during synthesis', async () => {
		const rejected = { ...stillReadback, storybook: { ...stillManifest, reviews: [{
			observationId: stillManifest.detections[0].observationId, versionId: caseId, decision: 'REJECTED',
		}] } };
		const packet = buildStorybookImagePrefillV1(rejected, caseId, imageScope);
		expect(packet?.observations.map(({ kind }) => kind)).toEqual(['scene_context']);
		readImage.mockResolvedValueOnce(Response.json(stillReadback)).mockResolvedValueOnce(Response.json(rejected));
		expect((await POST(imageRequest())).status).toBe(409);
		expect(mocks.extract).toHaveBeenCalledOnce();
	});

	it('withholds a source from another case, and does not fetch when case access is denied', async () => {
		mocks.authorize.mockResolvedValueOnce(null);
		expect((await POST(imageRequest())).status).toBe(404);
		expect(readImage).not.toHaveBeenCalled();
		readImage.mockResolvedValueOnce(Response.json({ ...stillReadback, caseId: '00000000-0000-4000-8000-000000000099' }));
		expect((await POST(imageRequest())).status).toBe(409);
		expect(mocks.extract).not.toHaveBeenCalled();
	});

	it('retains failed coverage and skips synthesis when no current observation qualifies', async () => {
		const manifest = buildStorybookImageObservationReadModelV1({ evidenceId, sourceRevision, analysisRevision,
			width: 100, height: 80, analysis: { ...stillAnalysis, stageErrors: ['detection:UNAVAILABLE', 'silhouette:FAILED', 'vision:UNAVAILABLE'] },
		})!.manifest;
		const locator = { ...imageScope, observationRevision: manifest.observationRevision };
		const readback = { ...stillReadback, storybook: manifest };
		expect(buildStorybookImagePrefillV1(readback, caseId, locator)).toMatchObject({
			observations: [], coverage: { detection: 'FAILED_OR_UNAVAILABLE', mask: 'FAILED_OR_UNAVAILABLE', sceneContext: 'FAILED_OR_UNAVAILABLE' },
		});
		readImage.mockResolvedValueOnce(Response.json(readback));
		expect((await POST(imageRequest({ storybookImage: locator }))).status).toBe(422);
		expect(mocks.extract).not.toHaveBeenCalled();
	});

	it('invalidates a draft when its scene description changes while the model runs', async () => {
		const updated = buildStorybookImageObservationReadModelV1({ evidenceId, sourceRevision, analysisRevision,
			width: 100, height: 80, analysis: { ...stillAnalysis, visionSummary: 'An indoor room of uncertain purpose.' } })!.manifest;
		expect(updated.observationRevision).not.toBe(stillManifest.observationRevision);
		readImage.mockResolvedValueOnce(Response.json(stillReadback)).mockResolvedValueOnce(Response.json({ ...stillReadback, storybook: updated }));
		const result = await POST(imageRequest());
		expect(result.status).toBe(409);
		expect(await result.json()).toMatchObject({ sceneIntent: null, prefillSha256: null });
	});

	it.each([
		['analysis revision', { analysis_revision: 'a-different-run' }],
		['observation revision', { observation_revision: `sha256:${'f'.repeat(64)}` }],
		['observation id', { observation_id: `sha256:${'f'.repeat(64)}` }],
		['artifact digest', { artifact_sha256: `sha256:${'f'.repeat(64)}` }],
		['artifact URL', { artifact_uri: 'https://example.test/unknown.png' }],
		['model revision', { model_version: 'imagined-model' }],
		['frame time', { frame_timestamp_s: 1 }],
		['observation kind', { observation_kind: 'scene_context' }],
	])('rejects a model-supplied %s outside the selected image packet', async (_field, override) => {
		const fixtureExtract = mocks.extract.getMockImplementation()!;
		mocks.extract.mockImplementationOnce(async (input) => {
			const fixture = await fixtureExtract(input);
			Object.assign(fixture.sceneIntent.events[0].citations[1], override);
			return fixture;
		});
		expect((await POST(imageRequest())).status).toBe(422);
	});

	it('only expands unique citation indexes in the packet and refuses rewritten provenance', () => {
		const packet = buildStorybookImagePrefillV1(stillReadback, caseId, imageScope)!;
		const beat = { what: 'A mask reference is registered.', how: 'Compare the mask to its source box.' };
		expect(buildStorybookImageIntentV1({ title: 'Review', events: [{ ...beat, citation_refs: [4] }] }, packet)).toBeNull();
		expect(buildStorybookImageIntentV1({ title: 'Review', events: [{ ...beat, citation_refs: [2, 2] }] }, packet)).toBeNull();
		expect(buildStorybookImageIntentV1({ title: 'Review', events: [{ ...beat, citation_refs: [2], citations: [] }] }, packet)).toBeNull();
		expect(buildStorybookImageIntentV1({ title: 'Review', events: [{ ...beat, citation_refs: [2] }] }, packet)).toMatchObject({
			events: [{ citations: [{ observation_kind: 'segmentation_mask', artifact_sha256: artifactSha256 }] }],
		});
	});
});
