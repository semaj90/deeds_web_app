import { describe, expect, it } from 'vitest';
import { sceneRevisionCommandV1Schema, validateSceneRevisionBindingV1, validateSceneEvidenceSourceBindingsV1, hashSceneDocumentV1, verifySceneDocumentRevisionReadbackV1 } from './scene-document-revisions-v1.js';
import { createSceneCalibrationV1, SPZ_DECODER_REVISION_V1, SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 } from '$lib/splat/scene-document-v1.js';
import type { CalibrationAnchor } from '$lib/splat/calibration.js';

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
});
