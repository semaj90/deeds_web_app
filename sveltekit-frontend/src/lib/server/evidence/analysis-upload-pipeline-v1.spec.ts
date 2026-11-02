import { describe, expect, it, vi } from 'vitest';
import {
	buildAnalysisUploadEvidencePayloadV1,
	executeAnalysisUploadPipelineV1,
} from './analysis-upload-pipeline-v1.js';

const evidenceId = '0f76c08a-04d3-4f1e-a7bc-e1a7f1b54e22';
const analysisJobId = 'af5368e3-7e37-48dc-b6fd-03798462bed3';
const sourceSha256 = `sha256:${'a'.repeat(64)}`;
const metadata = {
	evidenceId,
	caseId: null,
	objectKey: 'evidence/5/case-file.pdf',
	sourceSha256,
	fileName: 'case-file.pdf',
	contentType: 'application/pdf',
	uploadedBy: 5,
};

describe('DB-backed evidence upload pipeline contract', () => {
	it('builds a source-bound processor payload that fetches the persisted original', () => {
		const payload = buildAnalysisUploadEvidencePayloadV1({ evidenceId, analysisJobId, metadata });
		expect(payload).toMatchObject({
			evidenceId,
			text: 'Queued source file: case-file.pdf',
			sourceRevision: sourceSha256,
			metadata: {
				object_bucket: 'legal-evidence',
				objectKey: 'evidence/5/case-file.pdf',
				fileType: 'application/pdf',
				sourceSha256,
				jobId: analysisJobId,
			},
		});
	});

	it('rejects malformed source digest, unsafe object key, and mismatched evidence identity', () => {
		expect(() => buildAnalysisUploadEvidencePayloadV1({
			evidenceId, analysisJobId, metadata: { ...metadata, sourceSha256: 'unverified' },
		})).toThrow();
		expect(() => buildAnalysisUploadEvidencePayloadV1({
			evidenceId, analysisJobId, metadata: { ...metadata, objectKey: 'evidence/5/../other.pdf' },
		})).toThrow();
		expect(() => buildAnalysisUploadEvidencePayloadV1({
			evidenceId, analysisJobId, metadata: { ...metadata, evidenceId: analysisJobId },
		})).toThrow('ANALYSIS_UPLOAD_EVIDENCE_ID_MISMATCH');
	});

	it('reports processed only after the canonical worker resolves', async () => {
		const synthesis = {
			schema: 'atlas.evidence-synthesis.v1' as const,
			status: 'DISABLED' as const,
			sourceId: evidenceId,
			sourceRevision: sourceSha256,
			textSourceSha256: null,
			provider: null,
			producerRevision: null,
			modelId: null,
			outputSha256: null,
			claims: [],
			rejectedFactCount: 0,
			textTruncated: false,
			canonicalAuthority: false as const,
			summaryStatus: 'NOT_GENERATED' as const,
		};
		const processEvidence = vi.fn().mockResolvedValue({
			chunkCount: 2,
			persistedCount: 2,
			sourceRevision: sourceSha256,
			synthesis,
		});
		const result = await executeAnalysisUploadPipelineV1({
			evidenceId, analysisJobId, metadata, processEvidence,
		});
		expect(processEvidence).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			status: 'processed', evidenceId, sourceRevision: sourceSha256, representationId: 'semantic_768',
			canonicalStore: 'postgresql.evidence_vectors', chunkCount: 2, persistedCount: 2,
			synthesis,
		});
		processEvidence.mockRejectedValueOnce(new Error('embedding unavailable'));
		await expect(executeAnalysisUploadPipelineV1({
			evidenceId, analysisJobId, metadata, processEvidence,
		})).rejects.toThrow('embedding unavailable');
	});

	it('does not report success without a complete source-matched persistence receipt', async () => {
		const processEvidence = vi.fn().mockResolvedValue({
			chunkCount: 2,
			persistedCount: 1,
			sourceRevision: sourceSha256,
		});
		await expect(executeAnalysisUploadPipelineV1({
			evidenceId, analysisJobId, metadata, processEvidence,
		})).rejects.toThrow('ANALYSIS_UPLOAD_CANONICAL_RECEIPT_INVALID');
	});
});
