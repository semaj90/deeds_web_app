/**
 * Library Upload & Ingest Routes — Vitest unit tests
 *
 * Routes covered:
 *  - POST /api/library/upload           → 401, 400, 201 (new), 200 (duplicate)
 *  - GET  /api/library/ingest/[jobId]   → 401, 400, 404, 200
 *  - GET  /api/library/documents        → 401, 200
 *  - GET  /api/library/search           → 401, 200
 *  - POST /api/library/ingest-codebase-docs → 401, 200
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Static module mocks (must precede any import that transitively uses them) ──

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://ollama.test',
		QDRANT_URL: 'http://qdrant.test',
		MINIO_ENDPOINT: 'minio.test:9000',
	},
}));

// ── Pool mock ────────────────────────────────────────────────────────────────

const mockPoolQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));

vi.mock('$lib/server/db/client', () => ({
	pool: { query: mockPoolQuery },
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve([])),
				limit: vi.fn(() => Promise.resolve([])),
			})),
		})),
		execute: vi.fn(async () => ({ rows: [] })),
		insert: vi.fn(() => ({
			values: vi.fn(() => {
				const p: any = Promise.resolve(undefined);
				p.returning = vi.fn(async () => []);
				p.onConflictDoNothing = vi.fn(() => {
					const p2: any = Promise.resolve(undefined);
					p2.returning = vi.fn(async () => []);
					return p2;
				});
				p.onConflictDoUpdate = vi.fn(() => Promise.resolve(undefined));
				return p;
			}),
		})),
	},
}));

// ── Embedding mock ────────────────────────────────────────────────────────────

const mockGenerateEmbeddings = vi.fn(async () => ({
	vectors: [[0.1, 0.2, 0.3]],
	model: 'embeddinggemma:latest',
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbeddings: mockGenerateEmbeddings,
	generateSingleEmbedding: async () => [0.1, 0.2, 0.3],
}));

// ── Qdrant mock ───────────────────────────────────────────────────────────────

const mockQdrantBatchUpsert = vi.fn(async () => undefined);

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		batchUpsert: mockQdrantBatchUpsert,
		client: {
			search: vi.fn(async () => []),
			upsert: vi.fn(async () => undefined),
		},
		collections: { documents: 'legal_documents' },
		hybridSearch: vi.fn(async () => ({ results: [] })),
	},
	deterministicPointId: vi.fn((v: string) => `point-${v}`),
}));

// ── MinIO / upload mock ────────────────────────────────────────────────────────

vi.mock('$lib/server/minio-client.js', () => ({
	putObject: vi.fn(async () => 'minio-key-123'),
	getFile: vi.fn(async () => Buffer.from('pdf content')),
	deleteObject: vi.fn(async () => undefined),
}));

// ── Ingestion worker mock ──────────────────────────────────────────────────────

const mockUploadLibraryDocument = vi.fn(async () => ({
	documentId: 'doc-uuid-1',
	jobId: 'job-uuid-1',
	alreadyExists: false,
	processingStatus: 'queued',
}));

const mockRunIngestionPipeline = vi.fn(async () => ({
	documentId: 'doc-uuid-1',
	nodeCount: 5,
	chunkCount: 12,
	pageCount: 3,
}));

vi.mock('$lib/server/legal/ingestion-worker.js', () => ({
	uploadLibraryDocument: mockUploadLibraryDocument,
	runIngestionPipeline: mockRunIngestionPipeline,
}));

// ── Legal chunker mock ────────────────────────────────────────────────────────

vi.mock('$lib/server/indexer/legal-chunker.js', () => ({
	chunkLegalDocument: vi.fn(() => [
		{ text: 'Chunk one.', tokenCount: 10, sectionPath: ['Section 1'], chunkIndex: 0, startOffset: 0, endOffset: 10 },
	]),
}));

// ── Go search URL (empty → inline path) ───────────────────────────────────────

vi.mock('$lib/server/validation.js', () => ({
	isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}));

// ── fs mock for codebase-docs endpoint ───────────────────────────────────────

const mockFsReaddir = vi.fn(() => []);
const mockFsReadFile = vi.fn(() => '# Test\n\nContent here.');

vi.mock('fs', async () => {
	const actual = await vi.importActual<typeof import('fs')>('fs');
	return {
		...actual,
		readdirSync: mockFsReaddir,
		readFileSync: mockFsReadFile,
	};
});

// ─────────────────────────────────────────────────────────────────────────────

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const INVALID_UUID = 'not-a-uuid';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/library/upload
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/library/upload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUploadLibraryDocument.mockResolvedValue({
			documentId: 'doc-uuid-1',
			jobId: 'job-uuid-1',
			alreadyExists: false,
			processingStatus: 'queued',
		});
	});

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/library/upload/+server.js');
		const req = new Request('http://localhost/api/library/upload', { method: 'POST' });
		const res = await POST({ request: req, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 when no file is provided', async () => {
		const { POST } = await import('../src/routes/api/library/upload/+server.js');
		const formData = new FormData();
		formData.set('title', 'Missing File Test');
		const req = new Request('http://localhost/api/library/upload', {
			method: 'POST',
			body: formData,
		});
		const res = await POST({ request: req, locals: { user: { id: 'user-1' } } } as any);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBeTruthy();
	});

	it('returns 201 for a new document upload', async () => {
		const { POST } = await import('../src/routes/api/library/upload/+server.js');

		// Use a real File so instanceof File passes. Override arrayBuffer() so it
		// resolves immediately (the jsdom Blob.arrayBuffer() implementation can
		// block in test env when the underlying Blob content is not a plain string).
		const pdfText = '%PDF-1.4 test content';
		const realFile = new File([pdfText], 'warrant.pdf', { type: 'application/pdf' });
		Object.defineProperty(realFile, 'arrayBuffer', {
			value: async () => new TextEncoder().encode(pdfText).buffer,
			configurable: true,
		});

		const req = {
			formData: async () => ({
				get: (k: string) => {
					if (k === 'file') return realFile;
					if (k === 'title') return 'Search Warrant PDF';
					if (k === 'corpusType') return 'other';
					return null;
				},
			}),
		} as unknown as Request;

		const res = await POST({ request: req, locals: { user: { id: 'user-1' } } } as any);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.documentId).toBe('doc-uuid-1');
		expect(body.jobId).toBe('job-uuid-1');
	});

	it('returns 200 when document already exists (idempotent)', async () => {
		mockUploadLibraryDocument.mockResolvedValue({
			documentId: 'doc-uuid-existing',
			jobId: null,
			alreadyExists: true,
			processingStatus: 'complete',
		});
		const { POST } = await import('../src/routes/api/library/upload/+server.js');

		const pdfText = '%PDF-1.4 duplicate content';
		const realFile = new File([pdfText], 'duplicate.pdf', { type: 'application/pdf' });
		Object.defineProperty(realFile, 'arrayBuffer', {
			value: async () => new TextEncoder().encode(pdfText).buffer,
			configurable: true,
		});

		const req = {
			formData: async () => ({
				get: (k: string) => {
					if (k === 'file') return realFile;
					if (k === 'title') return 'Duplicate Doc';
					return null;
				},
			}),
		} as unknown as Request;

		const res = await POST({ request: req, locals: { user: { id: 'user-1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.alreadyExists).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/library/ingest/[jobId]
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/library/ingest/[jobId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/library/ingest/[jobId]/+server.js');
		const res = await GET({ params: { jobId: VALID_UUID }, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for an invalid UUID', async () => {
		const { GET } = await import('../src/routes/api/library/ingest/[jobId]/+server.js');
		const res = await GET({
			params: { jobId: INVALID_UUID },
			locals: { user: { id: 'user-1' } },
		} as any);
		expect(res.status).toBe(400);
	});

	it('returns 404 when the job does not exist', async () => {
		mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
		const { GET } = await import('../src/routes/api/library/ingest/[jobId]/+server.js');
		const res = await GET({
			params: { jobId: VALID_UUID },
			locals: { user: { id: 'user-1' } },
		} as any);
		expect(res.status).toBe(404);
	});

	it('returns 200 with job status when job exists', async () => {
		mockPoolQuery.mockResolvedValueOnce({
			rows: [
				{
					stage: 'embedding',
					status: 'running',
					progress: 70,
					error_text: null,
					metrics_json: { chunkCount: 12 },
					title: 'Test Warrant PDF',
					corpus_type: 'statute',
					page_count: 5,
					document_id: 'doc-uuid-1',
				},
			],
			rowCount: 1,
		});
		const { GET } = await import('../src/routes/api/library/ingest/[jobId]/+server.js');
		const res = await GET({
			params: { jobId: VALID_UUID },
			locals: { user: { id: 'user-1' } },
		} as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.stage).toBe('embedding');
		expect(body.progress).toBe(70);
		expect(body.document.title).toBe('Test Warrant PDF');
		expect(body.stageIndex).toBeGreaterThanOrEqual(0);
		expect(body.totalStages).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/library/documents
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/library/documents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/library/documents/+server.js');
		const url = new URL('http://localhost/api/library/documents');
		const res = await GET({ url, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns 200 with an empty list when no documents exist', async () => {
		mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
		const { GET } = await import('../src/routes/api/library/documents/+server.js');
		const url = new URL('http://localhost/api/library/documents');
		const res = await GET({ url, locals: { user: { id: 'user-1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.documents).toBeInstanceOf(Array);
		expect(body.total).toBe(0);
	});

	it('returns 200 with document list', async () => {
		mockPoolQuery
			.mockResolvedValueOnce({
				rows: [
					{
						id: 'doc-uuid-1',
						title: 'California Constitution',
						short_title: 'CA Const.',
						citation: null,
						corpus_type: 'constitution',
						source_type: 'pdf',
						processing_status: 'complete',
						effective_date: null,
						source_confidence: 1,
						page_count: 100,
						is_official: true,
						created_at: new Date().toISOString(),
						jurisdiction_name: 'California',
						jurisdiction_code: 'CA',
						node_count: 20,
						chunk_count: 80,
					},
				],
				rowCount: 1,
			})
			.mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 });

		const { GET } = await import('../src/routes/api/library/documents/+server.js');
		const url = new URL('http://localhost/api/library/documents');
		const res = await GET({ url, locals: { user: { id: 'user-1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.documents).toHaveLength(1);
		expect(body.documents[0].title).toBe('California Constitution');
		expect(body.total).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/library/search
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/library/search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/library/search/+server.js');
		const url = new URL('http://localhost/api/library/search?q=hearsay');
		const res = await GET({ url, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns empty hits for short query', async () => {
		const { GET } = await import('../src/routes/api/library/search/+server.js');
		const url = new URL('http://localhost/api/library/search?q=a');
		const res = await GET({ url, locals: { user: { id: 'user-1' } } } as any);
		// Zod rejects q < 2 chars → falls through to empty
		const body = await res.json();
		expect(body.hits).toBeInstanceOf(Array);
	});

	it('returns 200 with hits via SQL fallback', async () => {
		// SQL hybrid path: generate embedding then run query
		mockGenerateEmbeddings.mockResolvedValueOnce({
			vectors: [[0.1, 0.2, 0.3]],
			model: 'embeddinggemma:latest',
		});
		mockPoolQuery.mockResolvedValueOnce({
			rows: [
				{
					chunk_id: 'chunk-uuid-1',
					chunk_text: 'Hearsay is an out-of-court statement.',
					chunk_score: 0.87,
					doc_id: 'doc-uuid-1',
					doc_title: 'Evidence Rules',
					corpus_type: 'statute',
					jurisdiction_code: 'CA',
					chunk_index: 0,
					node_heading: 'Section 1',
					snippet: 'Hearsay is an out-of-court statement.',
					match_type: 'fused',
				},
			],
			rowCount: 1,
		});

		const { GET } = await import('../src/routes/api/library/search/+server.js');
		const url = new URL('http://localhost/api/library/search?q=hearsay+evidence&limit=5');
		const res = await GET({ url, locals: { user: { id: 'user-1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.hits).toBeInstanceOf(Array);
		expect(body.total).toBeGreaterThanOrEqual(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/library/ingest-codebase-docs
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/library/ingest-codebase-docs', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Simulate finding two .md files
		mockFsReaddir.mockReturnValue([
			Object.assign({ name: 'CLAUDE.md', isDirectory: () => false, isFile: () => true }, {}),
			Object.assign({ name: 'README.md', isDirectory: () => false, isFile: () => true }, {}),
		]);
		mockFsReadFile.mockReturnValue('# Architecture\n\nThis system uses SvelteKit and Qdrant.');

		// Simulate no existing doc with that hash
		mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

		mockGenerateEmbeddings.mockResolvedValue({
			vectors: [[0.1, 0.2, 0.3]],
			model: 'embeddinggemma:latest',
		});
	});

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import(
			'../src/routes/api/library/ingest-codebase-docs/+server.js'
		);
		const req = new Request('http://localhost/api/library/ingest-codebase-docs', {
			method: 'POST',
		});
		const res = await POST({ request: req, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns 200 with scan summary on success', async () => {
		const { POST } = await import(
			'../src/routes/api/library/ingest-codebase-docs/+server.js'
		);
		const req = new Request('http://localhost/api/library/ingest-codebase-docs', {
			method: 'POST',
		});
		const res = await POST({ request: req, locals: { user: { id: 'user-1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(typeof body.created).toBe('number');
		expect(typeof body.skipped).toBe('number');
		expect(body.files).toBeInstanceOf(Array);
	});

	it('skips files already ingested by hash', async () => {
		// Every pool call returns a row — jurisdiction lookup + hash check both hit.
		// The hash check seeing a row means each file is marked skipped.
		mockPoolQuery.mockResolvedValue({
			rows: [{ id: 'existing-doc', processing_status: 'complete' }],
			rowCount: 1,
		});

		const { POST } = await import(
			'../src/routes/api/library/ingest-codebase-docs/+server.js'
		);
		const req = new Request('http://localhost/api/library/ingest-codebase-docs', {
			method: 'POST',
		});
		const res = await POST({ request: req, locals: { user: { id: 'user-1' } } } as any);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.skipped).toBeGreaterThanOrEqual(1);
	});
});