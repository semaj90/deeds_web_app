import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client.js';
import { analyzeEvidenceImageV1, type EvidenceVisualAnalysisV1 } from './evidence-visual-analysis-v1.js';
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
	modelDir: string | null | undefined;
}

const defaultDependencies: CanonicalImageAnalysisDependenciesV1 = {
	analyze: analyzeEvidenceImageV1,
	embed: embedEvidenceImageWithEmbeddingGemma2OnnxV1,
	persist: persistEvidenceMultimodalVectorV1,
	modelDir: ENV.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR,
};

function sha256Ref(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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
	chunkCount: 1;
	persistedCount: 1;
	sourceRevision: string;
	representationId: 'evidence_multimodal_semantic_768';
	canonicalStore: 'postgresql.evidence_multimodal_vectors';
}> {
	const image = ImageInputV1.parse(input);
	if (sha256Ref(image.bytes) !== image.sourceRevision) throw new Error('EVIDENCE_IMAGE_SOURCE_REVISION_MISMATCH');
	const original = await sharp(image.bytes, { limitInputPixels: 40_000_000, failOn: 'error' }).metadata();
	if (!formatMatches(image.contentType, original.format) || !original.width || !original.height) {
		throw new Error('EVIDENCE_IMAGE_SIGNATURE_OR_DIMENSIONS_INVALID');
	}
	if (original.width * original.height > 40_000_000) throw new Error('EVIDENCE_IMAGE_PIXEL_LIMIT_EXCEEDED');
	if (!dependencies.modelDir?.trim()) throw new Error('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');

	const [analysis, embedding] = await Promise.all([
		dependencies.analyze({
			evidenceId: image.evidenceId,
			caseId: image.caseId,
			fileName: image.fileName,
			contentType: image.contentType,
			buffer: image.bytes,
			sourceRevision: image.sourceRevision,
		}),
		dependencies.embed({ buffer: image.bytes, modelDir: dependencies.modelDir }),
	]);
	if (embedding.inputSha256 !== image.sourceRevision) throw new Error('EVIDENCE_IMAGE_EMBEDDING_INPUT_REVISION_MISMATCH');
	const analysisRevision = `atlas.evidence-image-analysis.v1:${embedding.modelRevision}:${embedding.preprocessingRevision}`;
	const persisted = await dependencies.persist(db, {
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
			modelOutputReviewState: 'UNREVIEWED_PROPOSAL',
		},
	});
	return {
		analysis,
		vectorId: persisted.id,
		qdrantPointId: persisted.qdrantPointId,
		outputSha256: persisted.outputSha256,
		chunkCount: 1,
		persistedCount: 1,
		sourceRevision: image.sourceRevision,
		representationId: 'evidence_multimodal_semantic_768',
		canonicalStore: 'postgresql.evidence_multimodal_vectors',
	};
}
