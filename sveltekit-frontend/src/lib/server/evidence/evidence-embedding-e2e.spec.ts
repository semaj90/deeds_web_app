// @vitest-environment node
/**
 * End-to-end proof of the evidence embedding lane against DISPOSABLE services:
 *   stub llama-server (/props, /v1/models, /tokenize, /v1/embeddings)  ->  produceEvidenceChunkEmbedding
 *   -> contract admission -> transactional evidence_vectors + projection-outbox write
 *   -> outbox worker reads PostgreSQL and verifies the stub Qdrant readback.
 *
 * Skipped unless EVIDENCE_E2E_DATABASE_URL points at a DISPOSABLE database whose evidence_vectors and
 * evidence_vector_projection_outbox tables are already present (and an `evidence(id uuid primary key)` table). The llama
 * server and Qdrant are in-process stubs, so this proves wiring and fail-closed behaviour, NOT live model qualification:
 * the receipt below is a fixture with a fresh timestamp, not the committed EMB-PROV-01 receipt.
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createEvidenceEmbeddingProducer, type EvidenceEmbeddingReceipt } from './evidence-embedding-producer.js';
import { persistEvidenceVectorForProjectionV1 } from './evidence-vector-persistence-v1.js';
import { projectEvidenceVectorOutboxBatchV1 } from './evidence-vector-projection-worker-v1.js';
import { createEvidenceVectorProjectionSchedulerV1 } from './evidence-vector-projection-scheduler-v1.js';
import { claimBatch, completeAnalysisJob, failAnalysisJob, type JobType } from '../analysis/analysis-jobs.js';
import { executeAnalysisJobStageV1, startWorker, stopWorker } from '../analysis/worker.js';
import { searchEvidenceVectorsPgvectorV1 } from '../retrieval/pgvector-semantic-search-v1.js';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  assertEvidenceEmbeddingAdmitted,
  evidenceQdrantPointId,
  looksLikePseudoVector,
} from './evidence-embedding-contract.js';

const uploadWorkerMocks = vi.hoisted(() => ({
  getSeaweedFile: vi.fn(),
  uploadSeaweedFile: vi.fn(),
  getSeaweedClient: vi.fn(() => ({ presignedGetObject: vi.fn(async () => 'https://scratch.invalid/evidence') })),
  classifyUploadedBytes: vi.fn(),
  processDocument: vi.fn(),
  processEvidenceDocumentCanonicalV1: vi.fn(),
}));

vi.mock('$lib/server/seaweed-client.js', () => ({
  getSeaweedFile: uploadWorkerMocks.getSeaweedFile,
  uploadSeaweedFile: uploadWorkerMocks.uploadSeaweedFile,
  getSeaweedClient: uploadWorkerMocks.getSeaweedClient,
}));
vi.mock('$lib/server/ingest/upload-classification-v1.js', () => ({ classifyUploadedBytes: uploadWorkerMocks.classifyUploadedBytes }));
vi.mock('$lib/server/document-processor.js', () => ({ processDocument: uploadWorkerMocks.processDocument }));
vi.mock('./process-evidence-document-v1.js', () => ({
  processEvidenceDocumentCanonicalV1: uploadWorkerMocks.processEvidenceDocumentCanonicalV1,
}));

const url = process.env.EVIDENCE_E2E_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const disposableDatabaseTarget = {
  protocol: 'postgres:',
  hostname: '127.0.0.1',
  port: '55441',
  database: 'evidence_e2e_disposable',
  username: 'scratch',
  password: 'scratch',
} as const;

function assertDisposableEvidenceDatabaseUrl(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Evidence E2E requires the dedicated disposable PostgreSQL URL');
  }

  if (
    parsed.protocol !== disposableDatabaseTarget.protocol
    || parsed.hostname !== disposableDatabaseTarget.hostname
    || parsed.port !== disposableDatabaseTarget.port
    || parsed.pathname !== `/${disposableDatabaseTarget.database}`
    || parsed.username !== disposableDatabaseTarget.username
    || parsed.password !== disposableDatabaseTarget.password
  ) {
    throw new Error('Evidence E2E requires loopback PostgreSQL on port 55441 with the dedicated evidence_e2e_disposable scratch identity');
  }
}

const MODEL_PATH = 'C:\\models\\embeddinggemma-300m-f16.gguf';
const ARTIFACT_SHA = 'bc843658e96d2e9cc7c3402332b158f0cc4f73e61b23cef9a41acee1c0d372b7';
const NOW = new Date('2026-10-30T00:00:00Z');
const EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';
const ANALYSIS_JOB_ID = '44444444-4444-4444-8444-444444444444';

describe('Evidence embedding E2E database safety gate', () => {
  const validUrl = 'postgres://scratch:scratch@127.0.0.1:55441/evidence_e2e_disposable';

  it('accepts only the dedicated loopback scratch database identity', () => {
    expect(() => assertDisposableEvidenceDatabaseUrl(validUrl)).not.toThrow();
  });

  it.each([
    'postgres://user:password@db.example.com:5432/legal_ai_db',
    'postgres://scratch:scratch@127.0.0.1:5434/legal_ai_db',
    'postgres://scratch:scratch@127.0.0.1:55441/other_database',
    'postgres://app:secret@127.0.0.1:55441/evidence_e2e_disposable',
    'postgres://scratch:wrong@127.0.0.1:55441/evidence_e2e_disposable',
  ])('rejects non-disposable target %s before connecting', (databaseUrl) => {
    expect(() => assertDisposableEvidenceDatabaseUrl(databaseUrl)).toThrow(/dedicated evidence_e2e_disposable scratch identity/);
  });
});
const SOURCE_REVISION = `sha256:${'a'.repeat(64)}`;

const receipt: EvidenceEmbeddingReceipt = {
  schema: 'atlas.emb-prov-01-embedding-provenance-receipt.v1',
  generatedAt: '2026-10-29T12:00:00Z',
  status: 'EMB_PROV_01_PROVEN',
  artifact: {
    modelPath: MODEL_PATH,
    liveArtifactSha256: ARTIFACT_SHA,
    recordedModelArtifactRevision: ARTIFACT_SHA,
    artifactChecksumMatchesRevision: true,
  },
  runtimeLoadedArtifact: { loadedMatchesArtifact: true },
  crossExecutorParity: { executorsAgree: true, parity: { dim: 768 } },
  provenanceFields: { serverModelAlias: 'embeddinggemma' },
};

function deterministicUnitVector(text: string, dimension = 768): number[] {
  const seed = createHash('sha256').update(text).digest().readUInt32LE(0) / 2 ** 32;
  const raw = Array.from({ length: dimension }, (_, i) => Math.sin((i + 1) * (0.37 + seed)) + Math.cos(i * i * 0.0011 + seed * 7));
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));
  return raw.map((value) => value / norm);
}

interface StubLlama {
  server: Server;
  baseUrl: string;
  setDimension(dimension: number): void;
  setModelPath(path: string): void;
}

function startStubLlama(): Promise<StubLlama> {
  let dimension = 768;
  let modelPath = MODEL_PATH;
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
    });
  const json = (res: ServerResponse, body: unknown) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    if (req.url === '/props') return json(res, { model_alias: 'embeddinggemma', model_path: modelPath });
    if (req.url === '/v1/models') return json(res, { data: [{ id: 'embeddinggemma', meta: { n_embd: dimension } }] });
    if (req.url === '/tokenize') return json(res, { tokens: [1, 2, 3, 4] });
    if (req.url === '/v1/embeddings') {
      const { input } = JSON.parse(await readBody(req)) as { input: string };
      return json(res, { model: 'embeddinggemma', data: [{ embedding: deterministicUnitVector(input, dimension) }] });
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        setDimension: (value) => (dimension = value),
        setModelPath: (value) => (modelPath = value),
      });
    });
  });
}

function startStubQdrant() {
  const points = new Map<string, { vector: number[]; payload: Record<string, unknown> }>();
  let failuresRemaining = 0;
  const server = createServer(async (req, res) => {
    if (req.method === 'PUT' && req.url?.startsWith('/collections/evidence_items/points')) {
      let data = '';
      for await (const chunk of req) data += chunk;
      for (const point of (JSON.parse(data) as { points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> }).points) {
        points.set(point.id, { vector: point.vector, payload: point.payload });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise<{ server: Server; baseUrl: string; points: typeof points; failNextUpsert(): void; upsert: (alias: string, input: { wait: true; points: Array<{ id: string; vector: { content: number[] }; payload: Record<string, unknown> }> }) => Promise<void>; retrieve: (alias: string, ids: string[]) => Promise<Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({
        server,
        baseUrl,
        points,
        failNextUpsert() { failuresRemaining += 1; },
        async upsert(_alias, input) {
          if (failuresRemaining > 0) {
            failuresRemaining -= 1;
            throw new Error('temporary Qdrant outage fixture');
          }
          const response = await fetch(`${baseUrl}/collections/evidence_items/points?wait=true`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: input.points.map((point) => ({ ...point, vector: point.vector.content })) }),
          });
          if (!response.ok) throw new Error(`QDRANT_STUB_UPSERT_FAILED:${response.status}`);
        },
        async retrieve(_alias, ids) {
          return ids.flatMap((id) => {
            const point = points.get(id);
            return point ? [{ id, ...point }] : [];
          });
        },
      });
    });
  });
}

const dialect = new PgDialect();

describeDb('evidence embedding lane end to end (stub llama-server, stub Qdrant, disposable PostgreSQL)', () => {
  let pool: pg.Pool;
  let llama: StubLlama;
  let qdrant: Awaited<ReturnType<typeof startStubQdrant>>;
  let scratchWorkerStarted = false;

  beforeAll(async () => {
    if (!url) throw new Error('EVIDENCE_E2E_DATABASE_URL is required');
    assertDisposableEvidenceDatabaseUrl(url);
    if (process.env.DATABASE_URL !== url) {
      throw new Error('Evidence E2E requires DATABASE_URL to equal the dedicated disposable database URL');
    }
    pool = new pg.Pool({ connectionString: url, max: 4 });
    const identity = await pool.query<{ database_name: string; version: string }>(
      'SELECT current_database() AS database_name, current_setting(\'server_version_num\') AS version'
    );
    if (identity.rows[0]?.database_name !== disposableDatabaseTarget.database) {
      throw new Error('Evidence E2E connected to an unexpected database');
    }
    const serverVersion = Number(identity.rows[0]?.version);
    if (serverVersion < 180000 || serverVersion >= 190000) {
      throw new Error('Evidence E2E requires PostgreSQL 18');
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS evidence (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id uuid,
        user_id integer,
        uploaded_by integer,
        title varchar(255) NOT NULL DEFAULT '',
        description text,
        file_path varchar(500),
        file_type varchar(100),
        file_size bigint,
        hash varchar(255),
        source varchar(255),
        date_obtained timestamptz,
        chain_of_custody jsonb,
        criminal_id uuid,
        evidence_type text,
        sub_type varchar(50),
        file_url text,
        file_name varchar(255),
        metadata jsonb,
        canvas_position jsonb DEFAULT '{}'::jsonb,
        uploaded_at timestamptz,
        evidence_number varchar(50),
        type varchar(100),
        summary text,
        pos_x integer,
        pos_y integer,
        collected_at timestamptz,
        collected_by varchar(255),
        mime_type varchar(100),
        tags jsonb,
        ai_tags jsonb,
        ai_analysis jsonb,
        ai_summary text,
        verified_at timestamptz,
        verified boolean DEFAULT false,
        status varchar(50),
        extracted_text text,
        entities jsonb DEFAULT '[]'::jsonb,
        keywords jsonb DEFAULT '[]'::jsonb,
        embedding vector(768),
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      ALTER TABLE evidence
        ADD COLUMN IF NOT EXISTS case_id uuid,
        ADD COLUMN IF NOT EXISTS user_id integer,
        ADD COLUMN IF NOT EXISTS uploaded_by integer,
        ADD COLUMN IF NOT EXISTS title varchar(255) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS description text,
        ADD COLUMN IF NOT EXISTS file_path varchar(500),
        ADD COLUMN IF NOT EXISTS file_type varchar(100),
        ADD COLUMN IF NOT EXISTS file_size bigint,
        ADD COLUMN IF NOT EXISTS hash varchar(255),
        ADD COLUMN IF NOT EXISTS source varchar(255),
        ADD COLUMN IF NOT EXISTS date_obtained timestamptz,
        ADD COLUMN IF NOT EXISTS chain_of_custody jsonb,
        ADD COLUMN IF NOT EXISTS criminal_id uuid,
        ADD COLUMN IF NOT EXISTS evidence_type text,
        ADD COLUMN IF NOT EXISTS sub_type varchar(50),
        ADD COLUMN IF NOT EXISTS file_url text,
        ADD COLUMN IF NOT EXISTS file_name varchar(255),
        ADD COLUMN IF NOT EXISTS metadata jsonb,
        ADD COLUMN IF NOT EXISTS canvas_position jsonb DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
        ADD COLUMN IF NOT EXISTS evidence_number varchar(50),
        ADD COLUMN IF NOT EXISTS type varchar(100),
        ADD COLUMN IF NOT EXISTS summary text,
        ADD COLUMN IF NOT EXISTS pos_x integer,
        ADD COLUMN IF NOT EXISTS pos_y integer,
        ADD COLUMN IF NOT EXISTS collected_at timestamptz,
        ADD COLUMN IF NOT EXISTS collected_by varchar(255),
        ADD COLUMN IF NOT EXISTS mime_type varchar(100),
        ADD COLUMN IF NOT EXISTS tags jsonb,
        ADD COLUMN IF NOT EXISTS ai_tags jsonb,
        ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
        ADD COLUMN IF NOT EXISTS ai_summary text,
        ADD COLUMN IF NOT EXISTS verified_at timestamptz,
        ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS status varchar(50),
        ADD COLUMN IF NOT EXISTS extracted_text text,
        ADD COLUMN IF NOT EXISTS entities jsonb DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS keywords jsonb DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS embedding vector(768),
        ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id uuid PRIMARY KEY,
        evidence_id uuid NOT NULL,
        case_id uuid,
        job_type varchar(64) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'queued',
        progress varchar(32) DEFAULT '0',
        result jsonb DEFAULT '{}'::jsonb,
        error text,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    llama = await startStubLlama();
    qdrant = await startStubQdrant();
  });

  afterAll(async () => {
    if (scratchWorkerStarted) stopWorker();
    await pool?.end();
    llama?.server.close();
    qdrant?.server.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    llama.setDimension(768);
    llama.setModelPath(MODEL_PATH);
    qdrant.points.clear();
    await pool.query('TRUNCATE analysis_jobs, evidence_vector_projection_outbox, evidence_vectors');
    await pool.query('INSERT INTO evidence (id) VALUES ($1) ON CONFLICT DO NOTHING', [EVIDENCE_ID]);
  });

  const producer = (modelReceipt: EvidenceEmbeddingReceipt = receipt) =>
    createEvidenceEmbeddingProducer(llama.baseUrl, { receipt: modelReceipt, tokenizerRevision: 'tok-rev', inputPolicyRevision: 'semantic-input-v1', now: NOW });

  async function persistChunk(text: string, chunkIndex: number, modelReceipt: EvidenceEmbeddingReceipt = receipt, project = true, sourceRevision = SOURCE_REVISION, evidenceId = EVIDENCE_ID) {
    const produced = await producer(modelReceipt)(text);
    const database = {
      execute: async (query: SQL) => {
        const compiled = dialect.sqlToQuery(query);
        const result = await pool.query(compiled.sql, compiled.params);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
      transaction: async <T>(operation: (transaction: { execute: (query: SQL) => Promise<{ rows: Array<Record<string, unknown>> }> }) => Promise<T>) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await operation({
            execute: async (query) => {
              const compiled = dialect.sqlToQuery(query);
              const response = await client.query(compiled.sql, compiled.params);
              return { rows: response.rows as Array<Record<string, unknown>> };
            },
          });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
    };
    const canonicalVector = await persistEvidenceVectorForProjectionV1(database, {
      evidenceId,
      sourceRevision,
      chunkIndex,
      content: text,
      embedding: produced.vector,
      model: produced.model,
      outputChecksum: produced.outputChecksum,
      provenance: produced.provenance,
      metadata: {
        source_revision: sourceRevision,
        embedding_provenance: produced.provenance,
      },
    });
    const pointId = await evidenceQdrantPointId({
      evidenceId,
      sourceRevision,
      chunkIndex,
      modelArtifactSha256: produced.provenance.modelArtifactSha256,
    });
    if (project) {
      const projection = await projectEvidenceVectorOutboxBatchV1(database, qdrant, {
        resolveCollectionAlias: async (lane) => lane === 'evidence_semantic_768' ? 'evidence_items' : '',
      });
      if (projection.claimed > 0) {
        const failedJobs = projection.completed === projection.claimed
          ? []
          : (await pool.query('SELECT status, last_error FROM evidence_vector_projection_outbox WHERE evidence_vector_id IN (SELECT id FROM evidence_vectors WHERE evidence_id = $1)', [evidenceId])).rows;
        expect(projection.completed, JSON.stringify({ projection, failedJobs })).toBe(projection.claimed);
      }
    }
    return { produced, pointId, canonicalVector, database };
  }

  it('runs uploaded source bytes through the durable upload processor to PostgreSQL and the projection receipt', async () => {
    const sourceBytes = Buffer.from('synthetic isolated legal PDF source');
    const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
    const extractedText = 'Synthetic exhibit text: the agreement was signed on May 3.';
    uploadWorkerMocks.getSeaweedFile.mockResolvedValue(sourceBytes);
    uploadWorkerMocks.processDocument.mockResolvedValue({ rawText: extractedText, extractionMethod: 'isolated-fixture' });
    let projectedPointId: string | undefined;
    uploadWorkerMocks.processEvidenceDocumentCanonicalV1.mockImplementation(async (input: {
      evidenceId: string;
      text: string;
      metadata: { source_revision: string };
    }) => {
      const persisted = await persistChunk(input.text, 0, receipt, true, input.metadata.source_revision, input.evidenceId);
      projectedPointId = persisted.pointId;
      return { chunkCount: 1, persistedCount: 1, sourceRevision: input.metadata.source_revision };
    });

    const metadata = {
      evidenceId: EVIDENCE_ID,
      caseId: null,
      objectKey: 'evidence/fixture/verified-upload.pdf',
      sourceSha256: sourceRevision,
      fileName: 'verified-upload.pdf',
      contentType: 'application/pdf',
      uploadedBy: 1,
    };
    await pool.query(
      `INSERT INTO analysis_jobs (id, evidence_id, case_id, job_type, status, result)
       VALUES ($1, $2, NULL, 'upload_pipeline', 'queued', $3::jsonb)`,
      [ANALYSIS_JOB_ID, EVIDENCE_ID, JSON.stringify(metadata)],
    );
    const executor = {
      execute: async (query: SQL) => {
        const compiled = dialect.sqlToQuery(query);
        const result = await pool.query(compiled.sql, compiled.params);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    };
    const claimed = await claimBatch('upload_pipeline', 1, executor);
    expect(claimed).toHaveLength(1);
    expect((await pool.query('SELECT status FROM analysis_jobs WHERE id = $1', [ANALYSIS_JOB_ID])).rows[0]?.status).toBe('running');

    const result = await executeAnalysisJobStageV1(
      claimed[0]!.jobType as JobType,
      claimed[0]!.evidenceId,
      claimed[0]!.result as Record<string, unknown>,
      claimed[0]!.id,
    );
    await completeAnalysisJob(claimed[0]!.id, result, executor);

    expect(result).toMatchObject({
      status: 'processed',
      evidenceId: EVIDENCE_ID,
      sourceRevision,
      representationId: 'semantic_768',
      canonicalStore: 'postgresql.evidence_vectors',
      chunkCount: 1,
      persistedCount: 1,
    });
    expect(uploadWorkerMocks.getSeaweedFile).toHaveBeenCalledWith('legal-evidence', 'evidence/fixture/verified-upload.pdf');
    expect(uploadWorkerMocks.processDocument).toHaveBeenCalledWith(expect.objectContaining({
      buffer: sourceBytes,
      fileName: 'verified-upload.pdf',
      mimeType: 'application/pdf',
      evidenceId: EVIDENCE_ID,
    }));
    expect(uploadWorkerMocks.processEvidenceDocumentCanonicalV1).toHaveBeenCalledWith(expect.objectContaining({
      evidenceId: EVIDENCE_ID,
      text: extractedText,
      sourceBytes,
      metadata: expect.objectContaining({ source_revision: sourceRevision, extractionMethod: 'isolated-fixture' }),
    }));

    const readback = (await pool.query(
      `SELECT ev.content, ev.source_revision, vector_dims(ev.embedding) AS dimension,
              outbox.status AS projection_status, outbox.verification_receipt IS NOT NULL AS projection_verified
         FROM evidence_vectors ev
         JOIN evidence_vector_projection_outbox outbox ON outbox.evidence_vector_id = ev.id
        WHERE ev.evidence_id = $1`,
      [EVIDENCE_ID],
    )).rows;
    expect(readback).toEqual([{
      content: extractedText,
      source_revision: sourceRevision,
      dimension: 768,
      projection_status: 'COMPLETED',
      projection_verified: true,
    }]);
    expect(projectedPointId).toBeTruthy();
    expect(qdrant.points.get(projectedPointId!)).toMatchObject({
      vector: expect.arrayContaining([expect.any(Number)]),
      payload: { evidence_id: EVIDENCE_ID, source_revision: sourceRevision, chunk_index: 0 },
    });
    const completedJob = (await pool.query(
      'SELECT status, progress, result->>\'status\' AS processing_status FROM analysis_jobs WHERE id = $1',
      [ANALYSIS_JOB_ID],
    )).rows[0];
    expect(completedJob).toEqual({ status: 'completed', progress: '100', processing_status: 'processed' });
    await expect(claimBatch('upload_pipeline', 1, executor)).resolves.toHaveLength(0);
  });

  it('writes the actual evidence form upload and durable job to the disposable PostgreSQL target', async () => {
    const sourceBytes = Buffer.from('%PDF-1.7 isolated scratch upload');
    const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
    const extractedText = 'Scratch upload exhibit: the signed agreement is dated May 3.';
    uploadWorkerMocks.uploadSeaweedFile.mockResolvedValue(undefined);
    uploadWorkerMocks.getSeaweedFile.mockResolvedValue(sourceBytes);
    uploadWorkerMocks.classifyUploadedBytes.mockReturnValue({
      isQuarantined: false,
      sourceRevision,
      observedMime: 'application/pdf',
      mimeStatus: 'matched',
      taxonomyGroup: 'legal_document',
      legalEvidenceTypeProposal: 'document',
    });
    uploadWorkerMocks.processDocument.mockResolvedValue({ rawText: extractedText, extractionMethod: 'isolated-fixture' });
    let projectionDatabase: Awaited<ReturnType<typeof persistChunk>>['database'] | undefined;
    uploadWorkerMocks.processEvidenceDocumentCanonicalV1.mockImplementation(async (input: {
      evidenceId: string;
      text: string;
      metadata: { source_revision: string };
    }) => {
      const persisted = await persistChunk(input.text, 0, receipt, false, input.metadata.source_revision, input.evidenceId);
      projectionDatabase = persisted.database;
      return { chunkCount: 1, persistedCount: 1, sourceRevision: input.metadata.source_revision, pointId: persisted.pointId };
    });

    startWorker();
    scratchWorkerStarted = true;
    const listenerDeadline = Date.now() + 10_000;
    let listenerReady = false;
    while (Date.now() < listenerDeadline) {
      const listener = await pool.query<{ ready: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
            WHERE application_name = 'parent-atlas-analysis-worker-listener'
         ) AS ready`,
      );
      if (listener.rows[0]?.ready) {
        listenerReady = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(listenerReady, 'analysis worker LISTEN connection did not start against disposable PostgreSQL').toBe(true);

    const formData = new FormData();
    formData.set('title', 'Scratch upload exhibit');
    formData.set('description', 'Disposable integration fixture');
    formData.set('file', new File([sourceBytes], 'scratch-exhibit.pdf', { type: 'application/pdf' }));
    const request = new Request('http://localhost/evidence', { method: 'POST', body: formData });
    const { actions } = await import('../../../routes/(app)/evidence/+page.server.js');
    const result = await actions.upload({ request, locals: { user: { id: '7' } } } as never) as {
      success?: boolean;
      evidence?: { id: string; fileUrl: string };
      jobId?: string;
      error?: string;
    };

    expect(result.success, result.error).toBe(true);
    expect(result.evidence?.id).toBeTruthy();
    expect(result.jobId).toBeTruthy();
    expect(uploadWorkerMocks.uploadSeaweedFile).toHaveBeenCalledWith(
      'legal-evidence',
      result.evidence!.fileUrl,
      sourceBytes,
      expect.any(Object),
    );
    const readback = (await pool.query(
      'SELECT e.id, e.hash, j.job_type, j.status, j.result FROM evidence e JOIN analysis_jobs j ON j.evidence_id = e.id WHERE e.id = $1 AND j.id = $2',
      [result.evidence!.id, result.jobId],
    )).rows[0];
    expect(readback).toMatchObject({
      id: result.evidence!.id,
      hash: sourceRevision,
      job_type: 'upload_pipeline',
      status: 'queued',
      result: expect.objectContaining({ evidenceId: result.evidence!.id, sourceSha256: sourceRevision }),
    });

    const processingDeadline = Date.now() + 15_000;
    let processed: Record<string, unknown> | undefined;
    while (Date.now() < processingDeadline) {
      const job = (await pool.query<{ status: string; result: Record<string, unknown> }>(
        'SELECT status, result FROM analysis_jobs WHERE id = $1',
        [result.jobId],
      )).rows[0];
      if (job?.status === 'completed') {
        processed = job.result;
        break;
      }
      if (job?.status === 'failed') throw new Error(`UPLOAD_PIPELINE_WORKER_FAILED: ${JSON.stringify(job.result)}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(processed, 'durable upload job was not completed by the worker listener/poll loop').toBeDefined();
    stopWorker();
    scratchWorkerStarted = false;
    expect(uploadWorkerMocks.getSeaweedFile).toHaveBeenCalledWith('legal-evidence', result.evidence!.fileUrl);
    expect(uploadWorkerMocks.processDocument).toHaveBeenCalledWith(expect.objectContaining({
      buffer: sourceBytes,
      fileName: 'scratch-exhibit.pdf',
      mimeType: 'application/pdf',
      evidenceId: result.evidence!.id,
    }));
    expect(processed).toMatchObject({
      status: 'processed',
      evidenceId: result.evidence!.id,
      sourceRevision,
      representationId: 'semantic_768',
      canonicalStore: 'postgresql.evidence_vectors',
      chunkCount: 1,
      persistedCount: 1,
    });
    expect((await pool.query(
      'SELECT status FROM evidence_vector_projection_outbox WHERE evidence_vector_id IN (SELECT id FROM evidence_vectors WHERE evidence_id = $1)',
      [result.evidence!.id],
    )).rows).toEqual([{ status: 'PENDING' }]);
    let resolveScheduledProjection: (() => void) | undefined;
    const scheduledProjectionFinished = new Promise<void>((resolve) => { resolveScheduledProjection = resolve; });
    let scheduledProjectionResult: Awaited<ReturnType<typeof projectEvidenceVectorOutboxBatchV1>> | undefined;
    const scheduler = createEvidenceVectorProjectionSchedulerV1({
      enabled: true,
      intervalMs: 60_000,
      runBatch: async () => {
        try {
          if (!projectionDatabase) throw new Error('EVIDENCE_E2E_PROJECTION_DATABASE_MISSING');
          scheduledProjectionResult = await projectEvidenceVectorOutboxBatchV1(projectionDatabase, qdrant, {
            resolveCollectionAlias: async (lane) => lane === 'evidence_semantic_768' ? 'evidence_items' : '',
          });
        } finally {
          resolveScheduledProjection?.();
        }
      },
    });
    expect(scheduler.start()).toBe(true);
    await scheduledProjectionFinished;
    await scheduler.stop();
    expect(scheduledProjectionResult).toMatchObject({ claimed: 1, completed: 1, retried: 0, deadLettered: 0 });
    const canonicalReadback = (await pool.query(
      `SELECT ev.content, ev.source_revision, vector_dims(ev.embedding) AS dimension,
              outbox.status AS projection_status, outbox.verification_receipt IS NOT NULL AS projection_verified,
              job.status AS job_status
         FROM evidence_vectors ev
         JOIN evidence_vector_projection_outbox outbox ON outbox.evidence_vector_id = ev.id
         JOIN analysis_jobs job ON job.evidence_id = ev.evidence_id AND job.job_type = 'upload_pipeline'
        WHERE ev.evidence_id = $1`,
      [result.evidence!.id],
    )).rows;
    expect(canonicalReadback).toEqual([{
      content: extractedText,
      source_revision: sourceRevision,
      dimension: 768,
      projection_status: 'COMPLETED',
      projection_verified: true,
      job_status: 'completed',
    }]);
    const queryVector = (await producer()(extractedText)).vector;
    const searchHits = await searchEvidenceVectorsPgvectorV1(queryVector, { limit: 5 }, pool);
    expect(searchHits).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceId: result.evidence!.id, content: extractedText }),
    ]));
    expect(searchHits.find((hit) => hit.evidenceId === result.evidence!.id)?.similarity).toBeGreaterThan(0.99);
  });

  it('does not report completion when the durable job row is missing', async () => {
    const executor = {
      execute: async (query: SQL) => {
        const compiled = dialect.sqlToQuery(query);
        const result = await pool.query(compiled.sql, compiled.params);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    };
    await expect(completeAnalysisJob(
      '55555555-5555-4555-8555-555555555555',
      { status: 'processed' },
      executor,
    )).rejects.toThrow('ANALYSIS_JOB_COMPLETION_ROW_MISSING');
  });

  it('persists an upload processing failure instead of marking the durable job completed', async () => {
    uploadWorkerMocks.getSeaweedFile.mockRejectedValue(new Error('fixture object store unavailable'));
    const metadata = {
      evidenceId: EVIDENCE_ID,
      caseId: null,
      objectKey: 'evidence/fixture/failing-upload.pdf',
      sourceSha256: SOURCE_REVISION,
      fileName: 'failing-upload.pdf',
      contentType: 'application/pdf',
      uploadedBy: 1,
    };
    await pool.query(
      `INSERT INTO analysis_jobs (id, evidence_id, case_id, job_type, status, result)
       VALUES ($1, $2, NULL, 'upload_pipeline', 'queued', $3::jsonb)`,
      [ANALYSIS_JOB_ID, EVIDENCE_ID, JSON.stringify(metadata)],
    );
    const executor = {
      execute: async (query: SQL) => {
        const compiled = dialect.sqlToQuery(query);
        const result = await pool.query(compiled.sql, compiled.params);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    };
    const [claimed] = await claimBatch('upload_pipeline', 1, executor);
    expect(claimed).toBeDefined();
    await expect(executeAnalysisJobStageV1(
      claimed!.jobType as JobType,
      claimed!.evidenceId,
      claimed!.result as Record<string, unknown>,
      claimed!.id,
    )).rejects.toThrow('fixture object store unavailable');

    await failAnalysisJob(claimed!.id, 'fixture object store unavailable', executor);
    const failed = await pool.query(
      'SELECT status, error, completed_at FROM analysis_jobs WHERE id = $1',
      [ANALYSIS_JOB_ID],
    );
    expect(failed.rows[0]).toMatchObject({
      status: 'failed',
      error: 'fixture object store unavailable',
    });
    expect(failed.rows[0]?.completed_at).toBeInstanceOf(Date);
  });

  it('matches the Drizzle projection-outbox column and foreign-key contract', async () => {
    const columns = (await pool.query(
      `SELECT column_name, data_type, character_maximum_length, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'evidence_vector_projection_outbox'
          AND column_name = ANY($1::text[])`,
      [['status', 'available_at', 'created_at', 'updated_at']],
    )).rows;
    const byName = new Map(columns.map((column) => [column.column_name, column]));
    expect(byName.get('status')).toMatchObject({ data_type: 'character varying', character_maximum_length: 24 });
    expect(String(byName.get('status')?.column_default)).toContain('PENDING');
    for (const columnName of ['available_at', 'created_at', 'updated_at']) {
      expect(String(byName.get(columnName)?.column_default)).toContain('clock_timestamp()');
    }

    const foreignKey = await pool.query(
      `SELECT delete_rule FROM information_schema.referential_constraints
        WHERE constraint_schema = 'public' AND constraint_name = 'evidence_vector_projection_outbox_vector_fk'`,
    );
    expect(foreignKey.rows).toEqual([{ delete_rule: 'RESTRICT' }]);
  });

  it('produces, admits, persists and projects a qualified chunk with read-back parity', async () => {
    const { produced, pointId, canonicalVector } = await persistChunk('Exhibit A: the lease was signed on May 3.', 0);

    expect(produced.vector).toHaveLength(768);
    expect(looksLikePseudoVector(produced.vector)).toBe(false);
    expect(produced.provenance.modelArtifactSha256).toBe(`sha256:${ARTIFACT_SHA}`);
    expect(produced.provenance.modelReceipt).toEqual({ provider: 'llama-server', artifactIdentityBound: true, dimensionBound: true, runtimeReady: true });

    const row = (await pool.query(
      `SELECT embedding_type, source_field, vector_dims(embedding) AS dims,
              vector_to_float4(embedding, 768, false) AS embedding_float4,
              metadata->'embedding_provenance'->>'modelArtifactSha256' AS sha,
              metadata->>'embedding_output_sha256' AS output_sha
       FROM evidence_vectors WHERE evidence_id = $1`,
      [EVIDENCE_ID]
    )).rows[0];
    expect(row.embedding_type).toBe('evidence_text_semantic_768');
    expect(row.source_field).toBe('canonical_evidence_text');
    expect(row.dims).toBe(768);
    expect(row.sha).toBe(`sha256:${ARTIFACT_SHA}`);
    expect(row.output_sha).toBe(produced.outputChecksum);
    const stored = validateSemantic768OutputV1(row.embedding_float4 as number[]);
    expect(digestSemantic768OutputV1(stored)).toBe(produced.outputChecksum);
    expect(canonicalVector).toEqual(Array.from(stored));

    expect(qdrant.points.get(pointId)).toMatchObject({
      vector: canonicalVector,
      payload: { evidence_id: EVIDENCE_ID, chunk_index: 0, embedding_output_sha256: produced.outputChecksum },
    });
  });

  it('rolls back the canonical vector when the projection outbox insert fails', async () => {
    await pool.query(`
      CREATE FUNCTION public.reject_evidence_projection_outbox_test_v1()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected projection outbox failure';
      END;
      $$
    `);
    await pool.query(`
      CREATE TRIGGER reject_evidence_projection_outbox_test_v1
      BEFORE INSERT ON evidence_vector_projection_outbox
      FOR EACH ROW EXECUTE FUNCTION public.reject_evidence_projection_outbox_test_v1()
    `);

    try {
      await expect(persistChunk('Atomic rollback fixture', 91, receipt, false))
        .rejects.toThrow('injected projection outbox failure');
      expect((await pool.query('SELECT count(*)::int AS n FROM evidence_vectors')).rows[0].n).toBe(0);
      expect((await pool.query('SELECT count(*)::int AS n FROM evidence_vector_projection_outbox')).rows[0].n).toBe(0);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_evidence_projection_outbox_test_v1 ON evidence_vector_projection_outbox');
      await pool.query('DROP FUNCTION IF EXISTS public.reject_evidence_projection_outbox_test_v1()');
    }
  });

  it('is idempotent under retry: same row, same Qdrant point', async () => {
    const first = await persistChunk('Exhibit B text', 1);
    const second = await persistChunk('Exhibit B text', 1);
    expect(second.pointId).toBe(first.pointId);
    expect((await pool.query('SELECT count(*)::int AS n FROM evidence_vectors')).rows[0].n).toBe(1);
    expect(qdrant.points.size).toBe(1);
  });

  it('retains a PostgreSQL projection event after Qdrant failure and retries to verified completion', async () => {
    const { pointId, database } = await persistChunk('Temporary Qdrant outage fixture', 8, receipt, false);
    qdrant.failNextUpsert();
    const options = { resolveCollectionAlias: async () => 'evidence_items', retryBaseMs: 60_000 };
    const failed = await projectEvidenceVectorOutboxBatchV1(database, qdrant, options);

    expect(failed).toMatchObject({ claimed: 1, completed: 0, retried: 1, deadLettered: 0 });
    const pending = (await pool.query(
      'SELECT status, attempt_count, last_error, available_at > clock_timestamp() AS delayed FROM evidence_vector_projection_outbox WHERE qdrant_point_id = $1',
      [pointId],
    )).rows[0];
    expect(pending).toMatchObject({ status: 'RETRY', attempt_count: 1, delayed: true });
    expect(pending.last_error).toContain('temporary Qdrant outage fixture');
    expect((await pool.query('SELECT count(*)::int AS n FROM evidence_vectors')).rows[0].n).toBe(1);
    expect(qdrant.points.has(pointId)).toBe(false);

    await pool.query('UPDATE evidence_vector_projection_outbox SET available_at = clock_timestamp() WHERE qdrant_point_id = $1', [pointId]);
    const retried = await projectEvidenceVectorOutboxBatchV1(database, qdrant, options);
    expect(retried).toMatchObject({ claimed: 1, completed: 1, retried: 0, deadLettered: 0 });
    expect((await pool.query('SELECT status, verification_receipt IS NOT NULL AS verified FROM evidence_vector_projection_outbox WHERE qdrant_point_id = $1', [pointId])).rows[0])
      .toEqual({ status: 'COMPLETED', verified: true });
    expect(qdrant.points.get(pointId)?.vector).toHaveLength(768);
  });

  it('allows only one concurrent projector to claim and publish a pending evidence vector', async () => {
    const { pointId, database } = await persistChunk('Concurrent projection claim fixture', 13, receipt, false);
    const options = { resolveCollectionAlias: async () => 'evidence_items' };
    const outcomes = await Promise.all([
      projectEvidenceVectorOutboxBatchV1(database, qdrant, options),
      projectEvidenceVectorOutboxBatchV1(database, qdrant, options),
    ]);

    expect(outcomes.reduce((total, result) => total + result.claimed, 0)).toBe(1);
    expect(outcomes.reduce((total, result) => total + result.completed, 0)).toBe(1);
    expect(qdrant.points.size).toBe(1);
    expect(qdrant.points.has(pointId)).toBe(true);
    expect((await pool.query(
      'SELECT status, attempt_count, verification_receipt IS NOT NULL AS verified FROM evidence_vector_projection_outbox WHERE qdrant_point_id = $1',
      [pointId],
    )).rows).toEqual([{ status: 'COMPLETED', attempt_count: 1, verified: true }]);
  });

  it('keeps projection disabled without touching the outbox, then drains a scheduled batch to verified Qdrant readback', async () => {
    const { pointId, database } = await persistChunk('Scheduled projection fixture', 12, receipt, false);
    const runBatch = vi.fn(async () => projectEvidenceVectorOutboxBatchV1(database, qdrant, {
      resolveCollectionAlias: async (lane) => lane === 'evidence_semantic_768' ? 'evidence_items' : '',
    }));
    const disabled = createEvidenceVectorProjectionSchedulerV1({ enabled: false, runBatch });

    expect(disabled.start()).toBe(false);
    await disabled.stop();
    expect(runBatch).not.toHaveBeenCalled();
    expect((await pool.query(
      'SELECT status FROM evidence_vector_projection_outbox WHERE qdrant_point_id = $1',
      [pointId],
    )).rows).toEqual([{ status: 'PENDING' }]);
    expect(qdrant.points.has(pointId)).toBe(false);

    let resolveBatch: (() => void) | undefined;
    const batchFinished = new Promise<void>((resolve) => { resolveBatch = resolve; });
    let batchResult: Awaited<ReturnType<typeof projectEvidenceVectorOutboxBatchV1>> | undefined;
    const enabled = createEvidenceVectorProjectionSchedulerV1({
      enabled: true,
      intervalMs: 60_000,
      runBatch: async () => {
        try {
          batchResult = await runBatch();
        } finally {
          resolveBatch?.();
        }
      },
    });
    expect(enabled.start()).toBe(true);
    await batchFinished;
    await enabled.stop();

    expect(runBatch).toHaveBeenCalledOnce();
    expect(batchResult).toMatchObject({ claimed: 1, completed: 1, retried: 0, deadLettered: 0 });
    expect((await pool.query(
      'SELECT status, verification_receipt IS NOT NULL AS verified FROM evidence_vector_projection_outbox WHERE qdrant_point_id = $1',
      [pointId],
    )).rows).toEqual([{ status: 'COMPLETED', verified: true }]);
    expect(qdrant.points.get(pointId)?.vector).toHaveLength(768);
  });

  it('refuses to overwrite a canonical row with another model artifact revision', async () => {
    const text = 'same evidence content under a different encoder artifact';
    const first = await persistChunk(text, 4);
    const secondArtifactSha = 'b'.repeat(64);
    const secondModelPath = 'C:\\models\\embeddinggemma-300m-other.gguf';
    const secondReceipt: EvidenceEmbeddingReceipt = {
      ...receipt,
      artifact: {
        ...receipt.artifact,
        modelPath: secondModelPath,
        liveArtifactSha256: secondArtifactSha,
        recordedModelArtifactRevision: secondArtifactSha,
      },
    };
    llama.setModelPath(secondModelPath);
    await expect(persistChunk(text, 4, secondReceipt)).rejects.toThrow(/EVIDENCE_VECTOR_COMMITTED_READBACK_NOT_UNIQUE/);

    const row = (await pool.query(
      `SELECT metadata->'embedding_provenance'->>'modelArtifactSha256' AS sha FROM evidence_vectors WHERE evidence_id = $1`,
      [EVIDENCE_ID],
    )).rows[0];
    expect(row.sha).toBe(first.produced.provenance.modelArtifactSha256);
    expect(qdrant.points.size).toBe(1);
  });

  it('retrieves the nearest stored chunk by cosine distance', async () => {
    await persistChunk('alpha lease agreement', 0);
    await persistChunk('beta witness statement', 1);
    const query = (await producer()('alpha lease agreement')).vector;
    const hits = await searchEvidenceVectorsPgvectorV1(query, { limit: 5 }, pool);
    expect(hits[0]).toMatchObject({
      evidenceId: EVIDENCE_ID,
      chunkIndex: 0,
      content: 'alpha lease agreement',
    });
    expect(hits[0]?.similarity).toBeGreaterThan(0.99);
  });

  it('fails closed when the receipt is stale', async () => {
    const stale = createEvidenceEmbeddingProducer(llama.baseUrl, {
      receipt, tokenizerRevision: 'tok', inputPolicyRevision: 'p', now: new Date('2026-12-30T00:00:00Z'),
    });
    await expect(stale('text')).rejects.toThrow(/EVIDENCE_EMBEDDING_RUNTIME_NOT_BOUND/);
  });

  it('fails closed when the live GGUF path differs from the receipt artifact', async () => {
    llama.setModelPath('C:\\models\\some-other-model.gguf');
    await expect(producer()('text')).rejects.toThrow(/EVIDENCE_EMBEDDING_RUNTIME_NOT_BOUND/);
  });

  it('fails closed when the server does not report 768 dimensions', async () => {
    llama.setDimension(384);
    await expect(producer()('text')).rejects.toThrow(/EVIDENCE_EMBEDDING_RUNTIME_NOT_BOUND|SEMANTIC_768_INVALID_DIMENSIONS/);
  });

  it('fails closed when the llama-server lane is unreachable and writes nothing', async () => {
    const down = createEvidenceEmbeddingProducer('http://127.0.0.1:1', { receipt, tokenizerRevision: 'tok', inputPolicyRevision: 'p', now: NOW });
    await expect(down('text')).rejects.toThrow(/EVIDENCE_EMBEDDING_RUNTIME_NOT_BOUND/);
    expect((await pool.query('SELECT count(*)::int AS n FROM evidence_vectors')).rows[0].n).toBe(0);
  });

  it('refuses to persist a pseudo-vector even with otherwise valid provenance', async () => {
    const text = 'Exhibit C';
    const produced = await producer()(text);
    const hash = createHash('sha256').update(text).digest();
    const pseudo = Array.from({ length: 768 }, (_, i) => hash[i % hash.length] / 255);
    expect(() =>
      assertEvidenceEmbeddingAdmitted({
        evidenceId: EVIDENCE_ID, sourceRevision: SOURCE_REVISION, chunkIndex: 0, content: text, vector: pseudo, provenance: produced.provenance,
      })
    ).toThrow(/PSEUDO_VECTOR_REJECTED/);
  });
});
