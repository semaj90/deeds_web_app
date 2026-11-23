import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { appendSceneDocumentRevisionV1, readSceneDocumentRevisionV1, readSavedStorybookChapterV1, readSavedImageStorybookChapterV1, matchesReviewedImageChapterV1, sceneRevisionCommandV1Schema, validateSceneRevisionBindingV1, validateNewSceneAnimationEventBindingsV1, validateSceneEvidenceSourceBindingsV1, validateSceneVideoEventBindingsV1, validateSceneGroundPlaneTrackProposalsV1, hashSceneDocumentV1, verifySceneDocumentRevisionReadbackV1 } from './scene-document-revisions-v1.js';
import { createSceneCalibrationV1, SPZ_DECODER_REVISION_V1, SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 } from '$lib/splat/scene-document-v1.js';
import type { CalibrationAnchor } from '$lib/splat/calibration.js';
import { fuseVideoEventsV1 } from '$lib/server/features/evidence/video/video-event-fusion-v1.js';
import { createPlanarCameraCalibrationV1 } from '$lib/splat/planar-camera-calibration-v1.js';
import { deriveReviewedGroundPlaneTrackFromHistoryV1 } from '$lib/splat/reviewed-ground-plane-track-v1.js';
import { humanCoco17PoseSchemaV1 } from '$lib/shared/pose-skeleton-schema-v1.js';
import { buildReviewedVideoStorybookChapterV1 } from '$lib/server/reconstruction/reviewed-video-storybook-chapter-v1.js';
import { parseWholeImageAnalysisRowV1 } from '$lib/server/evidence/whole-image-analysis-readback-v1.js';
import { buildStorybookImagePrefillV1 } from '$lib/server/reconstruction/storybook-image-prefill-v1.js';
import { buildReviewedImageStorybookChapterV1 } from '$lib/shared/storybook-image-chapter-v1.js';
import { buildSceneGenerationPlanV1 } from '$lib/server/reconstruction/scene-generation-plan-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const commandId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const manifest = (overrides: Record<string, unknown> = {}) => ({
	schema: 'parent-atlas.scene-document.v1', sceneId, caseId, status: 'HYPOTHESIS', revision: 1,
	parentManifestSha256: null, createdAt: '2026-11-05T12:00:00.000Z', coordinateFrame: 'LOCAL_UNCALIBRATED',
	objects: [], animations: [], evidenceBindings: [], evidenceSources: [], assets: [],
	quality: { triangleBudget: null, triangleCount: 0, textureBytes: null, derivedAssetBytes: 0, derivedAssetByteBudget: 8 * 1024 * 1024, derivedAssetByteStatus: 'WITHIN_BUDGET', status: 'NOT_ASSESSED' },
	...overrides
});

function chapterFixture(sourceEvidenceId = evidenceId) {
	const evidenceId = sourceEvidenceId;
	const analysisRevision = 'video-analysis-v1:chapter-fixture';
	const artifactSha256 = `sha256:${'b'.repeat(64)}`;
	const frame = { frameIndex: 0, timestampMs: 1270, sourceRevision, analysisRevision, width: 100, height: 80,
		modelRevision: 'detector-v1', artifact: { sha256: artifactSha256, sourceRevision, analysisRevision, contentType: 'image/jpeg' },
		objects: [{ label: 'backpack', confidence: 0.7, bbox: [50, 10, 70, 30] }],
		ocr: { engine: 'tesseract', status: 'COMPLETED', text: 'Platform 4' } };
	const timeline = fuseVideoEventsV1({ caseId, evidenceId, transcriptId: commandId, sourceRevision, analysisRevision, frames: [frame],
		transcriptSegments: [{ segmentIndex: 0, startMs: 1000, endMs: 1800, text: 'Fixture transcript excerpt' }] });
	const event = { ...timeline.events[0]!, reviewStatus: 'APPROVED', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', reviewedBy: 7, reviewedAt: '2026-11-16T20:00:00.000Z' };
	const videoAnalysis = { schema: 'atlas.video-analysis.v1', sourceRevision, analysisRevision, analysisJobId: commandId,
		frames: [frame], eventTimeline: { ...timeline, events: [event] } };
	const chapter = buildReviewedVideoStorybookChapterV1({ caseId, evidenceId, sourceRevision, videoAnalysis, eventId: event.eventId })!.chapter;
	const binding = { evidenceId, sourceRevision, analysisRevision, eventId: event.eventId, startMs: event.startMs, endMs: event.endMs,
		reviewState: 'APPROVED_FOR_SCENE_PROPOSAL', chapter };
	return { videoAnalysis, binding, chapter, evidenceRow: { id: evidenceId, caseId, hash: sourceRevision, aiAnalysis: { videoAnalysis } } };
}

function imageChapterFixture() {
	const analysisRevision = 'fixture-image-1';
	const maskSha256 = 'b'.repeat(64);
	const row = { source_revision: sourceRevision, analysis_revision: analysisRevision,
		source_locator: { kind: 'whole_image', coordinateSpace: 'original_pixels', width: 100, height: 80 },
		metadata: { visualAnalysis: {
			schema: 'atlas.evidence-visual-analysis.v1', authority: 'OBSERVATION_ONLY', sourceRevision, status: 'COMPLETE',
			detectionExecuted: true, silhouetteStageStatus: 'EXECUTED',
			objectDetections: [{ class: 'chair', confidence: .85, bbox: [50, 10, 70, 30] }],
			layoutRegions: [], visionSummary: 'An indoor room of uncertain purpose.', visionModelId: 'fixture-vision',
			visionFindings: [], visionTags: [], depthMap: null, stageErrors: [],
			silhouettes: [{ artifactKind: 'sam2_alpha_silhouette', is3DReconstruction: false, targetBoxIndex: 0, sourceDetectionIndex: 0,
				label: 'chair', iouScore: .87, maskSha256, maskObjectKey: `derived/sam2/${maskSha256}.png` }],
		} },
	};
	const observations = parseWholeImageAnalysisRowV1(row, evidenceId, sourceRevision)!.storybook!.manifest;
	const scope = { evidenceId, sourceRevision, analysisRevision, observationRevision: observations.observationRevision };
	const packet = buildStorybookImagePrefillV1({ status: 'CURRENT', caseId, ...scope, storybook: observations }, caseId, scope)!;
	const chapter = buildReviewedImageStorybookChapterV1(observations, { chapterId: commandId, prefillSha256: packet.prefillSha256,
		title: 'Inspect the image', beats: [{ what: 'A detector proposed a chair.', how: 'Check the mask and the room description.',
			observationIds: packet.observations.map((item) => item.observationId) }] })!;
	return { row, chapter, evidenceRow: { id: evidenceId, caseId, hash: sourceRevision, aiAnalysis: null } };
}

describe('scene document revision v1 admission', () => {
	it('pins a house note to its event, evidence and original plan through revision readback', async () => {
		const { binding, evidenceRow, videoAnalysis } = chapterFixture();
		const plan = buildSceneGenerationPlanV1({
			schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 0,
			generator: 'procedural-three-scene-v1', caseIntake: null,
			narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
			sources: [{ evidenceId, sourceRevision, sha256: sourceRevision.slice(7) }],
			actors: [], primitives: [{ objectId: 'OBJECT-ALARM', registryId: 'cone' }],
			placements: [{ placementId: 'PLACEMENT-ALARM', targetKind: 'primitive', targetId: 'OBJECT-ALARM',
				positionMeters: [0, 0, 0], rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] }],
			events: [{ eventId: 'EVENT-01', cueType: 'custom', label: 'Reported activity near desk',
				status: 'hypothesis', reviewStatus: 'accepted', evidenceIds: [evidenceId],
				targetRefs: [{ kind: 'primitive', targetId: 'OBJECT-ALARM' }],
				action: { type: 'pulse_light_during_interval', colorHex: '#bb4422', minIntensity: 0.2, maxIntensity: 3, periodMs: 640 },
				clock: { evidenceId, clockId: `evidence:${evidenceId}`, startMs: binding.startMs, endMs: binding.endMs, uncertaintyMs: 200 },
				sourceEvent: { sourceEvidenceId: evidenceId, sourceEventId: binding.eventId,
					analysisRevision: binding.analysisRevision, startMs: binding.startMs, endMs: binding.endMs } }],
			environment: { kind: 'four-bedroom-house', seed: 1, cellSizeMeters: 32,
				extentMeters: { x: 32, z: 32 }, coordinateStatus: 'illustrative_uncalibrated' },
			quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 100_000, maxInstances: 20_000, activeSceneMemoryMiB: 8 },
			provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned',
				identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
		});
		const note = { id: commandId, eventId: 'EVENT-01', sourceTimeMs: binding.startMs, text: 'Compare this placement with the source', objectId: 'bedroom-1-desk' };
		const draft = { schema: 'parent-atlas.scene-preview-draft/v1', plan, annotations: [note] };
		const evidenceBindings = [{ evidenceId, sourceRevision }];
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0,
			manifest: manifest({ evidenceBindings, proceduralPreviewDraft: draft }) });
		for (const altered of [{ ...note, sourceTimeMs: binding.endMs }, { ...note, objectId: 'invented-desk' }]) {
			expect(sceneRevisionCommandV1Schema.safeParse({ ...command, manifest: manifest({
				evidenceBindings, proceduralPreviewDraft: { ...draft, annotations: [altered] }
			}) }).success).toBe(false);
		}
		expect(() => validateSceneRevisionBindingV1({ caseId, sceneId, command: { ...command, manifest: {
			...command.manifest, proceduralPreviewDraft: { ...command.manifest.proceduralPreviewDraft!, plan: { ...plan, planHash: '0'.repeat(64) } }
		} } })).toThrow('SCENE_REVISION_PLAN_HASH_MISMATCH');
		for (const altered of [
			{ ...videoAnalysis, analysisRevision: 'replacement' },
			{ ...videoAnalysis, eventTimeline: { ...videoAnalysis.eventTimeline, events: videoAnalysis.eventTimeline.events.map((event) =>
				({ ...event, reviewStatus: 'REJECTED', sceneAdmission: 'NOT_ADMITTED' })) } }
		]) {
			expect(() => validateSceneVideoEventBindingsV1({ caseId, manifest: command.manifest,
				evidenceRows: [{ ...evidenceRow, aiAnalysis: { videoAnalysis: altered } }]
			})).toThrow('SCENE_REVISION_VIDEO_EVENT_NOT_ADMITTED');
		}
		const lockEvidence = vi.fn().mockResolvedValue([evidenceRow]);
		const select = vi.fn()
			.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
			.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })
			.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ for: lockEvidence }) }) }) });
		let stored: Record<string, unknown> | undefined;
		const transaction = (run: (transaction: unknown) => unknown) => run({
			execute: vi.fn(), select,
			insert: () => ({ values: (row: Record<string, unknown>) => ({ returning: async () => {
				stored = JSON.parse(JSON.stringify(row));
				return [row];
			} }) })
		});
		const receipt = await appendSceneDocumentRevisionV1({ caseId, sceneId, command, actorId: 7 }, { transaction } as never);
		expect(lockEvidence).toHaveBeenCalledWith('share');
		const reopened = await readSceneDocumentRevisionV1({ caseId, sceneId, revision: 1 }, {
			select: () => ({ from: () => ({ where: () => ({ limit: async () => [stored] }) }) })
		} as never);
		expect(reopened?.manifestSha256).toBe(receipt.manifestSha256);
		expect(reopened?.manifest.proceduralPreviewDraft).toEqual(draft);
	});
	it('saves and reopens an evidence-free authored event cue through the scene revision owner', async () => {
		const objectId = '55555555-5555-4555-8555-555555555555';
		const cue = {
			cueId: '66666666-6666-4666-8666-666666666666', eventId: '77777777-7777-4777-8777-777777777777',
			clockId: 'SCENE-RELATIVE-01', timeBasis: 'SCENE_RELATIVE' as const, startMs: 1_000, endMs: 5_000,
			uncertaintyMs: 0, visualizationStatus: 'UNREVIEWED_ILLUSTRATION' as const, source: { kind: 'AUTHORING' as const },
			targets: [{ objectId, role: 'PROP' as const }], action: { type: 'visible_during_interval' as const, visible: true }
		};
		const object = { objectId, parentObjectId: null, name: 'Bonfire visual', kind: 'MESH' as const, assetSha256: null,
			transform: { translation: [0, 0, 0] as [number, number, number], rotationXyzw: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] }, geometry: null };
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0,
			manifest: manifest({ objects: [object], sceneTimelineCues: [cue] }) });
		let stored: Record<string, unknown> | undefined;
		const select = vi.fn()
			.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
			.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) });
		const tx = {
			execute: vi.fn().mockResolvedValue({ rows: [] }), select,
			insert: () => ({ values: (row: Record<string, unknown>) => ({ returning: async () => { stored = row; return [row]; } }) })
		};
		const transaction = async (run: (transaction: unknown) => unknown) => run(tx);
		const receipt = await appendSceneDocumentRevisionV1({ caseId, sceneId, command, actorId: 7 }, { transaction } as never);
		expect(select).toHaveBeenCalledTimes(2); // replay and revision head only; no evidence lookup
		expect(receipt.manifest.sceneTimelineCues).toEqual([cue]);
		expect(receipt.manifest.evidenceBindings).toEqual([]);
		const reopened = await readSceneDocumentRevisionV1({ caseId, sceneId }, {
			select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => stored ? [stored] : [] }) }) }) })
		} as never);
		expect(reopened?.manifestSha256).toBe(receipt.manifestSha256);
		expect(reopened?.manifest.sceneTimelineCues).toEqual([cue]);
	});

	it('re-derives still-image cells and mask digests against the exact case packet', () => {
		const { row, chapter } = imageChapterFixture();
		expect(chapter.citations).toEqual([
			expect.objectContaining({ kind: 'detection', imageCell: { column: 4, row: 2 } }),
			expect.objectContaining({ kind: 'segmentation_mask', imageCell: { column: 4, row: 2 }, artifactSha256: `sha256:${'b'.repeat(64)}` }),
			expect.objectContaining({ kind: 'scene_context', reviewState: 'UNREVIEWED_PROPOSAL' }),
		]);
		expect(matchesReviewedImageChapterV1(caseId, chapter, row)).toBe(true);
		expect(matchesReviewedImageChapterV1(sceneId, chapter, row)).toBe(false);
		expect(matchesReviewedImageChapterV1(caseId, chapter, { ...row, analysis_revision: 'new-run' })).toBe(false);
		const citations = chapter.citations.map((item) => item.kind === 'segmentation_mask' ? { ...item, imageCell: { column: 1, row: 1 } } : item);
		expect(matchesReviewedImageChapterV1(caseId, { ...chapter, citations }, row)).toBe(false);
	});

	it('saves reviewed mask contours as source-pixel polygons and re-derives them on reopen', () => {
		const { row } = imageChapterFixture();
		const observations = parseWholeImageAnalysisRowV1(row, evidenceId, sourceRevision)!.storybook!.manifest;
		const scope = { evidenceId, sourceRevision, analysisRevision: observations.analysisRevision, observationRevision: observations.observationRevision };
		const mask = observations.masks[0]!;
		const reviews = [{ observationId: mask.observationId, versionId: commandId, decision: 'ACCEPTED' as const }];
		const prefill = buildStorybookImagePrefillV1({ status: 'CURRENT', caseId, ...scope, storybook: { ...observations, reviews } }, caseId, scope)!;
		const contours = [{ maskObservationId: mask.observationId, artifactSha256: mask.artifactSha256,
			coordinateSpace: 'ORIGINAL_IMAGE_PIXELS' as const, reviewState: 'HUMAN_ACCEPTED_2D' as const,
			polygons: [{ outer: [[10, 10], [30, 10], [30, 30], [10, 30]] as [number, number][], holes: [[[15, 15], [15, 20], [20, 20], [20, 15]]] as [number, number][][] }] }];
		const reviewed = buildReviewedImageStorybookChapterV1({ ...observations, reviews }, { chapterId: commandId,
			prefillSha256: prefill.prefillSha256, title: 'Reviewed contour', beats: [{ what: 'Review the chair mask.', how: 'Keep its image-space outline.', observationIds: [observations.detections[0]!.observationId] }] }, [], undefined, contours);
		expect(reviewed?.citations.at(-1)).toMatchObject({ kind: 'segmentation_mask', observationId: mask.observationId,
			artifactSha256: mask.artifactSha256 });
		expect(reviewed?.maskPolygons).toEqual(contours);
		expect(matchesReviewedImageChapterV1(caseId, reviewed!, row, reviews)).toBe(true);
		expect(matchesReviewedImageChapterV1(caseId, reviewed!, row, [])).toBe(false);
		expect(matchesReviewedImageChapterV1(caseId, { ...reviewed!, maskPolygons: contours.map((item) => ({ ...item,
			artifactSha256: `sha256:${'c'.repeat(64)}` })) }, row, reviews)).toBe(false);
	});

	it('saves a still-image chapter under the source lock and preserves its pinned revision through analysis replacement', async () => {
		const { chapter, evidenceRow, row } = imageChapterFixture();
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0,
			manifest: manifest({ evidenceBindings: [{ evidenceId, sourceRevision }], imageStorybookChapters: [chapter] }) });
		const save = async (imageRow: unknown) => {
			const trace: string[] = [];
			const select = vi.fn().mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
				.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })
				.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ for: async (mode: string) => {
					trace.push(`locked:${mode}`);
					return [evidenceRow];
				} }) }) }) });
			let stored: unknown;
			const execute = vi.fn().mockResolvedValueOnce({ rows: [] }).mockImplementationOnce(async () => {
				trace.push('current image');
				return { rows: [imageRow] };
			}).mockImplementationOnce(async () => {
				trace.push('current image reviews');
				return { rows: [] };
			});
			const transaction = async (fn: (tx: unknown) => unknown) => fn({ execute, select,
				insert: () => ({ values: (value: unknown) => ({ returning: async () => { trace.push('append'); stored = value; return [value]; } }) }) });
			const receipt = await appendSceneDocumentRevisionV1({ caseId, sceneId, command, actorId: 7 }, { transaction } as never);
			return { trace, stored, receipt };
		};
		const changedRow = { ...row, analysis_revision: 'new-run' };
		await expect(save(changedRow)).rejects.toThrow('SCENE_REVISION_IMAGE_CHAPTER_CHANGED');
		const { stored, receipt, trace } = await save(row);
		expect(trace).toEqual(['locked:share', 'current image', 'current image reviews', 'append']);
		expect(receipt.manifest.objects).toEqual([]);
		const reopen = (source: unknown, analysisRow: unknown, chapterId = chapter.chapterId) => {
			const rows = [[stored], [source]];
			return readSavedImageStorybookChapterV1({ caseId, sceneId, revision: receipt.revision, chapterId }, {
				select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.shift() }) }) }),
				execute: vi.fn().mockResolvedValueOnce({ rows: [analysisRow] }).mockResolvedValueOnce({ rows: [] }),
			} as never);
		};
		expect(await reopen(evidenceRow, row)).toMatchObject({ chapter, revision: 1, sourceState: 'CURRENT' });
		expect(await reopen(evidenceRow, changedRow)).toMatchObject({ chapter, revision: 1, sourceState: 'CHANGED' });
		expect(await reopen({ ...evidenceRow, hash: `sha256:${'c'.repeat(64)}` }, row)).toMatchObject({ chapter, sourceState: 'CHANGED' });
		expect(await reopen(evidenceRow, row, evidenceId)).toBeNull();
	});

	it('re-derives a reviewed chapter from its cited observations and rejects forged cells', () => {
		const { chapter, binding, videoAnalysis, evidenceRow } = chapterFixture();
		expect(chapter.citations).toEqual(expect.arrayContaining([
			expect.objectContaining({ kind: 'transcript_segment', segmentIndex: 0 }),
			expect.objectContaining({ kind: 'frame_ocr', frameIndex: 0, timestampMs: 1270 }),
			expect.objectContaining({ kind: 'frame_detection', label: 'backpack', imageCell: { column: 4, row: 2 } }),
		]));
		expect(JSON.stringify(chapter)).not.toContain('Fixture transcript excerpt');
		const command = (candidate: unknown) => sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0,
			manifest: manifest({ evidenceBindings: [{ evidenceId, sourceRevision }], videoEventBindings: [candidate] }) });
		const validate = (candidate: unknown) => validateSceneVideoEventBindingsV1({ caseId, manifest: command(candidate).manifest, evidenceRows: [evidenceRow] });
		expect(() => validate(binding)).not.toThrow();
		const altered = chapter.citations.map((citation) => citation.kind === 'frame_detection' ? { ...citation, imageCell: { column: 0, row: 0 } } : citation);
		expect(() => validate({ ...binding, chapter: { ...chapter, citations: altered } })).toThrow('SCENE_REVISION_STORYBOOK_CHAPTER_CHANGED');
		const changedVideo = { ...videoAnalysis, frames: [] };
		const partial = buildReviewedVideoStorybookChapterV1({ caseId, evidenceId, sourceRevision, videoAnalysis: changedVideo, eventId: binding.eventId });
		expect(partial?.chapter.unresolvedReferenceIds).toHaveLength(2);
		expect(partial?.chapter.citations.map((citation) => citation.kind)).toEqual(['transcript_segment']);
	});

	it('appends the chapter under the source lock and reopens its pinned revision after source replacement', async () => {
		const { chapter, binding, evidenceRow, videoAnalysis } = chapterFixture();
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0,
			manifest: manifest({ evidenceBindings: [{ evidenceId, sourceRevision }], videoEventBindings: [binding] }) });
		let stored: unknown;
		const lockedRead = vi.fn(async () => [evidenceRow]);
		const select = vi.fn().mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
			.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })
			.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ for: lockedRead }) }) }) });
		const transaction = async (fn: (tx: unknown) => unknown) => fn({ execute: async () => {}, select,
			insert: () => ({ values: (row: unknown) => ({ returning: async () => { stored = row; return [row]; } }) }) });
		const receipt = await appendSceneDocumentRevisionV1({ caseId, sceneId, command, actorId: 7 }, { transaction } as never);
		expect(lockedRead).toHaveBeenCalledWith('share');
		expect(receipt.revision).toBe(1);
		const reopen = (source: unknown) => {
			const rows = [[stored], [source]];
			return readSavedStorybookChapterV1({ caseId, sceneId, revision: receipt.revision, eventId: binding.eventId },
				{ select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.shift() }) }) }) } as never);
		};
		expect(await reopen(evidenceRow)).toMatchObject({ sourceState: 'CURRENT', revision: 1, chapter });
		expect(await reopen({ ...evidenceRow, hash: `sha256:${'d'.repeat(64)}` })).toMatchObject({ sourceState: 'CHANGED', revision: 1, chapter });
		expect(await reopen({ ...evidenceRow, aiAnalysis: { videoAnalysis: { ...videoAnalysis, analysisRevision: 'next-run' } } }))
			.toMatchObject({ sourceState: 'CHANGED', revision: 1, chapter });
	});

	it('preserves separate frame references when two exhibits have matching image cells', () => {
		const otherId = '55555555-5555-4555-8555-555555555555';
		const sources = [chapterFixture(), chapterFixture(otherId)];
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0, manifest: manifest({
			evidenceBindings: [evidenceId, otherId].map((id) => ({ evidenceId: id, sourceRevision })),
			videoEventBindings: sources.map(({ binding }) => binding),
		}) });
		validateSceneVideoEventBindingsV1({ caseId, manifest: command.manifest, evidenceRows: sources.map(({ evidenceRow }) => evidenceRow) });
		const observations = sources.map(({ chapter }) => chapter.citations.find(({ kind }) => kind === 'frame_detection'));
		expect(observations[0]).toMatchObject({ imageCell: { column: 4, row: 2 } });
		expect(observations[1]).toMatchObject({ imageCell: { column: 4, row: 2 } });
		expect(observations[0]?.referenceId).not.toBe(observations[1]?.referenceId);
		expect(command.manifest.objects).toEqual([]);
	});

	it('accepts a case-scoped hypothesis at expectedRevision + 1', () => {
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0, manifest: manifest() });
		const result = validateSceneRevisionBindingV1({ caseId, sceneId, command });
		expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(result.manifest.revision).toBe(1);
	});

	it('requires an event link for newly appended animation clips but preserves legacy clips', () => {
		const legacyClip = '55555555-5555-4555-8555-555555555555';
		const addedClip = '66666666-6666-4666-8666-666666666666';
		const previousManifest = manifest({ sceneAnimationBindings: [{ clipId: legacyClip }] }) as never;
		const nextWithoutEvent = manifest({ sceneAnimationBindings: [{ clipId: legacyClip }, { clipId: addedClip }] }) as never;
		expect(() => validateNewSceneAnimationEventBindingsV1({ previousManifest, manifest: nextWithoutEvent })).toThrow('SCENE_REVISION_NEW_ANIMATION_EVENT_REQUIRED');
		const nextWithEvent = manifest({ sceneAnimationBindings: [{ clipId: legacyClip }, { clipId: addedClip, eventId: commandId }] }) as never;
		expect(() => validateNewSceneAnimationEventBindingsV1({ previousManifest, manifest: nextWithEvent })).not.toThrow();
		const firstRevision = manifest({ sceneAnimationBindings: [{ clipId: addedClip, eventId: commandId }] }) as never;
		expect(() => validateNewSceneAnimationEventBindingsV1({ previousManifest: null, manifest: firstRevision })).not.toThrow();
	});

	it('rejects fixture, client-asserted measured state, and unverified source assets', () => {
		const bind = (value: ReturnType<typeof sceneRevisionCommandV1Schema.parse>) => validateSceneRevisionBindingV1({ caseId, sceneId, command: value });
		const command = (value: unknown) => sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0, manifest: value });
		expect(() => bind(command(manifest({ status: 'FIXTURE' })))).toThrow('SCENE_REVISION_FIXTURE_NOT_ADMISSIBLE');
		expect(() => bind(command(manifest({ status: 'MEASURED' })))).toThrow('SCENE_REVISION_MEASURED_STATUS_NOT_ADMISSIBLE');
		expect(() => bind(command(manifest({ assets: [{ assetId: '44444444-4444-4444-8444-444444444444', format: 'GLB', sha256: 'a'.repeat(64), bytes: 1, role: 'SOURCE' }] })))).toThrow('SCENE_REVISION_SOURCE_ASSET_NOT_VERIFIED');
	});

	it('rejects case, scene, and revision scope mismatch', () => {
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0, manifest: manifest({ caseId: '55555555-5555-4555-8555-555555555555' }) });
		expect(() => validateSceneRevisionBindingV1({ caseId, sceneId, command })).toThrow('SCENE_REVISION_SCOPE_MISMATCH');
		const wrongRevision = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 1, manifest: manifest() });
		expect(() => validateSceneRevisionBindingV1({ caseId, sceneId, command: wrongRevision })).toThrow('SCENE_REVISION_NUMBER_MISMATCH');
	});

	it('hashes canonical manifest content independent of object key order', () => {
		const first = manifest();
		const second = Object.fromEntries(Object.entries(first).reverse());
		expect(hashSceneDocumentV1(first as never)).toBe(hashSceneDocumentV1(second as never));
	});

	it('accepts a revision readback only when scope, parent, revision, and canonical digest agree', () => {
		const savedManifest = manifest();
		const row = {
			caseId,
			sceneId,
			revision: 1,
			parentManifestSha256: null,
			manifestSha256: hashSceneDocumentV1(savedManifest as never),
			manifest: savedManifest
		};
		expect(verifySceneDocumentRevisionReadbackV1({ caseId, sceneId, row }).manifest).toMatchObject({ caseId, sceneId, revision: 1 });
		expect(() => verifySceneDocumentRevisionReadbackV1({ caseId, sceneId, row: { ...row, manifest: manifest({ createdAt: '2026-11-05T12:00:01.000Z' }) } as never }))
			.toThrow('SCENE_REVISION_READBACK_INTEGRITY_MISMATCH');
		expect(() => verifySceneDocumentRevisionReadbackV1({ caseId, sceneId, row: { ...row, caseId: '55555555-5555-4555-8555-555555555555' } as never }))
			.toThrow('SCENE_REVISION_READBACK_INTEGRITY_MISMATCH');
		expect(() => verifySceneDocumentRevisionReadbackV1({ caseId, sceneId, row: { ...row, revision: 2 } as never }))
			.toThrow('SCENE_REVISION_READBACK_INTEGRITY_MISMATCH');
		expect(() => verifySceneDocumentRevisionReadbackV1({ caseId, sceneId, row: { ...row, parentManifestSha256: 'b'.repeat(64) } as never }))
			.toThrow('SCENE_REVISION_READBACK_INTEGRITY_MISMATCH');
	});

	it('requires each scene evidence source to match a canonical row, case, and pinned renderer revisions', () => {
		const evidenceSources = [{ evidenceId, sourceRevision, format: 'SPZ', coordinateSystem: 'RUB', decoderRevision: SPZ_DECODER_REVISION_V1, representationRevision: SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 }];
		const base = { caseId, manifest: manifest({ evidenceSources }), evidenceRows: [{ id: evidenceId, caseId, hash: sourceRevision }] };
		expect(() => validateSceneEvidenceSourceBindingsV1(base as never)).not.toThrow();
		expect(() => validateSceneEvidenceSourceBindingsV1({ ...base, evidenceRows: [] } as never)).toThrow('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
		expect(() => validateSceneEvidenceSourceBindingsV1({ ...base, evidenceRows: [{ id: evidenceId, caseId: '55555555-5555-4555-8555-555555555555', hash: sourceRevision }] } as never)).toThrow('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
		expect(() => validateSceneEvidenceSourceBindingsV1({ ...base, evidenceRows: [{ id: evidenceId, caseId, hash: `sha256:${'c'.repeat(64)}` }] } as never)).toThrow('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
		const unsupported = [{ ...evidenceSources[0], decoderRevision: 'untrusted-v0' }];
		expect(() => validateSceneEvidenceSourceBindingsV1({ ...base, manifest: manifest({ evidenceSources: unsupported }) } as never)).toThrow('SCENE_REVISION_EVIDENCE_SOURCE_REVISION_UNSUPPORTED');
	});

	it('admits a general scene-to-exhibit binding only when the canonical case row has the same source hash', () => {
		const binding = { evidenceId, sourceRevision };
		const base = { caseId, manifest: manifest({ evidenceBindings: [binding] }), evidenceRows: [{ id: evidenceId, caseId, hash: sourceRevision.slice('sha256:'.length) }] };
		expect(() => validateSceneEvidenceSourceBindingsV1(base as never)).not.toThrow();
		expect(() => validateSceneEvidenceSourceBindingsV1({ ...base, evidenceRows: [{ id: evidenceId, caseId, hash: `sha256:${'b'.repeat(64)}` }] } as never)).toThrow('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
		expect(() => validateSceneEvidenceSourceBindingsV1({ ...base, evidenceRows: [{ id: evidenceId, caseId: '55555555-5555-4555-8555-555555555555', hash: sourceRevision }] } as never)).toThrow('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
	});

	it('admits only the exact currently approved source-time event from the canonical evidence row', () => {
		const analysisRevision = 'video-analysis-v1:scene-event-test';
		const proposed = fuseVideoEventsV1({
			evidenceId, caseId, transcriptId: commandId, sourceRevision, analysisRevision,
			frames: [], transcriptSegments: [{ segmentIndex: 0, startMs: 1200, endMs: 1800, text: 'Door opens.' }]
		});
		const event = proposed.events[0]!;
		const approvedTimeline = {
			...proposed,
			events: [{ ...event, reviewStatus: 'APPROVED' as const, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' as const, reviewedBy: 7, reviewedAt: '2026-11-16T20:00:00.000Z' }]
		};
		const videoEventBindings = [{
			evidenceId, sourceRevision, analysisRevision, eventId: event.eventId,
			startMs: event.startMs, endMs: event.endMs, reviewState: 'APPROVED_FOR_SCENE_PROPOSAL' as const
		}];
		const sceneManifest = sceneRevisionCommandV1Schema.parse({
			commandId, expectedRevision: 0,
			manifest: manifest({ evidenceBindings: [{ evidenceId, sourceRevision }], videoEventBindings })
		}).manifest;
		const evidenceRows = [{ id: evidenceId, caseId, hash: sourceRevision, aiAnalysis: { videoAnalysis: { eventTimeline: approvedTimeline } } }];
		expect(() => validateSceneVideoEventBindingsV1({ caseId, manifest: sceneManifest, evidenceRows })).not.toThrow();
		expect(() => validateSceneVideoEventBindingsV1({
			caseId, manifest: sceneManifest, evidenceRows: [{ ...evidenceRows[0], aiAnalysis: { videoAnalysis: { eventTimeline: proposed } } }]
		})).toThrow('SCENE_REVISION_VIDEO_EVENT_NOT_ADMITTED');
		expect(() => validateSceneVideoEventBindingsV1({
			caseId, manifest: sceneRevisionCommandV1Schema.parse({
				commandId, expectedRevision: 0,
				manifest: manifest({ evidenceBindings: [{ evidenceId, sourceRevision }], videoEventBindings: [{ ...videoEventBindings[0], analysisRevision: 'stale-run' }] })
			}).manifest, evidenceRows
		})).toThrow('SCENE_REVISION_VIDEO_EVENT_NOT_ADMITTED');
		expect(() => validateSceneVideoEventBindingsV1({
			caseId, manifest: sceneManifest, evidenceRows: [{ ...evidenceRows[0], caseId: '55555555-5555-4555-8555-555555555555' }]
		})).toThrow('SCENE_REVISION_VIDEO_EVENT_SOURCE_NOT_REGISTERED');
	});

	it('admits calibration only when its source revision is registered to the same canonical case evidence row', () => {
		const anchors: CalibrationAnchor[] = [
			{ id: 'a', splat: [0, 0, 0], worldM: [4, 1, -3] },
			{ id: 'b', splat: [1, 0, 0], worldM: [4 + 2.5 * Math.cos(0.7), 1, -3 - 2.5 * Math.sin(0.7)] },
			{ id: 'c', splat: [0, 1, 0], worldM: [4, 3.5, -3] }
		];
		const calibration = createSceneCalibrationV1({ sourceSha256: 'a'.repeat(64), anchors, toleranceM: 0.02 });
		const evidenceSources = [{ evidenceId, sourceRevision, format: 'SPZ', coordinateSystem: 'RUB', decoderRevision: SPZ_DECODER_REVISION_V1, representationRevision: SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 }];
		const candidate = manifest({ coordinateFrame: 'GLTF_Y_UP_METERS', evidenceSources, calibration });
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0, manifest: candidate });
		const binding = validateSceneRevisionBindingV1({ caseId, sceneId, command });
		expect(binding.manifest.calibration?.sourceSha256).toBe('a'.repeat(64));
		expect(() => validateSceneEvidenceSourceBindingsV1({ caseId, manifest: binding.manifest, evidenceRows: [{ id: evidenceId, caseId, hash: `sha256:${'b'.repeat(64)}` }] })).toThrow('SCENE_REVISION_EVIDENCE_SOURCE_NOT_REGISTERED');
		expect(() => validateSceneEvidenceSourceBindingsV1({ caseId, manifest: binding.manifest, evidenceRows: [{ id: evidenceId, caseId, hash: sourceRevision }] })).not.toThrow();
	});

	it('admits only an exact reviewer-approved ground-plane track from canonical evidence revision history', async () => {
		const calibration = createPlanarCameraCalibrationV1({
			evidenceId, sourceRevision, analysisRevision: 'run-ground-track', calibrationFrameIndex: 0,
			calibrationFramePtsUs: 0, frameWidth: 640, frameHeight: 480, operatorConfirmedFixedCamera: true,
			fitAnchors: [
				{ id: 'a', imagePx: [0, 0], planeM: [0, 0] }, { id: 'b', imagePx: [640, 0], planeM: [6.4, 0] },
				{ id: 'c', imagePx: [640, 480], planeM: [6.4, 4.8] }, { id: 'd', imagePx: [0, 480], planeM: [0, 4.8] }
			],
			validationAnchors: [
				{ id: 'v1', imagePx: [160, 120], planeM: [1.6, 1.2] }, { id: 'v2', imagePx: [480, 120], planeM: [4.8, 1.2] },
				{ id: 'v3', imagePx: [480, 360], planeM: [4.8, 3.6] }, { id: 'v4', imagePx: [160, 360], planeM: [1.6, 3.6] }
			], toleranceMeters: 0.001
		});
		const annotationRevisionId = '66666666-6666-4666-8666-666666666666';
		const calibrationSha256 = `sha256:${createHash('sha256').update(JSON.stringify(calibration), 'utf8').digest('hex')}`;
		const poses = [0, 1].map((index) => ({
			schema: 'atlas.pose-observation.v1', evidenceId, sourceSha256: sourceRevision, sourceRevision,
			analysisRevision: 'run-ground-track', framePtsUs: (index + 1) * 1_000_000, frameIndex: (index + 1) * 30,
			frameWidth: 640, frameHeight: 480, skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId,
			trackId: 'track-ground-1', trackScopeId: 'scope-run-ground-track', origin: 'manual', modelRevision: null,
			reviewState: 'UNREVIEWED', keypoints: humanCoco17PoseSchemaV1.joints.map(({ index: jointIndex }) => ({
				index: jointIndex, x: null, y: null, confidence: 0, visibility: 'not_labeled'
			})),
			groundContact: { imagePx: [100 + index * 100, 400], footSide: 'left', label: 'operator-marked-ground-contact-candidate' }
		}));
		const versionRows = [
			{ id: '77777777-7777-4777-8777-777777777777', evidenceId, version: 4, metadata: {
				schema: 'atlas.planar-camera-calibration-review.v1', evidenceId, caseId, sourceSha256: sourceRevision,
				analysisRevision: 'run-ground-track', annotationRevisionId, calibrationSha256, calibrationFrameIndex: 0,
				calibrationFramePtsUs: 0, decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', cameraFixedWindow: { startPtsUs: 0, endPtsUs: 10_000_000 },
				sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false
			} },
			...poses.map((pose, index) => ({ id: `pose-review-${index}`, evidenceId, version: 3 - index, metadata: {
				schema: 'atlas.pose-review-decision.v1', evidenceId, caseId, sourceSha256: sourceRevision,
				analysisRevision: 'run-ground-track', annotationRevisionId, framePtsUs: pose.framePtsUs,
				skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId, trackId: pose.trackId, trackScopeId: pose.trackScopeId,
				decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false,
				groundContactReviewed: true, groundContactDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL'
			} })),
			{ id: annotationRevisionId, evidenceId, version: 2, metadata: {
				schema: 'atlas.evidence-annotation-revision.v1', parentSha256: sourceRevision,
				annotation: { poseObservations: poses, planarCameraCalibrations: [calibration] }
			} }
		];
		const derived = await deriveReviewedGroundPlaneTrackFromHistoryV1({
			history: { versions: versionRows }, evidenceId, caseId, sourceRevision, analysisRevision: 'run-ground-track'
		});
		const proposal = {
			proposalId: '88888888-8888-4888-8888-888888888888', evidenceId, sourceRevision,
			analysisRevision: 'run-ground-track', calibrationRevisionId: annotationRevisionId,
			trackId: 'track-ground-1', trackScopeId: 'scope-run-ground-track',
			status: 'REVIEWED_GROUND_PLANE_PROPOSAL' as const,
			semantics: 'image_to_measured_plane_only_no_height_or_camera_motion_compensation' as const,
			points: derived.map((point) => ({ frameIndex: point.frameIndex, framePtsUs: point.framePtsUs,
				imagePx: point.imagePx, planeM: point.planeM, poseAnnotationRevisionId: point.poseAnnotationRevisionId, status: point.status }))
		};
		const sceneManifest = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0,
			manifest: manifest({ evidenceBindings: [{ evidenceId, sourceRevision }], groundPlaneTrackProposals: [proposal] }) }).manifest;
		const evidenceRows = [{ id: evidenceId, caseId, hash: sourceRevision,
			aiAnalysis: { videoAnalysis: { sourceRevision, analysisRevision: 'run-ground-track' } } }];
		await expect(validateSceneGroundPlaneTrackProposalsV1({ caseId, manifest: sceneManifest, evidenceRows, versionRows })).resolves.toBeUndefined();
		const newerPose = { ...poses[1]!, frameIndex: 90, framePtsUs: 3_000_000 };
		const newerPoseRevisionId = '99999999-9999-4999-8999-999999999999';
		const priorReview = versionRows[1]!;
		const extendedHistory = [
			{ ...priorReview, id: 'new-review', version: 6, metadata: { ...priorReview.metadata, annotationRevisionId: newerPoseRevisionId, framePtsUs: newerPose.framePtsUs } },
			{ id: newerPoseRevisionId, evidenceId, version: 5, metadata: {
				schema: 'atlas.evidence-annotation-revision.v1', parentSha256: sourceRevision, annotation: { poseObservations: [newerPose] },
			} },
			...versionRows,
		];
		await expect(validateSceneGroundPlaneTrackProposalsV1({ caseId, manifest: sceneManifest, evidenceRows, versionRows: extendedHistory })).resolves.toBeUndefined();
		await expect(validateSceneGroundPlaneTrackProposalsV1({ caseId, manifest: sceneManifest, versionRows: extendedHistory,
			evidenceRows: [{ ...evidenceRows[0]!, aiAnalysis: { videoAnalysis: { sourceRevision, analysisRevision: 'another-run' } } }],
		})).rejects.toThrow('SCENE_REVISION_GROUND_TRACK_ANALYSIS_CHANGED');
		const rejectedHistory = [{ ...priorReview, id: 'revoked-review', version: 7,
			metadata: { ...priorReview.metadata, decision: 'REJECTED', sceneAdmission: 'NOT_ADMITTED', groundContactDecision: 'REJECTED' } }, ...extendedHistory];
		await expect(validateSceneGroundPlaneTrackProposalsV1({ caseId, manifest: sceneManifest, evidenceRows, versionRows: rejectedHistory }))
			.rejects.toThrow('SCENE_REVISION_GROUND_TRACK_NOT_ADMITTED');
		await expect(validateSceneGroundPlaneTrackProposalsV1({ caseId, manifest: sceneManifest, evidenceRows: [{ ...evidenceRows[0], caseId: sceneId }], versionRows })).rejects.toThrow('SCENE_REVISION_GROUND_TRACK_SOURCE_NOT_REGISTERED');
		const tamperedManifest = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0,
			manifest: manifest({ evidenceBindings: [{ evidenceId, sourceRevision }], groundPlaneTrackProposals: [{ ...proposal, points: proposal.points.map((point, index) => index ? point : { ...point, planeM: [99, 99] }) }] }) }).manifest;
		await expect(validateSceneGroundPlaneTrackProposalsV1({ caseId, manifest: tamperedManifest, evidenceRows, versionRows })).rejects.toThrow('SCENE_REVISION_GROUND_TRACK_NOT_ADMITTED');
	});
});
