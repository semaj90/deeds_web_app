// @vitest-environment node
/**
 * End-to-end proof of the evidence embedding lane against DISPOSABLE services:
 *   stub llama-server (/props, /v1/models, /tokenize, /v1/embeddings)  ->  produceEvidenceChunkEmbedding
 *   -> contract admission -> evidence_vectors upsert (real PostgreSQL 18 + pgvector, migrated schema)
 *   -> deterministic Qdrant point id -> stub Qdrant upsert, with retry idempotency and fail-closed negatives.
 *
 * Skipped unless EVIDENCE_E2E_DATABASE_URL points at a DISPOSABLE database whose evidence_vectors table already has
 * 20261029_evidence_vectors_semantic_768.sql applied (and an `evidence(id uuid primary key)` table). The llama server and
 * Qdrant are in-process stubs, so this proves wiring and fail-closed behaviour, NOT live model/receipt qualification:
 * the receipt below is a fixture with a fresh timestamp, not the committed EMB-PROV-01 receipt.
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createEvidenceEmbeddingProducer, type EvidenceEmbeddingReceipt } from './evidence-embedding-producer.js';
import {
  assertEvidenceEmbeddingAdmitted,
  evidenceQdrantPointId,
  looksLikePseudoVector,
} from './evidence-embedding-contract.js';

const url = process.env.EVIDENCE_E2E_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const MODEL_PATH = 'C:\\models\\embeddinggemma-300m-f16.gguf';
const ARTIFACT_SHA = 'bc843658e96d2e9cc7c3402332b158f0cc4f73e61b23cef9a41acee1c0d372b7';
const NOW = new Date('2026-10-30T00:00:00Z');
const EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';
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
  return new Promise<{ server: Server; baseUrl: string; points: typeof points }>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, points }));
  });
}

// Mirrors the INSERT in routes/api/evidence/upload/+server.ts::storeChunkVector.
const UPSERT = `
  INSERT INTO evidence_vectors (evidence_id, chunk_index, content, embedding, analysis_type, metadata, model, source_revision, embedding_type, source_field)
  VALUES ($1, $2, $3, $4::vector, 'upload-embedding', $5::jsonb, $6, $7, $8, $9)
  ON CONFLICT (evidence_id, source_revision, chunk_index)
  WHERE source_revision IS NOT NULL AND chunk_index IS NOT NULL
  DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, analysis_type = EXCLUDED.analysis_type,
    metadata = EXCLUDED.metadata, model = EXCLUDED.model`;

describeDb('evidence embedding lane end to end (stub llama-server, stub Qdrant, disposable PostgreSQL)', () => {
  let pool: pg.Pool;
  let llama: StubLlama;
  let qdrant: Awaited<ReturnType<typeof startStubQdrant>>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    llama = await startStubLlama();
    qdrant = await startStubQdrant();
  });

  afterAll(async () => {
    await pool?.end();
    llama?.server.close();
    qdrant?.server.close();
  });

  beforeEach(async () => {
    llama.setDimension(768);
    llama.setModelPath(MODEL_PATH);
    qdrant.points.clear();
    await pool.query('TRUNCATE evidence_vectors');
    await pool.query('INSERT INTO evidence (id) VALUES ($1) ON CONFLICT DO NOTHING', [EVIDENCE_ID]);
  });

  const producer = () =>
    createEvidenceEmbeddingProducer(llama.baseUrl, { receipt, tokenizerRevision: 'tok-rev', inputPolicyRevision: 'semantic-input-v1', now: NOW });

  async function persistChunk(text: string, chunkIndex: number) {
    const produced = await producer()(text);
    const admission = assertEvidenceEmbeddingAdmitted({
      evidenceId: EVIDENCE_ID,
      sourceRevision: SOURCE_REVISION,
      chunkIndex,
      content: text,
      vector: produced.vector,
      provenance: produced.provenance,
    });
    await pool.query(UPSERT, [
      EVIDENCE_ID,
      chunkIndex,
      text,
      `[${produced.vector.join(',')}]`,
      JSON.stringify({ source_revision: SOURCE_REVISION, embedding_provenance: produced.provenance }),
      produced.model,
      SOURCE_REVISION,
      admission.embeddingType,
      admission.sourceField,
    ]);
    const pointId = await evidenceQdrantPointId({
      evidenceId: EVIDENCE_ID,
      sourceRevision: SOURCE_REVISION,
      chunkIndex,
      modelArtifactSha256: produced.provenance.modelArtifactSha256,
    });
    const response = await fetch(`${qdrant.baseUrl}/collections/evidence_items/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [{ id: pointId, vector: produced.vector, payload: { evidence_id: EVIDENCE_ID, chunk_index: chunkIndex } }] }),
    });
    expect(response.ok).toBe(true);
    return { produced, pointId };
  }

  it('produces, admits, persists and projects a qualified chunk with read-back parity', async () => {
    const { produced, pointId } = await persistChunk('Exhibit A: the lease was signed on May 3.', 0);

    expect(produced.vector).toHaveLength(768);
    expect(looksLikePseudoVector(produced.vector)).toBe(false);
    expect(produced.provenance.modelArtifactSha256).toBe(`sha256:${ARTIFACT_SHA}`);
    expect(produced.provenance.modelReceipt).toEqual({ provider: 'llama-server', artifactIdentityBound: true, dimensionBound: true, runtimeReady: true });

    const row = (await pool.query(
      `SELECT embedding_type, source_field, vector_dims(embedding) AS dims, embedding::text AS embedding, metadata->'embedding_provenance'->>'modelArtifactSha256' AS sha
       FROM evidence_vectors WHERE evidence_id = $1`,
      [EVIDENCE_ID]
    )).rows[0];
    expect(row.embedding_type).toBe('evidence_text_semantic_768');
    expect(row.source_field).toBe('canonical_evidence_text');
    expect(row.dims).toBe(768);
    expect(row.sha).toBe(`sha256:${ARTIFACT_SHA}`);
    // PostgreSQL stores float4: parity with the produced vector within float32 precision.
    const stored = (JSON.parse(row.embedding) as number[]);
    expect(stored.every((value, i) => Math.abs(value - produced.vector[i]) < 1e-6)).toBe(true);

    expect(qdrant.points.get(pointId)?.payload).toMatchObject({ evidence_id: EVIDENCE_ID, chunk_index: 0 });
  });

  it('is idempotent under retry: same row, same Qdrant point', async () => {
    const first = await persistChunk('Exhibit B text', 1);
    const second = await persistChunk('Exhibit B text', 1);
    expect(second.pointId).toBe(first.pointId);
    expect((await pool.query('SELECT count(*)::int AS n FROM evidence_vectors')).rows[0].n).toBe(1);
    expect(qdrant.points.size).toBe(1);
  });

  it('retrieves the nearest stored chunk by cosine distance', async () => {
    await persistChunk('alpha lease agreement', 0);
    await persistChunk('beta witness statement', 1);
    const query = (await producer()('alpha lease agreement')).vector;
    const top = (await pool.query(
      `SELECT chunk_index FROM evidence_vectors ORDER BY embedding <=> $1::vector LIMIT 1`,
      [`[${query.join(',')}]`]
    )).rows[0];
    expect(top.chunk_index).toBe(0);
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
