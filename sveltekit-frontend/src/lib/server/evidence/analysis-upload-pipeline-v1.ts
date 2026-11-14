import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { EvidenceProcessPayloadV1Schema } from './evidence-process-payload-v1.js';
import type { EvidenceSynthesisResultV1 } from './synthesis/evidence-synthesis-v1.js';
import type { AnalysisJobProgressStageV1 } from '$lib/server/analysis/analysis-job-progress-events-v1.js';

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const AnalysisUploadMetadataV1Schema = z.object({
	evidenceId: z.string().uuid().optional(),
	caseId: z.string().uuid().nullable().optional(),
	object_bucket: z.string().trim().min(1).max(63),
	objectKey: z.string().min(1).max(1024).refine((value) =>
		value.startsWith('evidence/') &&
		!value.includes('\\') &&
		!value.split('/').some((segment) => segment === '.' || segment === '..'),
	),
	sourceSha256: sha256Schema,
	fileName: z.string().trim().min(1).max(512),
	contentType: z.string().max(255).nullable().optional(),
	uploadedBy: z.number().int().positive(),
}).passthrough();

export function buildAnalysisUploadEvidencePayloadV1(input: {
	evidenceId: string;
	analysisJobId: string;
	metadata: unknown;
}) {
	const evidenceId = z.string().uuid().parse(input.evidenceId);
	const analysisJobId = z.string().uuid().parse(input.analysisJobId);
	const metadata = AnalysisUploadMetadataV1Schema.parse(input.metadata);
	if (metadata.evidenceId && metadata.evidenceId !== evidenceId) {
		throw new Error('ANALYSIS_UPLOAD_EVIDENCE_ID_MISMATCH');
	}
	if (metadata.object_bucket !== ENV.SEAWEED_EVIDENCE_BUCKET) {
		throw new Error('ANALYSIS_UPLOAD_BUCKET_MISMATCH');
	}
	const fileType = metadata.contentType || 'application/octet-stream';

	return EvidenceProcessPayloadV1Schema.parse({
		evidenceId,
		text: `Queued source file: ${metadata.fileName}`,
		contentType: 'document',
		sourceRevision: metadata.sourceSha256,
		caseId: metadata.caseId ?? undefined,
		metadata: {
			...metadata,
			fileName: metadata.fileName,
			fileType,
			object_bucket: metadata.object_bucket,
			objectKey: metadata.objectKey,
			object_name: metadata.objectKey,
			source_revision: metadata.sourceSha256,
			sourceSha256: metadata.sourceSha256,
			jobId: analysisJobId,
		},
	});
}

type AnalysisUploadReceiptV1 = {
	chunkCount: number;
	persistedCount: number;
	sourceRevision: string;
	canonicalReceiptVerified?: boolean;
	synthesis?: EvidenceSynthesisResultV1;
	representationId?: string;
	canonicalStore?: string;
	canonicalStores?: string[];
	analysis?: unknown;
	vectorId?: string;
	qdrantPointId?: string;
	outputSha256?: string;
} | null;

export async function executeAnalysisUploadPipelineV1(input: {
	evidenceId: string;
	analysisJobId: string;
	metadata: unknown;
	processEvidence: (
		payload: ReturnType<typeof buildAnalysisUploadEvidencePayloadV1>,
		onProgress?: (stage: AnalysisJobProgressStageV1) => Promise<void> | void,
	) => Promise<AnalysisUploadReceiptV1>;
	onProgress?: (stage: AnalysisJobProgressStageV1) => Promise<void> | void;
}): Promise<Record<string, unknown>> {
	const payload = buildAnalysisUploadEvidencePayloadV1(input);
	const receipt = await input.processEvidence(payload, input.onProgress);
	const verifiedNonVectorReceipt = receipt?.canonicalReceiptVerified === true &&
		receipt.chunkCount === 0 && receipt.persistedCount === 0;
	if (
		!receipt ||
		!Number.isSafeInteger(receipt.chunkCount) ||
		(!verifiedNonVectorReceipt && receipt.chunkCount <= 0) ||
		receipt.persistedCount !== receipt.chunkCount ||
		receipt.sourceRevision !== payload.sourceRevision
	) {
		throw new Error('ANALYSIS_UPLOAD_CANONICAL_RECEIPT_INVALID');
	}
	return {
		status: 'processed',
		evidenceId: payload.evidenceId,
		sourceRevision: payload.sourceRevision,
		representationId: receipt.representationId ?? 'semantic_768',
		canonicalStore: receipt.canonicalStore ?? 'postgresql.evidence_vectors',
		...(receipt.canonicalStores ? { canonicalStores: receipt.canonicalStores } : {}),
		...(receipt.analysis ? { analysis: receipt.analysis } : {}),
		...(receipt.vectorId ? { vectorId: receipt.vectorId } : {}),
		...(receipt.qdrantPointId ? { qdrantPointId: receipt.qdrantPointId } : {}),
		...(receipt.outputSha256 ? { outputSha256: receipt.outputSha256 } : {}),
		chunkCount: receipt.chunkCount,
		persistedCount: receipt.persistedCount,
		...(receipt.canonicalReceiptVerified ? { canonicalReceiptVerified: true } : {}),
		...(receipt.synthesis ? { synthesis: receipt.synthesis } : {}),
	};
}
