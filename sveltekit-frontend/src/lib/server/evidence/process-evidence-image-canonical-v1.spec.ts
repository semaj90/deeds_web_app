import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { digestSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import { resizeForThumbnail } from '$lib/server/image/resize-for-vlm.js';
import type { EvidenceVisualAnalysisV1 } from './evidence-visual-analysis-v1.js';
import {
	processEvidenceImageCanonicalV1,
	selectEvidenceImageObjectCropsV1,
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
		objectDetections: [{ class: 'person', confidence: 0.7, bbox: [8, 8, 40, 36] }],
		layoutRegions: [],
		visionSummary: null,
		visionFindings: [],
		visionTags: [],
		depthMap: null,
		stageErrors: ['vision:offline'],
	} as unknown as EvidenceVisualAnalysisV1;

	beforeEach(async () => {
		bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#b48a52' } }).png().toBuffer();
		sourceSha256 = sourceRevision(bytes);
		dependencies = {
			modelDir: 'fixture-model-dir',
			thumbnailBucket: 'atlas-artifacts',
			maxObjectCrops: 4,
			deriveObjectCrop: vi.fn(async (source, crop) => sharp(source).extract(crop).jpeg({ quality: 90, mozjpeg: false }).toBuffer()),
			deriveThumbnail: vi.fn(async (source) => resizeForThumbnail(source)),
			storeThumbnail: vi.fn(async () => {}),
			analyze: vi.fn(async () => ({ ...analysis, sourceRevision: sourceSha256 })),
			embed: vi.fn(async ({ buffer }: { buffer: Buffer }) => ({
				embedding: vector,
				model: 'onnx-community/embeddinggemma-2-ONNX@fixture:q8',
				modelArtifactSha256: `sha256:${'b'.repeat(64)}`,
				modelRevision: 'fixture-model-revision',
				preprocessingRevision: 'fixture-preprocess-v1',
				inputSha256: sourceRevision(buffer),
				outputSha256,
				width: 64,
				height: 48,
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
		const ocr = vi.fn(async (_image: Buffer) => ({ text: '  EXIT ONLY  ' }));
		dependencies.ocr = ocr;
		const result = await processEvidenceImageCanonicalV1({
			evidenceId: '00000000-0000-4000-8000-000000000001',
			caseId: '00000000-0000-4000-8000-000000000002',
			sourceRevision: sourceSha256,
			contentType: 'image/png',
			fileName: 'fixture.png',
			bytes,
		}, dependencies);

		expect(result).toMatchObject({
			chunkCount: 2,
			persistedCount: 2,
			objectCropCount: 1,
			sourceRevision: sourceSha256,
			representationId: 'evidence_multimodal_semantic_768',
			canonicalStore: 'postgresql.evidence_multimodal_vectors',
			thumbnail: {
				kind: 'thumbnail',
				sourceRevision: sourceSha256,
				bucket: 'atlas-artifacts',
				mimeType: 'image/jpeg',
				width: 256,
				height: 256,
			},
		});
		expect(result.thumbnail.objectKey).toContain(`/${sourceSha256.slice('sha256:'.length)}/thumbnail-${result.thumbnail.outputSha256}.jpg`);
		expect(dependencies.storeThumbnail).toHaveBeenCalledWith('atlas-artifacts', result.thumbnail.objectKey, expect.any(Buffer));
		expect(dependencies.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			modality: 'image',
			sourceRevision: sourceSha256,
			sourceLocator: expect.objectContaining({
				kind: 'whole_image',
				coordinateSpace: 'original_pixels',
				width: 64,
				height: 48,
			}),
			metadata: expect.objectContaining({
				modelOutputReviewState: 'UNREVIEWED_PROPOSAL',
				visualAnalysis: expect.objectContaining({ authority: 'OBSERVATION_ONLY' }),
				imageDerivatives: { thumbnail: result.thumbnail },
				imageOcr: expect.objectContaining({
					sourceRevision: sourceSha256, engine: 'tesseract', status: 'COMPLETED',
					inputSha256: sourceRevision(ocr.mock.calls[0]![0]), text: 'EXIT ONLY', truncated: false,
				}),
			}),
		}));
		expect(dependencies.deriveObjectCrop).toHaveBeenCalledWith(bytes, { left: 8, top: 8, width: 32, height: 28 });
		expect(dependencies.embed).toHaveBeenCalledTimes(2);
		expect(dependencies.persist).toHaveBeenCalledTimes(2);
		expect(dependencies.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			modality: 'image',
			sourceRevision: sourceSha256,
			sourceLocator: expect.objectContaining({
				kind: 'image_object_crop', coordinateSpace: 'original_pixels', bbox: [8, 8, 40, 36], label: 'person',
				cropPolicyRevision: 'atlas.image-object-crop.top-confidence-source-pixels-jpeg90-max4.v1',
			}),
			metadata: expect.objectContaining({ modelOutputReviewState: 'UNREVIEWED_PROPOSAL' }),
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

describe('selectEvidenceImageObjectCropsV1', () => {
	it('selects the highest-confidence valid source-pixel boxes with a hard cap and stable tie breaks', () => {
		const detections = [
			{ class: 'person', confidence: 0.8, bbox: [10, 10, 30, 30] },
			{ class: 'vehicle', confidence: 0.9, bbox: [40, 10, 60, 30] },
			{ class: 'bag', confidence: 0.9, bbox: [10, 40, 30, 60] },
			{ class: 'invalid', confidence: 0.99, bbox: [-1, 1, 20, 30] },
		] as unknown as EvidenceVisualAnalysisV1['objectDetections'];
		const selected = selectEvidenceImageObjectCropsV1(detections, 100, 100, 2);
		expect(selected.map(({ label }) => label)).toEqual(['bag', 'vehicle']);
		expect(selected.every((crop) => crop.left >= 0 && crop.top >= 0 && crop.left + crop.width <= 100 && crop.top + crop.height <= 100)).toBe(true);
		expect(selectEvidenceImageObjectCropsV1(detections, 100, 100, 0)).toEqual([]);
	});
});
