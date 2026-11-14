import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { digestSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import type { EvidenceVisualAnalysisV1 } from './evidence-visual-analysis-v1.js';
import {
	processEvidenceImageCanonicalV1,
	type CanonicalImageAnalysisDependenciesV1,
} from './process-evidence-image-canonical-v1.js';

function sourceRevision(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));
const outputSha256 = digestSemantic768OutputV1(Float32Array.from(vector));

describe('processEvidenceImageCanonicalV1', () => {
	let dependencies: CanonicalImageAnalysisDependenciesV1;
	let bytes: Buffer;
	let sourceSha256: string;
	const analysis = {
		schema: 'atlas.evidence-visual-analysis.v1',
		authority: 'OBSERVATION_ONLY',
		sourceRevision: '',
		status: 'PARTIAL',
		objectDetections: [{ class: 'person', confidence: 0.7, bbox: [0.1, 0.2, 0.6, 0.8] }],
		layoutRegions: [],
		visionSummary: null,
		visionFindings: [],
		visionTags: [],
		depthMap: null,
		stageErrors: ['vision:offline'],
	} as unknown as EvidenceVisualAnalysisV1;

	beforeEach(async () => {
		bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#b48a52' } }).png().toBuffer();
		sourceSha256 = sourceRevision(bytes);
		dependencies = {
			modelDir: 'fixture-model-dir',
			analyze: vi.fn(async () => ({ ...analysis, sourceRevision: sourceSha256 })),
			embed: vi.fn(async () => ({
				embedding: vector,
				model: 'onnx-community/embeddinggemma-2-ONNX@fixture:q8',
				modelArtifactSha256: `sha256:${'b'.repeat(64)}`,
				modelRevision: 'fixture-model-revision',
				preprocessingRevision: 'fixture-preprocess-v1',
				inputSha256: sourceSha256,
				outputSha256,
				width: 8,
				height: 6,
			})),
			persist: vi.fn(async () => ({
				id: '00000000-0000-4000-8000-000000000003',
				qdrantPointId: '00000000-0000-4000-8000-000000000004',
				outputSha256,
				sourceLocatorSha256: 'c'.repeat(64),
			})) as unknown as CanonicalImageAnalysisDependenciesV1['persist'],
		};
	});

	it('validates the admitted image, analyzes it, and persists a source-bound 768-D vector plus proposal metadata', async () => {
		const result = await processEvidenceImageCanonicalV1({
			evidenceId: '00000000-0000-4000-8000-000000000001',
			caseId: '00000000-0000-4000-8000-000000000002',
			sourceRevision: sourceSha256,
			contentType: 'image/png',
			fileName: 'fixture.png',
			bytes,
		}, dependencies);

		expect(result).toMatchObject({
			chunkCount: 1,
			persistedCount: 1,
			sourceRevision: sourceSha256,
			representationId: 'evidence_multimodal_semantic_768',
			canonicalStore: 'postgresql.evidence_multimodal_vectors',
		});
		expect(dependencies.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			modality: 'image',
			sourceRevision: sourceSha256,
			sourceLocator: expect.objectContaining({
				kind: 'whole_image',
				coordinateSpace: 'original_pixels',
				width: 8,
				height: 6,
			}),
			metadata: expect.objectContaining({
				modelOutputReviewState: 'UNREVIEWED_PROPOSAL',
				visualAnalysis: expect.objectContaining({ authority: 'OBSERVATION_ONLY' }),
			}),
		}));
	});

	it('rejects source-hash mismatches before model execution', async () => {
		await expect(processEvidenceImageCanonicalV1({
			evidenceId: '00000000-0000-4000-8000-000000000001',
			caseId: '00000000-0000-4000-8000-000000000002',
			sourceRevision: `sha256:${'0'.repeat(64)}`,
			contentType: 'image/png',
			fileName: 'fixture.png',
			bytes,
		}, dependencies)).rejects.toThrow('EVIDENCE_IMAGE_SOURCE_REVISION_MISMATCH');
		expect(dependencies.analyze).not.toHaveBeenCalled();
		expect(dependencies.embed).not.toHaveBeenCalled();
		expect(dependencies.persist).not.toHaveBeenCalled();
	});

	it('rejects MIME-signature disagreement before inference', async () => {
		await expect(processEvidenceImageCanonicalV1({
			evidenceId: '00000000-0000-4000-8000-000000000001',
			caseId: '00000000-0000-4000-8000-000000000002',
			sourceRevision: sourceSha256,
			contentType: 'image/jpeg',
			fileName: 'fixture.jpg',
			bytes,
		}, dependencies)).rejects.toThrow('EVIDENCE_IMAGE_SIGNATURE_OR_DIMENSIONS_INVALID');
		expect(dependencies.embed).not.toHaveBeenCalled();
	});
});
