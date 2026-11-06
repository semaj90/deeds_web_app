import { sceneDocumentV1Schema, SPZ_DECODER_REVISION_V1, SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 } from '$lib/splat/scene-document-v1.js';
import { SPZ_DEFAULT_MAX_DECODED_BYTES, SPZ_DEFAULT_MAX_SOURCE_BYTES } from '$lib/splat/spz-loader.js';
import { SPZ_EVIDENCE_SOURCE_MAX_POINTS } from './evidence-source-v1.js';

export type SceneAdmissionErrorCode =
	| 'SCENE_ADMISSION_SCOPE_MISMATCH'
	| 'SCENE_ADMISSION_SOURCE_REVISION_MISMATCH'
	| 'SCENE_ADMISSION_SOURCE_TOO_LARGE'
	| 'SCENE_ADMISSION_DECODED_TOO_LARGE'
	| 'SCENE_ADMISSION_POINT_LIMIT'
	| 'SCENE_ADMISSION_MIME_INVALID'
	| 'SCENE_ADMISSION_MANIFEST_BINDING_MISSING'
	| 'SCENE_ADMISSION_REVISION_UNSUPPORTED';

export class SceneAdmissionError extends Error {
	constructor(readonly code: SceneAdmissionErrorCode) {
		super(code);
		this.name = 'SceneAdmissionError';
	}
}

/**
 * Admit a source only after the caller has authenticated the case, read the canonical evidence row,
 * and verified exact SeaweedFS bytes with verifySpzEvidenceSourceV1. A client manifest is never authority.
 */
export function admitSpzSceneV1(input: {
	caseId: string;
	sceneId: string;
	revision: number;
	manifest: unknown;
	source: {
		caseId: string;
		evidenceId: string;
		sourceRevision: string;
		sourceSha256: string;
		mimeType: string | null;
		byteLength: number;
		decodedByteLength: number;
		pointCount: number;
	};
}) {
	const manifest = sceneDocumentV1Schema.parse(input.manifest);
	if (manifest.caseId !== input.caseId || manifest.sceneId !== input.sceneId || manifest.revision !== input.revision || input.source.caseId !== input.caseId) {
		throw new SceneAdmissionError('SCENE_ADMISSION_SCOPE_MISMATCH');
	}
	if (input.source.sourceRevision !== `sha256:${input.source.sourceSha256}`) {
		throw new SceneAdmissionError('SCENE_ADMISSION_SOURCE_REVISION_MISMATCH');
	}
	if (input.source.byteLength < 1 || input.source.byteLength > SPZ_DEFAULT_MAX_SOURCE_BYTES) {
		throw new SceneAdmissionError('SCENE_ADMISSION_SOURCE_TOO_LARGE');
	}
	if (input.source.decodedByteLength < 1 || input.source.decodedByteLength > SPZ_DEFAULT_MAX_DECODED_BYTES) {
		throw new SceneAdmissionError('SCENE_ADMISSION_DECODED_TOO_LARGE');
	}
	if (input.source.pointCount < 1 || input.source.pointCount > SPZ_EVIDENCE_SOURCE_MAX_POINTS) {
		throw new SceneAdmissionError('SCENE_ADMISSION_POINT_LIMIT');
	}
	const mimeType = input.source.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
	if (mimeType && !['model/x-spz', 'application/vnd.spz', 'application/octet-stream'].includes(mimeType)) {
		throw new SceneAdmissionError('SCENE_ADMISSION_MIME_INVALID');
	}
	const binding = manifest.evidenceSources.find((item) => item.evidenceId === input.source.evidenceId);
	if (!binding || binding.sourceRevision !== input.source.sourceRevision || binding.format !== 'SPZ' || binding.coordinateSystem !== 'RUB') {
		throw new SceneAdmissionError('SCENE_ADMISSION_MANIFEST_BINDING_MISSING');
	}
	if (binding.decoderRevision !== SPZ_DECODER_REVISION_V1 || binding.representationRevision !== SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1) {
		throw new SceneAdmissionError('SCENE_ADMISSION_REVISION_UNSUPPORTED');
	}
	return {
		status: 'SCENE_ADMITTED' as const,
		caseId: input.caseId,
		sceneId: input.sceneId,
		sceneRevision: input.revision,
		evidenceId: input.source.evidenceId,
		sourceRevision: input.source.sourceRevision,
		sourceSha256: input.source.sourceSha256,
		byteLength: input.source.byteLength,
		decodedByteLength: input.source.decodedByteLength,
		pointCount: input.source.pointCount,
		coordinateSystem: binding.coordinateSystem,
		decoderRevision: binding.decoderRevision,
		representationRevision: binding.representationRevision
	};
}
