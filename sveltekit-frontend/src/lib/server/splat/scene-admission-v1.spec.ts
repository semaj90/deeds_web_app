import { describe, expect, it } from 'vitest';
import { createSceneQualityReceiptV1, SPZ_DECODER_REVISION_V1, SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 } from '$lib/splat/scene-document-v1.js';
import { admitSpzSceneV1, SceneAdmissionError } from './scene-admission-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const digest = 'a'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'parent-atlas.scene-document.v1', caseId, sceneId, status: 'HYPOTHESIS', revision: 2,
		parentManifestSha256: 'b'.repeat(64), createdAt: '2026-11-05T12:00:00.000Z', coordinateFrame: 'SPZ_RUB',
		objects: [], animations: [], assets: [],
		evidenceSources: [{ evidenceId, sourceRevision: `sha256:${digest}`, format: 'SPZ', coordinateSystem: 'RUB', decoderRevision: SPZ_DECODER_REVISION_V1, representationRevision: SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 }],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 }),
		...overrides
	};
}

const source = (overrides: Record<string, unknown> = {}) => ({
	caseId, evidenceId, sourceRevision: `sha256:${digest}`, sourceSha256: digest,
	mimeType: 'model/x-spz', byteLength: 1024, decodedByteLength: 276, pointCount: 3,
	...overrides
});

describe('SPZ scene admission v1', () => {
	it('admits only exact evidence/source revision membership in the requested case scene revision', () => {
		expect(admitSpzSceneV1({ caseId, sceneId, revision: 2, manifest: manifest(), source: source() })).toMatchObject({
			status: 'SCENE_ADMITTED', caseId, sceneId, sceneRevision: 2, evidenceId,
			sourceRevision: `sha256:${digest}`, sourceSha256: digest,
			decoderRevision: SPZ_DECODER_REVISION_V1, representationRevision: SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1
		});
	});

	it('rejects a source not listed in the immutable scene manifest', () => {
		expect(() => admitSpzSceneV1({ caseId, sceneId, revision: 2, manifest: manifest({ evidenceSources: [] }), source: source() }))
			.toThrowError(new SceneAdmissionError('SCENE_ADMISSION_MANIFEST_BINDING_MISSING'));
	});

	it('rejects a source revision that differs from the exact verified bytes', () => {
		expect(() => admitSpzSceneV1({ caseId, sceneId, revision: 2, manifest: manifest(), source: source({ sourceRevision: `sha256:${'c'.repeat(64)}` }) }))
			.toThrowError(new SceneAdmissionError('SCENE_ADMISSION_SOURCE_REVISION_MISMATCH'));
	});

	it('rejects wrong case or scene revision scope', () => {
		expect(() => admitSpzSceneV1({ caseId, sceneId, revision: 1, manifest: manifest(), source: source() }))
			.toThrowError(new SceneAdmissionError('SCENE_ADMISSION_SCOPE_MISMATCH'));
	});

	it('rejects unsupported decoder revisions even when the source identity matches', () => {
		const oldDecoderManifest = manifest({ evidenceSources: [{ ...(manifest().evidenceSources as object[])[0], decoderRevision: 'unknown-decoder-v0' }] });
		expect(() => admitSpzSceneV1({ caseId, sceneId, revision: 2, manifest: oldDecoderManifest, source: source() }))
			.toThrowError(new SceneAdmissionError('SCENE_ADMISSION_REVISION_UNSUPPORTED'));
	});

	it('rejects source and decoded byte counts outside their caps', () => {
		expect(() => admitSpzSceneV1({ caseId, sceneId, revision: 2, manifest: manifest(), source: source({ byteLength: 64 * 1024 * 1024 + 1 }) }))
			.toThrowError(new SceneAdmissionError('SCENE_ADMISSION_SOURCE_TOO_LARGE'));
		expect(() => admitSpzSceneV1({ caseId, sceneId, revision: 2, manifest: manifest(), source: source({ decodedByteLength: 512 * 1024 * 1024 + 1 }) }))
			.toThrowError(new SceneAdmissionError('SCENE_ADMISSION_DECODED_TOO_LARGE'));
	});
});
