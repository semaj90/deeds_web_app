// @vitest-environment node
/**
 * Opt-in proof of the EmbeddingGemma 2 evidence text path against the real application database.
 *
 * Everything runs inside one transaction that is always rolled back, so no row is left behind:
 *   real chunker -> real EmbeddingGemma 2 ONNX text embedding (CPU) -> real multimodal vector writer
 *   -> canonical pgvector row + projection outbox row -> readback -> ROLLBACK.
 *
 * It borrows an existing evidence row (for the case and source-revision binding the writer checks)
 * and indexes fixture text against it; it does not prove that text came from that evidence file.
 *
 * Run:  ATLAS_EVIDENCE_TEXT_LIVE_ROLLBACK_TEST=1 ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR=<dir> \
 *       npx vitest run src/lib/server/evidence/evidence-document-chunk-embeddinggemma2.integration.spec.ts
 */
import { Client } from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { ENV } from '$lib/server/env.server.js';
import { indexEvidenceDocumentCanonicalV1 } from './evidence-document-indexer-v1.js';
import { createEmbeddingGemma2TextIndexerDependenciesV1 } from './process-evidence-document-v1.js';
import type {
  EvidenceMultimodalDatabaseV1,
  EvidenceMultimodalExecuteV1,
} from './evidence-multimodal-vector-persistence-v1.js';
import { embedEvidenceTextWithEmbeddingGemma2OnnxV1 } from './embeddinggemma2-onnx-image-v1.js';

const modelDir = process.env.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR;
const enabled = process.env.ATLAS_EVIDENCE_TEXT_LIVE_ROLLBACK_TEST === '1' && Boolean(modelDir);

const FIXTURE_TEXT = [
  'WITNESS STATEMENT. The witness, a warehouse shift supervisor, states that on 4 March the sealed inventory',
  'records were removed from the records room after hours using a borrowed access badge.',
  '',
  'The witness further states that the delivery van left the depot at 21:40 and returned without its cargo manifest.',
].join('\n');

describe.skipIf(!enabled)('EmbeddingGemma 2 evidence text chunks against the live database (rollback only)', () => {
  it('writes document_chunk vectors + outbox rows, ranks them by a text query, then rolls everything back', async () => {
    const url = new URL(ENV.DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('LIVE_ROLLBACK_TEST_REQUIRES_LOCAL_DATABASE');
    const client = new Client({ connectionString: url.toString() });
    const dialect = new PgDialect();
    let inTransaction = false;
    try {
      await client.connect();
      const before = await client.query<{ vectors: string; outbox: string }>(
        `SELECT (SELECT count(*)::text FROM evidence_multimodal_vectors) AS vectors,
                (SELECT count(*)::text FROM evidence_multimodal_vector_projection_outbox) AS outbox`,
      );
      const source = await client.query<{ id: string; case_id: string; hash: string }>(
        `SELECT id::text, case_id::text, hash FROM evidence
         WHERE deleted_at IS NULL AND case_id IS NOT NULL AND hash ~ '^(sha256:)?[0-9a-f]{64}$'
         ORDER BY created_at DESC LIMIT 1`,
      );
      expect(source.rows).toHaveLength(1);
      const evidence = source.rows[0];
      const sourceRevision = `sha256:${evidence.hash.replace(/^sha256:/, '')}`;

      await client.query('BEGIN');
      inTransaction = true;
      const adapter: EvidenceMultimodalExecuteV1 = {
        execute: async (query) => {
          const compiled = dialect.sqlToQuery(query);
          const result = await client.query(compiled.sql, compiled.params);
          return { rows: result.rows as Array<Record<string, unknown>> };
        },
      };
      const database: EvidenceMultimodalDatabaseV1 = {
        execute: adapter.execute,
        transaction: async <T>(operation: (tx: EvidenceMultimodalExecuteV1) => Promise<T>) => operation(adapter),
      };

      const indexed = await indexEvidenceDocumentCanonicalV1({
        evidenceId: evidence.id,
        sourceRevision,
        text: FIXTURE_TEXT,
        metadata: { caseId: evidence.case_id, fixtureOnly: true },
        dependencies: createEmbeddingGemma2TextIndexerDependenciesV1({ caseId: evidence.case_id, modelDir, database }),
      });
      expect(indexed.chunkCount).toBeGreaterThan(0);
      expect(indexed.persistedCount).toBe(indexed.chunkCount);

      const rows = await client.query<{
        modality: string; dims: number; embedding_type: string; preprocessing_revision: string;
        kind: string; outbox_status: string | null; outbox_lane: string | null; content_len: number;
      }>(
        `SELECT v.modality, vector_dims(v.embedding) AS dims, v.embedding_type, v.preprocessing_revision,
                v.source_locator->>'kind' AS kind, o.status AS outbox_status, o.projection_lane AS outbox_lane,
                length(v.metadata->>'content') AS content_len
         FROM evidence_multimodal_vectors v
         LEFT JOIN evidence_multimodal_vector_projection_outbox o ON o.evidence_multimodal_vector_id = v.id
         WHERE v.evidence_id = $1::uuid AND v.source_revision = $2`,
        [evidence.id, sourceRevision],
      );
      expect(rows.rows).toHaveLength(indexed.chunkCount);
      for (const row of rows.rows) {
        expect(row).toMatchObject({
          modality: 'document_chunk',
          dims: 768,
          embedding_type: 'evidence_multimodal_semantic_768',
          preprocessing_revision: 'atlas.embeddinggemma2.text-document-title-none-q8.v1',
          kind: 'text_chunk',
          outbox_status: 'PENDING',
          outbox_lane: 'evidence_multimodal_semantic_768',
        });
        expect(row.content_len).toBeGreaterThan(0);
      }

      // Canonical search straight from pgvector: a related query must outrank an unrelated one.
      const score = async (text: string) => {
        const query = await embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text, kind: 'query', modelDir });
        const result = await client.query<{ similarity: number }>(
          `SELECT max(1 - (embedding <=> $1::vector)) AS similarity FROM evidence_multimodal_vectors
           WHERE evidence_id = $2::uuid AND modality = 'document_chunk'`,
          [`[${query.embedding.join(',')}]`, evidence.id],
        );
        return Number(result.rows[0].similarity);
      };
      const related = await score('who removed the inventory records?');
      const unrelated = await score('recipe for chocolate cake');
      console.log(`LIVE_ROLLBACK chunks=${indexed.chunkCount} related=${related.toFixed(4)} unrelated=${unrelated.toFixed(4)}`);
      expect(related).toBeGreaterThan(unrelated);

      await client.query('ROLLBACK');
      inTransaction = false;
      const after = await client.query<{ vectors: string; outbox: string }>(
        `SELECT (SELECT count(*)::text FROM evidence_multimodal_vectors) AS vectors,
                (SELECT count(*)::text FROM evidence_multimodal_vector_projection_outbox) AS outbox`,
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    } finally {
      if (inTransaction) await client.query('ROLLBACK').catch(() => {});
      await client.end().catch(() => {});
    }
  }, 180_000);
});
