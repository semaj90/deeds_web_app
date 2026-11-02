// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { pool } from '$lib/server/db/client.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { persistEvidenceVectorForProjectionV1 } from './evidence-vector-persistence-v1.js';
import {
  projectEvidenceVectorOutboxBatchV1,
  type EvidenceProjectionQdrantV1,
} from './evidence-vector-projection-worker-v1.js';
import {
  evidenceQdrantPointId,
  evidenceInputSha256,
  EVIDENCE_INPUT_RECIPE_REVISION,
} from './evidence-embedding-contract.js';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import { searchEvidenceVectorsPgvectorV1 } from '../retrieval/pgvector-semantic-search-v1.js';

const dialect = new PgDialect();

const database = {
  execute: async (query: SQL) => {
    const compiled = dialect.sqlToQuery(query);
    const response = await pool.query(compiled.sql, compiled.params);
    return { rows: response.rows as Array<Record<string, unknown>> };
  },
  transaction: async <T>(operation: (tx: { execute: (q: SQL) => Promise<{ rows: Array<Record<string, unknown>> }> }) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation({
        execute: async (query: SQL) => {
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

function deterministicUnitVector(seedStr: string, dimension = 768): number[] {
  const seed = createHash('sha256').update(seedStr).digest().readUInt32LE(0) / 2 ** 32;
  const raw = Array.from({ length: dimension }, (_, i) => Math.sin((i + 1) * (0.37 + seed)) + Math.cos(i * i * 0.0011 + seed * 7));
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));
  return raw.map((value) => value / norm);
}

const CANARY_CASE_ID = 'ca000000-0000-4000-8000-000000000001';
const CANARY_EVIDENCE_ID = 'ca000000-0000-4000-8000-000000000002';
const ARTIFACT_HEX = 'bc843658e96d2e9cc7c3402332b158f0cc4f73e61b23cef9a41acee1c0d372b7';
const ARTIFACT_SHA256 = `sha256:${ARTIFACT_HEX}`;
const SOURCE_REVISION = `sha256:${'c'.repeat(64)}`;
const CHUNK_TEXT = 'CANARY EXHIBIT 701: Comprehensive fiduciary and contractual ledger entry under Parent Atlas governance.';

describe('Live Canary: End-to-End PostgreSQL 18 Outbox -> Qdrant Projection Pipeline', () => {
  let qdrantPointId: string;
  let qdrantAdapter: EvidenceProjectionQdrantV1;

  beforeAll(async () => {
    const qdrantClient = getQdrantClient();
    qdrantAdapter = {
      async upsert(collectionAlias, input) {
        return qdrantClient.upsert(collectionAlias, input);
      },
      async retrieve(collectionAlias, ids, options) {
        const points = await qdrantClient.retrieve(collectionAlias, {
          ids,
          with_payload: options.with_payload,
          with_vector: options.with_vector,
        });
        return points as Array<{ id: string | number; vector?: number[] | Record<string, number[]>; payload?: Record<string, unknown> | null }>;
      },
    };

    // Ensure dummy parent case & evidence record exists for foreign key integrity
    await pool.query(`
      INSERT INTO cases (id, title, description, case_number, status, priority)
      VALUES ($1, 'Canary E2E Case', 'Canary testing outbox pipeline', 'CANARY-2026-01', 'open', 'medium')
      ON CONFLICT (id) DO NOTHING
    `, [CANARY_CASE_ID]);

    await pool.query(`
      INSERT INTO evidence (id, case_id, title, description, file_name, file_url, file_type, file_size, status, evidence_type, canvas_position)
      VALUES ($1, $2, 'Canary Exhibit 701', 'Canary testing document', 'canary-701.txt', 'evidence/canary-701.txt', 'text/plain', 128, 'active', 'document'::evidence_type, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [CANARY_EVIDENCE_ID, CANARY_CASE_ID]);
  });

  afterAll(async () => {
    // Clean up Qdrant point if created
    if (qdrantPointId) {
      try {
        const qdrantClient = getQdrantClient();
        await qdrantClient.delete('evidence_items', {
          wait: true,
          points: [qdrantPointId],
        });
      } catch (err) {
        console.warn('Qdrant cleanup warning:', err);
      }
    }

    // Clean up PostgreSQL test records
    await pool.query(`DELETE FROM evidence_vector_projection_outbox WHERE evidence_vector_id IN (SELECT id FROM evidence_vectors WHERE evidence_id = $1)`, [CANARY_EVIDENCE_ID]);
    await pool.query(`DELETE FROM evidence_vectors WHERE evidence_id = $1`, [CANARY_EVIDENCE_ID]);
    await pool.query(`DELETE FROM evidence WHERE id = $1`, [CANARY_EVIDENCE_ID]);
    await pool.query(`DELETE FROM cases WHERE id = $1`, [CANARY_CASE_ID]);
  });

  it('atomically commits vector + outbox ticket and projects to live Qdrant with verified readback', async () => {
    // 1. Prepare valid 768-D unit vector and contract-admitted provenance
    const vector = validateSemantic768OutputV1(deterministicUnitVector('canary-vector-test-01'));
    const outputChecksum = digestSemantic768OutputV1(vector);
    const inputSha256 = evidenceInputSha256(CHUNK_TEXT);

    qdrantPointId = await evidenceQdrantPointId({
      evidenceId: CANARY_EVIDENCE_ID,
      sourceRevision: SOURCE_REVISION,
      chunkIndex: 0,
      modelArtifactSha256: ARTIFACT_SHA256,
    });

    const provenance = {
      modelArtifactSha256: ARTIFACT_SHA256,
      modelReceipt: {
        provider: 'llama-server' as const,
        artifactIdentityBound: true,
        dimensionBound: true,
        runtimeReady: true,
      },
      inputRecipeRevision: EVIDENCE_INPUT_RECIPE_REVISION,
      inputSha256,
    };

    // 2. Persist vector + outbox in SINGLE PostgreSQL transaction
    const persistedVector = await persistEvidenceVectorForProjectionV1(database, {
      evidenceId: CANARY_EVIDENCE_ID,
      sourceRevision: SOURCE_REVISION,
      chunkIndex: 0,
      content: CHUNK_TEXT,
      embedding: Array.from(vector),
      model: 'embeddinggemma',
      outputChecksum,
      provenance,
      metadata: {
        source_revision: SOURCE_REVISION,
        embedding_provenance: provenance,
      },
    });

    expect(persistedVector).toHaveLength(768);

    // 3. Verify PostgreSQL outbox state is PENDING
    const outboxPendingRes = await pool.query(
      `SELECT evidence_vector_id, status, attempt_count, max_attempts FROM evidence_vector_projection_outbox WHERE qdrant_point_id = $1`,
      [qdrantPointId]
    );
    expect(outboxPendingRes.rows).toHaveLength(1);
    const pendingRow = outboxPendingRes.rows[0];
    expect(pendingRow.status).toBe('PENDING');
    expect(pendingRow.attempt_count).toBe(0);
    const evidenceVectorId = pendingRow.evidence_vector_id;

    // 4. Run projection worker sweep
    const workerResult = await projectEvidenceVectorOutboxBatchV1(database, qdrantAdapter, {
      resolveCollectionAlias: async () => 'evidence_items',
      limit: 10,
      leaseSeconds: 30,
    });

    expect(workerResult.claimed).toBeGreaterThanOrEqual(1);
    expect(workerResult.completed).toBeGreaterThanOrEqual(1);

    // 5. Verify PostgreSQL outbox state is COMPLETED with cryptographic receipt
    const outboxCompletedRes = await pool.query(
      `SELECT status, attempt_count, completed_at, verification_receipt FROM evidence_vector_projection_outbox WHERE qdrant_point_id = $1`,
      [qdrantPointId]
    );
    expect(outboxCompletedRes.rows).toHaveLength(1);
    const outboxRow = outboxCompletedRes.rows[0];
    expect(outboxRow.status).toBe('COMPLETED');
    expect(outboxRow.attempt_count).toBe(1);
    expect(outboxRow.completed_at).not.toBeNull();
    expect(outboxRow.verification_receipt).toBeDefined();
    expect(outboxRow.verification_receipt.schema).toBe('evidence-vector-qdrant-projection-receipt-v1');
    expect(outboxRow.verification_receipt.qdrantPointId).toBe(qdrantPointId);

    // 6. Direct Qdrant readback via REST API
    const points = await qdrantAdapter.retrieve('evidence_items', [qdrantPointId], {
      with_payload: true,
      with_vector: true,
    });
    expect(points).toHaveLength(1);
    expect(String(points[0].id)).toBe(qdrantPointId);
    expect(points[0].payload?.evidence_id).toBe(CANARY_EVIDENCE_ID);
    expect(points[0].payload?.chunk_index).toBe(0);

    // 7. Verify semantic search readback via pgvector
    const hits = await searchEvidenceVectorsPgvectorV1(
      Array.from(vector),
      { limit: 1, caseId: CANARY_CASE_ID },
      pool,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(evidenceVectorId);
    expect(hits[0].similarity).toBeGreaterThan(0.999);
  });
});
