import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	insertValues: null as Record<string, unknown> | null,
	deleteEvidenceRow: vi.fn(),
	enqueueJob: vi.fn(),
	getAnalysisJob: vi.fn(),
	createUploadedFile: vi.fn(),
	uploadedObjectKey: null as string | null,
	putFileToSeaweed: vi.fn(),
	deleteFile: vi.fn(),
	updateJob: vi.fn(),
	createJob: vi.fn(),
	invalidateEvidenceCache: vi.fn(),
	invalidateCaseCache: vi.fn(),
	invalidateACEChunksCache: vi.fn(),
}));

vi.mock('$lib/server/seaweed-client.js', () => ({ deleteSeaweedFile: mocks.deleteFile }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ putFileToSeaweed: mocks.putFileToSeaweed }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({
	assertArtifactBucket: vi.fn(),
	assertEvidenceBucket: vi.fn(),
}));
vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: vi.fn(() => ({
			values: vi.fn((values: Record<string, unknown>) => {
				mocks.insertValues = values;
				return { returning: vi.fn(async () => [{ id: 'evidence-1' }]) };
			}),
		})),
		execute: vi.fn(async () => ({ rows: [] })),
		delete: vi.fn(() => ({ where: mocks.deleteEvidenceRow })),
	},
}));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ evidence: { id: 'evidence.id' } }));
vi.mock('drizzle-orm', () => ({
	eq: (...args: unknown[]) => args,
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));
vi.mock('$lib/server/evidence-progress', () => ({ createJob: mocks.createJob, updateJob: mocks.updateJob }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({ qdrant: {} }));
vi.mock('$lib/server/ocr/hybrid.js', () => ({ extractTextHybrid: vi.fn() }));
vi.mock('$lib/server/indexer/legal-chunker.js', () => ({ chunkLegalDocument: vi.fn() }));
vi.mock('$lib/server/analysis/entity-extraction.js', () => ({ extractEntities: vi.fn() }));
vi.mock('$lib/server/analysis/forensics.js', () => ({ detectForensicPatterns: vi.fn() }));
vi.mock('$lib/server/analysis/summarizer.js', () => ({ summarizeDocument: vi.fn() }));
vi.mock('$lib/server/analysis/analysis-jobs.js', () => ({
	createAnalysisJob: vi.fn(),
	enqueueJob: mocks.enqueueJob,
	getAnalysisJob: mocks.getAnalysisJob,
	updateAnalysisJob: vi.fn(),
	completeAnalysisJob: vi.fn(),
	failAnalysisJob: vi.fn(),
}));
vi.mock('$lib/server/analysis/concurrency-gate.js', () => ({
	embedGate: {}, entityGate: {}, forensicsGate: {}, summarizeGate: {},
	gated: vi.fn(), EMBED_BATCH_SIZE: 1,
}));
vi.mock('$lib/server/analysis/code-feature-registry-enqueue.js', () => ({ buildCodeFeatureRegistryEnqueueResult: vi.fn() }));
vi.mock('$lib/server/middleware/rate-limiter.js', () => ({ heavyRateLimiter: { check: () => ({ allowed: true }) } }));
vi.mock('$lib/server/evidence/type-detector.js', () => ({
	detectEvidenceType: () => 'document',
	inferLegalClassification: vi.fn(),
}));
vi.mock('$lib/server/cache/invalidation.js', () => ({
	invalidateEvidenceCache: mocks.invalidateEvidenceCache,
	invalidateCaseCache: mocks.invalidateCaseCache,
	invalidateACEChunksCache: mocks.invalidateACEChunksCache,
}));
vi.mock('$lib/server/gpu/background-analyzer.js', () => ({ triggerEvidenceGpuAnalysis: vi.fn() }));
vi.mock('$lib/server/services/langextract-service.js', () => ({
	extractSectionsFromText: vi.fn(),
	detectSectionsHeuristic: vi.fn(),
}));
vi.mock('$lib/server/evidence/proto-serializer.js', () => ({ serializeEvidenceMetadataBase64: vi.fn() }));
vi.mock('$lib/server/features/evidence/index.js', () => ({ batchStoreEntities: vi.fn() }));
vi.mock('$lib/server/evidence/batch-entity-embedder.js', () => ({ batchEmbedAndStoreEntities: vi.fn() }));
vi.mock('$lib/server/docling-structure.js', () => ({ summarizeDoclingStructure: vi.fn() }));
vi.mock('$lib/server/workflows/pdf-ocr-workflow.js', () => ({ registerPdfOcrWorkflowRun: vi.fn() }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {
	SEAWEED_EVIDENCE_BUCKET: 'legal-evidence',
	SEAWEED_ARTIFACTS_BUCKET: 'legal-artifacts',
	EMBEDDING_STRICT_BASE_URL: '',
} }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: vi.fn() }));
vi.mock('$lib/server/nlp/analyzer.js', () => ({ classifyDocument: vi.fn() }));
vi.mock('$lib/server/yolo.js', () => ({ createYOLOService: vi.fn() }));
vi.mock('$lib/server/ai/local-llama-provider.js', () => ({ LLAMA_SERVER_BASE_URL: '', LOCAL_VLM_MODEL: '' }));
vi.mock('$lib/server/files/upload-file-service.js', () => ({
	createUploadedFile: mocks.createUploadedFile,
}));
vi.mock('$lib/server/features/evidence/audit/evidence-audit.js', () => ({ logEvidenceAction: vi.fn() }));
vi.mock('$lib/server/graph/pg-neo4j-sync.js', () => ({ syncCaseToGraph: vi.fn() }));
vi.mock('$lib/server/evidence/evidence-indexing-receipt-v1.js', () => ({
	buildEvidenceIndexingReceiptV1: vi.fn(),
	canProjectEvidenceEmbeddingToQdrantV1: vi.fn(),
	validateEvidenceEmbeddingV1: vi.fn(),
}));
vi.mock('$lib/server/evidence/evidence-vector-persistence-v1.js', () => ({ persistEvidenceVectorForProjectionV1: vi.fn() }));
vi.mock('$lib/server/evidence/evidence-vector-outbox-readiness-v1.js', () => ({ isEvidenceVectorOutboxAvailableV1: vi.fn() }));
vi.mock('$lib/server/evidence/evidence-embedding-producer.js', () => ({
	createEvidenceEmbeddingProducer: vi.fn(() => vi.fn()),
}));

import { POST } from './+server.js';

function uploadRequest(caseId: string): Request {
	const bytes = new TextEncoder().encode('case evidence');
	const file = {
		name: 'note.txt',
		type: 'text/plain',
		size: bytes.byteLength,
		arrayBuffer: async () => bytes.slice().buffer,
	};
	const fields = new Map<string, unknown>([
		['file', file],
		['caseId', caseId],
		['title', 'Witness note'],
		['evidenceType', 'document'],
		['enableAiAnalysis', 'false'],
		['enableOcr', 'false'],
		['enableEmbeddings', 'false'],
		['enableSummarization', 'false'],
	]);
	const form = { get: (key: string) => fields.get(key) ?? null, keys: () => fields.keys() };
	return {
		url: 'http://localhost/api/evidence/upload',
		headers: new Headers(),
		signal: new AbortController().signal,
		formData: async () => form as unknown as FormData,
	} as unknown as Request;
}

describe('POST /api/evidence/upload durable job boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.insertValues = null;
		mocks.uploadedObjectKey = null;
		mocks.deleteEvidenceRow.mockResolvedValue(undefined);
		mocks.getAuthorizedCase.mockImplementation(async (caseId: string) => ({ id: caseId }));
		mocks.enqueueJob.mockResolvedValue('job-1');
		mocks.getAnalysisJob.mockResolvedValue(null);
		mocks.deleteFile.mockResolvedValue(true);
		mocks.createUploadedFile.mockImplementation(async (input: {
			objectKey: string;
			bytes: Uint8Array;
			contentType: string;
			upload: (args: { objectKey: string; bytes: Uint8Array; contentType: string }) => Promise<void>;
		}) => {
			mocks.uploadedObjectKey = input.objectKey;
			await input.upload({ objectKey: input.objectKey, bytes: input.bytes, contentType: input.contentType });
			return { file: { id: 'file-1' } };
		});
	});

	it('authorizes the selected case and returns only after evidence is bound to its durable queued job', async () => {
		const response = await POST({
			request: uploadRequest('89317a13-5ec2-4919-8795-1128bb01fdce'),
			locals: { user: { id: '7' } },
		} as never);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toMatchObject({ success: true, evidenceId: 'evidence-1', status: 'queued' });
		expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/i);
		expect(mocks.getAuthorizedCase).toHaveBeenCalledWith('89317a13-5ec2-4919-8795-1128bb01fdce', 7);
		expect(mocks.insertValues).toMatchObject({
			caseId: '89317a13-5ec2-4919-8795-1128bb01fdce',
			userId: 7,
			uploadedBy: 7,
			hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
		});
		expect(mocks.enqueueJob).toHaveBeenCalledWith(expect.objectContaining({
			id: body.jobId,
			evidenceId: 'evidence-1',
			caseId: '89317a13-5ec2-4919-8795-1128bb01fdce',
			jobType: 'upload_pipeline',
			result: expect.objectContaining({
				caseId: '89317a13-5ec2-4919-8795-1128bb01fdce',
				sourceSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
			}),
		}));
		expect(mocks.createUploadedFile).toHaveBeenCalledTimes(1);
		expect(mocks.putFileToSeaweed).toHaveBeenCalledTimes(1);
		expect(mocks.putFileToSeaweed.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.enqueueJob.mock.invocationCallOrder[0],
		);
	});

	it('compensates the stored object and evidence row when durable job enqueue fails', async () => {
		mocks.enqueueJob.mockRejectedValueOnce(new Error('queue unavailable'));
		const response = await POST({
			request: uploadRequest('89317a13-5ec2-4919-8795-1128bb01fdce'),
			locals: { user: { id: '7' } },
		} as never);

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			success: false,
			error: 'Evidence upload processing failed',
		});
		expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
		expect(mocks.uploadedObjectKey).toBeTruthy();
		expect(mocks.deleteFile).toHaveBeenCalledWith('legal-evidence', mocks.uploadedObjectKey);
		expect(mocks.deleteEvidenceRow).toHaveBeenCalledTimes(1);
	});

	it('returns the durable job when enqueue rejects after the job row committed', async () => {
		mocks.enqueueJob.mockRejectedValueOnce(new Error('connection closed after commit'));
		mocks.getAnalysisJob.mockImplementationOnce(async (jobId: string) => ({
			id: jobId,
			evidenceId: 'evidence-1',
			caseId: '89317a13-5ec2-4919-8795-1128bb01fdce',
			jobType: 'upload_pipeline',
			status: 'queued',
		}));

		const response = await POST({
			request: uploadRequest('89317a13-5ec2-4919-8795-1128bb01fdce'),
			locals: { user: { id: '7' } },
		} as never);
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body).toMatchObject({ success: true, evidenceId: 'evidence-1', status: 'queued' });
		expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/i);
		expect(mocks.getAnalysisJob).toHaveBeenCalledWith(body.jobId);
		expect(mocks.deleteFile).not.toHaveBeenCalled();
		expect(mocks.deleteEvidenceRow).not.toHaveBeenCalled();
	});

	it('preserves upload artifacts when durable job readback is unavailable', async () => {
		mocks.enqueueJob.mockRejectedValueOnce(new Error('connection closed after commit'));
		mocks.getAnalysisJob.mockRejectedValueOnce(new Error('database unavailable'));

		const response = await POST({
			request: uploadRequest('89317a13-5ec2-4919-8795-1128bb01fdce'),
			locals: { user: { id: '7' } },
		} as never);

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			success: false,
			error: 'UPLOAD_OUTCOME_UNCERTAIN',
		});
		expect(mocks.deleteFile).not.toHaveBeenCalled();
		expect(mocks.deleteEvidenceRow).not.toHaveBeenCalled();
	});

	it('fails closed for an unauthorized selected case before storage or durable job enqueue', async () => {
		mocks.getAuthorizedCase.mockResolvedValueOnce(null);
		const response = await POST({
			request: uploadRequest('89317a13-5ec2-4919-8795-1128bb01fdce'),
			locals: { user: { id: '7' } },
		} as never);

		expect(response.status).toBe(404);
		expect(mocks.getAuthorizedCase).toHaveBeenCalledTimes(1);
		expect(mocks.createUploadedFile).not.toHaveBeenCalled();
		expect(mocks.enqueueJob).not.toHaveBeenCalled();
	});
});
