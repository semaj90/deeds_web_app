import { createHash, randomUUID } from 'node:crypto';
import type { ImageOcrStageV1 } from '$lib/shared/storybook-image-observations-v1.js';
import sharp from 'sharp';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client.js';
import { and, eq, isNull } from 'drizzle-orm';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { analyzeEvidenceImageV1, type EvidenceVisualAnalysisV1 } from './evidence-visual-analysis-v1.js';
import { resizeForThumbnail, EVIDENCE_THUMBNAIL_PREPROCESSING_REVISION_V1 } from '$lib/server/image/resize-for-vlm.js';
import {
	embedEvidenceImageWithEmbeddingGemma2OnnxV1,
} from './embeddinggemma2-onnx-image-v1.js';
import { persistEvidenceMultimodalVectorV1 } from './evidence-multimodal-vector-persistence-v1.js';

const ImageInputV1 = z.object({
	evidenceId: z.string().uuid(),
	caseId: z.string().uuid(),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	contentType: z.enum(['image/png', 'image/jpeg', 'image/tiff', 'image/bmp', 'image/webp']),
	fileName: z.string().trim().min(1).max(512),
	bytes: z.instanceof(Buffer).refine((value) => value.length > 0 && value.length <= 32 * 1024 * 1024),
});

export interface CanonicalImageAnalysisDependenciesV1 {
	analyze: typeof analyzeEvidenceImageV1;
	embed: typeof embedEvidenceImageWithEmbeddingGemma2OnnxV1;
	persist: typeof persistEvidenceMultimodalVectorV1;
	ocr?: (png: Buffer) => Promise<{ text: string; error?: string }>;
	modelDir: string | null | undefined;
	deriveThumbnail: (bytes: Buffer) => Promise<Buffer>;
	storeThumbnail: (bucket: string, key: string, bytes: Buffer) => Promise<void>;
	thumbnailBucket: string | null | undefined;
	deriveObjectCrop: (bytes: Buffer, crop: { left: number; top: number; width: number; height: number }) => Promise<Buffer>;
	maxObjectCrops: number;
}

export const EVIDENCE_IMAGE_OBJECT_CROP_POLICY_REVISION_V1 = 'atlas.image-object-crop.top-confidence-source-pixels-jpeg90-max4.v1' as const;

export type EvidenceImageObjectCropV1 = {
	detectionIndex: number;
	label: string;
	confidence: number;
	bbox: [number, number, number, number];
	left: number;
	top: number;
	width: number;
	height: number;
};

/** Select a bounded, deterministic set of valid detector regions in raw source-pixel coordinates. */
export function selectEvidenceImageObjectCropsV1(
	detections: EvidenceVisualAnalysisV1['objectDetections'],
	width: number,
	height: number,
	maximum = 4,
): EvidenceImageObjectCropV1[] {
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 16 || height < 16) return [];
	if (!Number.isFinite(maximum) || maximum <= 0) return [];
	const candidates = detections.flatMap((detection, detectionIndex) => {
		if (!Number.isFinite(detection.confidence) || detection.confidence < 0.15 || !detection.class.trim() || detection.bbox.length !== 4) return [];
		const [x1, y1, x2, y2] = detection.bbox;
		if (![x1, y1, x2, y2].every(Number.isFinite) || x1 < 0 || y1 < 0 || x2 > width || y2 > height || x2 <= x1 || y2 <= y1) return [];
		const left = Math.floor(x1);
		const top = Math.floor(y1);
		const right = Math.ceil(x2);
		const bottom = Math.ceil(y2);
		const cropWidth = right - left;
		const cropHeight = bottom - top;
		const area = cropWidth * cropHeight;
		if (cropWidth < 16 || cropHeight < 16 || area > width * height * 0.75) return [];
		return [{
			detectionIndex,
			label: detection.class.trim(),
			confidence: detection.confidence,
			bbox: [x1, y1, x2, y2] as [number, number, number, number],
			left, top, width: cropWidth, height: cropHeight,
		}];
	});
	candidates.sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label)
		|| a.top - b.top || a.left - b.left || a.width - b.width || a.height - b.height || a.detectionIndex - b.detectionIndex);
	const selected: EvidenceImageObjectCropV1[] = [];
	const identities = new Set<string>();
	for (const candidate of candidates) {
		const identity = `${candidate.left},${candidate.top},${candidate.width},${candidate.height}`;
		if (identities.has(identity)) continue;
		identities.add(identity);
		selected.push(candidate);
		if (selected.length >= Math.max(0, Math.min(4, Math.floor(maximum)))) break;
	}
	return selected;
}

export interface EvidenceImageThumbnailManifestV1 {
	kind: 'thumbnail';
	sourceRevision: string;
	objectKey: string;
	bucket: string;
	mimeType: 'image/jpeg';
	outputSha256: string;
	width: number;
	height: number;
	preprocessingRevision: string;
}

const defaultDependencies: CanonicalImageAnalysisDependenciesV1 = {
	analyze: analyzeEvidenceImageV1,
	embed: embedEvidenceImageWithEmbeddingGemma2OnnxV1,
	persist: persistEvidenceMultimodalVectorV1,
	ocr: async (png) => {
		const { extractTextFromImage } = await import('$lib/server/ocr/tesseract.js');
		return extractTextFromImage(png, `storybook-${randomUUID()}.png`, 15_000);
	},
	modelDir: ENV.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR,
	deriveThumbnail: resizeForThumbnail,
	thumbnailBucket: ENV.SEAWEED_ARTIFACTS_BUCKET,
	maxObjectCrops: 4,
	deriveObjectCrop: async (bytes, crop) => sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
		.extract(crop).jpeg({ quality: 90, mozjpeg: false }).toBuffer(),
	storeThumbnail: async (bucket, key, bytes) => {
		const { uploadSeaweedFile, getSeaweedFile } = await import('$lib/server/seaweed-client.js');
		await uploadSeaweedFile(bucket, key, bytes, { 'Content-Type': 'image/jpeg', 'X-Analysis-Type': 'evidence-thumbnail' });
		const readback = await getSeaweedFile(bucket, key);
		if (createHash('sha256').update(readback).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) {
			throw new Error('EVIDENCE_IMAGE_THUMBNAIL_READBACK_MISMATCH');
		}
	},
};

function sha256Ref(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function runImageOcr(image: z.infer<typeof ImageInputV1>, ocr: NonNullable<CanonicalImageAnalysisDependenciesV1['ocr']>): Promise<ImageOcrStageV1> {
	const scope = {
		sourceRevision: image.sourceRevision, engine: 'tesseract',
		policyRevision: 'atlas.image-ocr.eng-oriented-png-1280.v1',
	} as const;
	let inputSha256: string | undefined;
	try {
		const png = await sharp(image.bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
			.rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
		inputSha256 = sha256Ref(png);
		const result = await ocr(png);
		if (result.error || result.text.includes('\0')) return { ...scope, inputSha256, status: 'FAILED' };
		const raw = result.text.trim();
		if (!raw) return { ...scope, inputSha256, status: 'EMPTY' };
		const text = raw.slice(0, 800).replace(/[\uD800-\uDBFF]$/, '');
		return { ...scope, inputSha256, status: 'COMPLETED', text, truncated: text.length < raw.length };
	} catch {
		return { ...scope, inputSha256, status: 'FAILED' };
	}
}

function formatMatches(mime: string, format: string | undefined): boolean {
	const expected = mime === 'image/jpeg' ? 'jpeg' : mime.slice('image/'.length);
	return format === expected;
}

/** Runs image analysis and stores the image vector in canonical PostgreSQL plus its projection outbox intent. */
export async function processEvidenceImageCanonicalV1(
	input: unknown,
	dependencies: CanonicalImageAnalysisDependenciesV1 = defaultDependencies,
): Promise<{
	analysis: EvidenceVisualAnalysisV1;
	vectorId: string;
	qdrantPointId: string;
	outputSha256: string;
	chunkCount: number;
	persistedCount: number;
	objectCropCount: number;
	objectCropVectorIds: string[];
	sourceRevision: string;
	representationId: 'evidence_multimodal_semantic_768';
	canonicalStore: 'postgresql.evidence_multimodal_vectors';
	thumbnail: EvidenceImageThumbnailManifestV1;
}> {
	const image = ImageInputV1.parse(input);
	if (sha256Ref(image.bytes) !== image.sourceRevision) throw new Error('EVIDENCE_IMAGE_SOURCE_REVISION_MISMATCH');
	const original = await sharp(image.bytes, { limitInputPixels: 40_000_000, failOn: 'error' }).metadata();
	if (!formatMatches(image.contentType, original.format) || !original.width || !original.height) {
		throw new Error('EVIDENCE_IMAGE_SIGNATURE_OR_DIMENSIONS_INVALID');
	}
	if (original.width * original.height > 40_000_000) throw new Error('EVIDENCE_IMAGE_PIXEL_LIMIT_EXCEEDED');
	if (!dependencies.modelDir?.trim()) throw new Error('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	const thumbnailBucket = dependencies.thumbnailBucket?.trim();
	if (!thumbnailBucket) throw new Error('EVIDENCE_IMAGE_DERIVATIVE_BUCKET_UNCONFIGURED');

	const [analysis, embedding, thumbnailBytes, imageOcr] = await Promise.all([
		dependencies.analyze({
			evidenceId: image.evidenceId,
			caseId: image.caseId,
			fileName: image.fileName,
			contentType: image.contentType,
			buffer: image.bytes,
			sourceRevision: image.sourceRevision,
		}),
		dependencies.embed({ buffer: image.bytes, modelDir: dependencies.modelDir }),
		dependencies.deriveThumbnail(image.bytes),
		dependencies.ocr ? runImageOcr(image, dependencies.ocr) : undefined,
	]);
	if (embedding.inputSha256 !== image.sourceRevision) throw new Error('EVIDENCE_IMAGE_EMBEDDING_INPUT_REVISION_MISMATCH');
	if (!Buffer.isBuffer(thumbnailBytes) || thumbnailBytes.length === 0 || thumbnailBytes.length > 2 * 1024 * 1024) {
		throw new Error('EVIDENCE_IMAGE_THUMBNAIL_OUTPUT_INVALID');
	}
	const thumbnailMeta = await sharp(thumbnailBytes, { limitInputPixels: 256 * 256, failOn: 'error' }).metadata();
	if (thumbnailMeta.format !== 'jpeg' || !thumbnailMeta.width || !thumbnailMeta.height || thumbnailMeta.width > 256 || thumbnailMeta.height > 256) {
		throw new Error('EVIDENCE_IMAGE_THUMBNAIL_DIMENSIONS_INVALID');
	}
	const thumbnailSha256 = createHash('sha256').update(thumbnailBytes).digest('hex');
	const sourceHash = image.sourceRevision.slice('sha256:'.length);
	const thumbnailKey = `evidence/${image.caseId}/${image.evidenceId}/${sourceHash}/thumbnail-${thumbnailSha256}.jpg`;
	await dependencies.storeThumbnail(thumbnailBucket, thumbnailKey, thumbnailBytes);
	const thumbnail: EvidenceImageThumbnailManifestV1 = {
		kind: 'thumbnail',
		sourceRevision: image.sourceRevision,
		objectKey: thumbnailKey,
		bucket: thumbnailBucket,
		mimeType: 'image/jpeg',
		outputSha256: thumbnailSha256,
		width: thumbnailMeta.width,
		height: thumbnailMeta.height,
		preprocessingRevision: EVIDENCE_THUMBNAIL_PREPROCESSING_REVISION_V1,
	};
	const baseRevision = `atlas.evidence-image-analysis.v1:${embedding.modelRevision}:${embedding.preprocessingRevision}:${EVIDENCE_IMAGE_OBJECT_CROP_POLICY_REVISION_V1}`;
	const analysisRevision = imageOcr
		? `atlas.evidence-image-analysis.ocr.v1:${sha256Ref(Buffer.from(JSON.stringify([baseRevision, imageOcr])))}`
		: baseRevision;
	const wholeImagePersisted = await dependencies.persist(db, {
		evidenceId: image.evidenceId,
		caseId: image.caseId,
		sourceRevision: image.sourceRevision,
		analysisRevision,
		modality: 'image',
		sourceLocator: {
			kind: 'whole_image',
			coordinateSpace: 'original_pixels',
			width: original.width,
			height: original.height,
			orientation: original.orientation ?? null,
		},
		embedding: embedding.embedding,
		model: embedding.model,
		modelArtifactSha256: embedding.modelArtifactSha256,
		preprocessingRevision: embedding.preprocessingRevision,
		inputSha256: embedding.inputSha256,
		outputSha256: embedding.outputSha256,
		metadata: {
			analysisSchema: analysis.schema,
			analysisAuthority: analysis.authority,
			analysisStatus: analysis.status,
			analysisRevision,
			visualAnalysis: analysis,
			...(imageOcr ? { imageOcr } : {}),
			imageDerivatives: { thumbnail },
			modelOutputReviewState: 'UNREVIEWED_PROPOSAL',
		},
	});
	const objectCropVectorIds: string[] = [];
	const objectCrops = selectEvidenceImageObjectCropsV1(analysis.objectDetections, original.width, original.height, dependencies.maxObjectCrops);
	for (const crop of objectCrops) {
		const cropBytes = await dependencies.deriveObjectCrop(image.bytes, {
			left: crop.left, top: crop.top, width: crop.width, height: crop.height,
		});
		if (!Buffer.isBuffer(cropBytes) || cropBytes.length === 0 || cropBytes.length > 8 * 1024 * 1024) {
			throw new Error(`EVIDENCE_IMAGE_OBJECT_CROP_OUTPUT_INVALID:${crop.detectionIndex}`);
		}
		const cropEmbedding = await dependencies.embed({ buffer: cropBytes, modelDir: dependencies.modelDir });
		const cropRevision = `sha256:${createHash('sha256').update(cropBytes).digest('hex')}`;
		if (cropEmbedding.inputSha256 !== cropRevision) throw new Error(`EVIDENCE_IMAGE_OBJECT_CROP_INPUT_REVISION_MISMATCH:${crop.detectionIndex}`);
		const cropPersisted = await dependencies.persist(db, {
			evidenceId: image.evidenceId,
			caseId: image.caseId,
			sourceRevision: image.sourceRevision,
			analysisRevision,
			modality: 'image',
			sourceLocator: {
				kind: 'image_object_crop',
				coordinateSpace: 'original_pixels',
				sourceDimensions: { width: original.width, height: original.height },
				bbox: crop.bbox,
				cropPixels: { left: crop.left, top: crop.top, width: crop.width, height: crop.height },
				detectionIndex: crop.detectionIndex,
				label: crop.label,
				confidence: crop.confidence,
				cropPolicyRevision: EVIDENCE_IMAGE_OBJECT_CROP_POLICY_REVISION_V1,
			},
			embedding: cropEmbedding.embedding,
			model: cropEmbedding.model,
			modelArtifactSha256: cropEmbedding.modelArtifactSha256,
			preprocessingRevision: `${EVIDENCE_IMAGE_OBJECT_CROP_POLICY_REVISION_V1}+${cropEmbedding.preprocessingRevision}`,
			inputSha256: cropEmbedding.inputSha256,
			outputSha256: cropEmbedding.outputSha256,
			metadata: {
				modelOutputReviewState: 'UNREVIEWED_PROPOSAL',
				cropSourceRevision: image.sourceRevision,
				label: crop.label,
				confidence: crop.confidence,
				cropPolicyRevision: EVIDENCE_IMAGE_OBJECT_CROP_POLICY_REVISION_V1,
			},
		});
		objectCropVectorIds.push(cropPersisted.id);
	}
	// Surface derived YOLO labels on the evidence row for viewer cards. Non-fatal: the
	// canonical vector receipt above is already committed. Labels are unreviewed proposals.
	const detectedLabels = [...new Set(analysis.objectDetections.map((d) => `detected:${d.class}`))];
	if (detectedLabels.length > 0) {
		try {
			await db
				.update(evidence)
				.set({ aiTags: detectedLabels })
				.where(and(eq(evidence.id, image.evidenceId), isNull(evidence.deletedAt)));
		} catch {
			// Viewer tags are a convenience projection; the canonical receipt is not affected.
		}
	}
	return {
		analysis,
		vectorId: wholeImagePersisted.id,
		qdrantPointId: wholeImagePersisted.qdrantPointId,
		outputSha256: wholeImagePersisted.outputSha256,
		chunkCount: 1 + objectCropVectorIds.length,
		persistedCount: 1 + objectCropVectorIds.length,
		objectCropCount: objectCropVectorIds.length,
		objectCropVectorIds,
		sourceRevision: image.sourceRevision,
		representationId: 'evidence_multimodal_semantic_768',
		canonicalStore: 'postgresql.evidence_multimodal_vectors',
		thumbnail,
	};
}
