import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { digestSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  EVIDENCE_VECTOR_PROJECTION_CONTRACT_V1,
  EVIDENCE_VECTOR_PROJECTION_LANE_V1,
} from './evidence-vector-persistence-v1.js';
import {
  projectEvidenceVectorOutboxBatchV1,
  type EvidenceProjectionDatabaseV1,
  type EvidenceProjectionJobV1,
  type EvidenceProjectionQdrantV1,
} from './evidence-vector-projection-worker-v1.js';

const dialect = new PgDialect();
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const modelArtifactSha256 = `sha256:${'b'.repeat(64)}`;
const inputSha256 = `sha256:${createHash('sha256').update('test input').digest('hex')}`;
const rawVector = Array.from({ length: 768 }, (_, index) => Math.sin(index * 0.013 + 0.2));
const vectorNorm = Math.hypot(...rawVector);
const vector = Float32Array.from(rawVector, (value) => value / vectorNorm);
const outputSha256 = digestSemantic768OutputV1(vector);
const provenance = {
  modelArtifactSha256,
  modelReceipt: { provider: 'llama-server', artifactIdentityBound: true, dimensionBound: true, runtimeReady: true },
  inputRecipeRevision: 'semantic-input-v1',
  inputSha256,
};
const payload = {
  evidence_id: '33333333-3333-4333-8333-333333333333',
  case_id: 'case-1',
  source_revision: sourceRevision,
  embedding_input_recipe_revision: provenance.inputRecipeRevision,
  embedding_input_sha256: inputSha256,
  model_artifact_sha256: modelArtifactSha256,
  embedding_output_sha256: outputSha256,
  embedding_type: 'evidence_text_semantic_768',
  source_field: 'canonical_evidence_text',
  embedding_provenance: provenance,
  chunk_index: 2,
  file_name: 'fixture.pdf',
  content_preview: 'fixture content',
  extraction_method: 'fixture',
  section_path: [],
  heading: '',
  citations: [],
  token_count: 0,
  section_type: '',
};

function makeHarness() {
  const job: EvidenceProjectionJobV1 = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    evidence_vector_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    qdrant_point_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    projection_lane: EVIDENCE_VECTOR_PROJECTION_LANE_V1,
    projection_contract_revision: EVIDENCE_VECTOR_PROJECTION_CONTRACT_V1,
    source_revision: sourceRevision,
    chunk_index: 2,
    output_sha256: outputSha256,
    model_artifact_sha256: modelArtifactSha256,
    input_recipe_revision: provenance.inputRecipeRevision,
    input_sha256: inputSha256,
    attempt_count: 0,
    max_attempts: 3,
    lease_token: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  };
  const canonical = {
    id: job.evidence_vector_id,
    evidence_id: payload.evidence_id,
    chunk_index: 2,
    content: 'fixture content',
    embedding_float4: Array.from(vector),
    dimension: 768,
    embedding_type: 'evidence_text_semantic_768',
    source_field: 'canonical_evidence_text',
    source_revision: sourceRevision,
    model: 'embeddinggemma',
    metadata: { ...payload, embedding_output_sha256: outputSha256, embedding_provenance: provenance },
  };
  let status = 'PENDING';
  let attempt = 0;
  let lastError = '';
  const sqlText: string[] = [];
  const database: EvidenceProjectionDatabaseV1 = {
    async execute(query: SQL) {
      const compiled = dialect.sqlToQuery(query);
      sqlText.push(compiled.sql);
      if (compiled.sql.includes('WITH candidates AS')) {
        if (!['PENDING', 'RETRY', 'PROCESSING'].includes(status)) return { rows: [] };
        status = 'PROCESSING';
        attempt += 1;
        return { rows: [{ ...job, attempt_count: attempt }] };
      }
      if (compiled.sql.includes('FROM evidence_vectors')) return { rows: [canonical] };
      if (compiled.sql.includes("SET status = 'COMPLETED'")) {
        status = 'COMPLETED';
        return { rows: [{ id: job.id }] };
      }
      if (compiled.sql.includes("SET status = $1")) {
        status = String(compiled.params[0]);
        lastError = String(compiled.params.find((value) => typeof value === 'string' && value.startsWith('EVIDENCE_')) ?? '');
        return { rows: [{ id: job.id }] };
      }
      if (compiled.sql.includes("SET status = 'DEAD_LETTER'")) return { rows: [] };
      return { rows: [] };
    },
    async transaction(operation) {
      return operation(this);
    },
  };
  const points = new Map<string, { vector: number[]; payload: Record<string, unknown> }>();
  const qdrant: EvidenceProjectionQdrantV1 = {
    async upsert(_alias, input) {
      const point = input.points[0];
      points.set(point.id, { vector: point.vector.content, payload: point.payload });
    },
    async retrieve(_alias, ids) {
      return ids.flatMap((id) => {
        const point = points.get(id);
        return point ? [{ id, vector: Array.from(point.vector), payload: point.payload }] : [];
      });
    },
  };
  return { database, qdrant, points, sqlText, status: () => status, lastError: () => lastError };
}

describe('evidence vector projection worker', () => {
  it('reads the canonical row, verifies Qdrant readback, then completes', async () => {
    const harness = makeHarness();
    const result = await projectEvidenceVectorOutboxBatchV1(harness.database, harness.qdrant, {
      resolveCollectionAlias: async (lane) => `active-${lane}`,
    });

    expect(harness.lastError()).toBe('');
    expect(result).toMatchObject({ claimed: 1, completed: 1, retried: 0, deadLettered: 0 });
    expect(harness.status()).toBe('COMPLETED');
    expect([...harness.points.values()][0].vector).toEqual(Array.from(vector));
    expect(harness.sqlText.some((statement) => statement.includes('FROM evidence_vectors'))).toBe(true);
    expect(harness.sqlText.some((statement) => statement.includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
  });

  it('keeps failed deliveries retryable and does not complete on Qdrant failure', async () => {
    const harness = makeHarness();
    const failingQdrant: EvidenceProjectionQdrantV1 = {
      ...harness.qdrant,
      async upsert() { throw new Error('temporary Qdrant outage'); },
    };
    const result = await projectEvidenceVectorOutboxBatchV1(harness.database, failingQdrant, {
      retryBaseMs: 250,
      resolveCollectionAlias: async () => 'active-evidence-alias',
    });

    expect(result).toMatchObject({ claimed: 1, completed: 0, retried: 1, deadLettered: 0 });
    expect(harness.status()).toBe('RETRY');
    expect(harness.sqlText.some((statement) => statement.includes('interval'))).toBe(true);
  });

  it('does not complete when Qdrant returns a vector with a different checksum', async () => {
    const harness = makeHarness();
    const wrongReadback: EvidenceProjectionQdrantV1 = {
      async upsert() {},
      async retrieve(_alias, ids) {
        return [{ id: ids[0], vector: Array(768).fill(0.25), payload }];
      },
    };
    const result = await projectEvidenceVectorOutboxBatchV1(harness.database, wrongReadback, {
      resolveCollectionAlias: async () => 'active-evidence-alias',
    });

    expect(result).toMatchObject({ completed: 0, retried: 1, deadLettered: 0 });
    expect(harness.status()).toBe('RETRY');
  });
});
