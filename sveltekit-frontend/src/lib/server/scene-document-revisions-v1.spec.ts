import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sceneRevisionCommandV1Schema, validateSceneRevisionBindingV1, validateSceneEvidenceSourceBindingsV1, validateSceneVideoEventBindingsV1, validateSceneGroundPlaneTrackProposalsV1, hashSceneDocumentV1, verifySceneDocumentRevisionReadbackV1 } from './scene-document-revisions-v1.js';
import { createSceneCalibrationV1, SPZ_DECODER_REVISION_V1, SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 } from '$lib/splat/scene-document-v1.js';
import type { CalibrationAnchor } from '$lib/splat/calibration.js';
import { fuseVideoEventsV1 } from '$lib/server/features/evidence/video/video-event-fusion-v1.js';
import { createPlanarCameraCalibrationV1 } from '$lib/splat/planar-camera-calibration-v1.js';
import { deriveReviewedGroundPlaneTrackFromHistoryV1 } from '$lib/splat/reviewed-ground-plane-track-v1.js';
import { humanCoco17PoseSchemaV1 } from '$lib/shared/pose-skeleton-schema-v1.js';

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

describe('scene document revision v1 admission', () => {
	it('accepts a case-scoped hypothesis at expectedRevision + 1', () => {
		const command = sceneRevisionCommandV1Schema.parse({ commandId, expectedRevision: 0, manifest: manifest() });
		const result = validateSceneRevisionBindingV1({ caseId, sceneId, command });
		expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(result.manifest.revision).toBe(1);
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
