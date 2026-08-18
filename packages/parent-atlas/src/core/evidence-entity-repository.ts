import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  evidenceEntityBackfillReceiptSchema,
  evidenceEntityFactSchema,
  type EvidenceEntityBackfillReceiptV1,
  type EvidenceEntityFactV1,
} from './evidence-entity-backfill.js';

const revision = z.string().min(1);

export const evidenceEntityReadbackReceiptSchema = z.object({
  schema: z.literal('atlas.evidence-entity-readback-receipt.v1').default('atlas.evidence-entity-readback-receipt.v1'),
  source_snapshot_revision: revision,
  fact_count: z.number().int().nonnegative(),
  canonical_entity_count: z.number().int().nonnegative(),
  evidence_count: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export type EvidenceEntityReadbackReceiptV1 = z.infer<typeof evidenceEntityReadbackReceiptSchema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function createEvidenceEntityRepository(pool: Pool) {
  return {
    async upsertFacts(input: {
      source_snapshot_revision: string;
      facts: EvidenceEntityFactV1[];
      source_checksum: string;
      producer_revision: string;
    }): Promise<EvidenceEntityBackfillReceiptV1> {
      const facts = input.facts.map((fact) => evidenceEntityFactSchema.parse(fact));
      const rejectedRefs: string[] = [];
      let inserted = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const fact of facts) {
          try {
            await client.query(`
              INSERT INTO atlas_evidence_entities (
                evidence_id, entity_type, entity_id, role, source_ref,
                source_revision, extraction_revision, confidence, metadata
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
              ON CONFLICT (evidence_id, entity_type, entity_id, role)
              DO UPDATE SET
                source_ref = EXCLUDED.source_ref,
                source_revision = EXCLUDED.source_revision,
                extraction_revision = EXCLUDED.extraction_revision,
                confidence = EXCLUDED.confidence,
                metadata = EXCLUDED.metadata
            `, [
              fact.evidence_id,
              fact.entity_type,
              fact.entity_id,
              fact.role,
              fact.source_ref,
              fact.source_revision,
              fact.producer_revision,
              fact.confidence,
              JSON.stringify({
                evidence_revision: fact.evidence_revision,
                producer_revision: fact.producer_revision,
                source_snapshot_revision: input.source_snapshot_revision,
              }),
            ]);
            inserted += 1;
          } catch {
            rejectedRefs.push(`${fact.evidence_id}:${fact.entity_type}:${fact.entity_id}:${fact.role}`);
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      const outputChecksum = sha256(JSON.stringify(facts.map((fact) => ({
        evidence_id: fact.evidence_id,
        entity_type: fact.entity_type,
        entity_id: fact.entity_id,
        role: fact.role,
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))));

      return evidenceEntityBackfillReceiptSchema.parse({
        source_snapshot_revision: input.source_snapshot_revision,
        evidence_count: new Set(facts.map((fact) => fact.evidence_id)).size,
        fact_count: facts.length,
        inserted_count: inserted,
        rejected_count: rejectedRefs.length,
        rejected_refs: rejectedRefs,
        source_checksum: input.source_checksum,
        output_checksum: outputChecksum,
        producer_revision: input.producer_revision,
      });
    },

    async readback(input: {
      source_snapshot_revision: string;
      source_revisions?: string[];
      producer_revision: string;
    }): Promise<EvidenceEntityReadbackReceiptV1> {
      const params: unknown[] = [];
      let where = '';
      if (input.source_revisions && input.source_revisions.length > 0) {
        params.push(input.source_revisions);
        where = 'WHERE ee.source_revision = ANY($1::text[])';
      }
      const result = await pool.query<{
        evidence_id: string;
        evidence_revision: string;
        source_ref: string;
        source_revision: string;
        entity_type: string;
        entity_id: string;
        role: string;
        confidence: number;
        extraction_revision: string;
        metadata: unknown;
      }>(`
        SELECT ee.evidence_id,
               e.evidence_revision,
               ee.source_ref,
               ee.source_revision,
               ee.entity_type,
               ee.entity_id,
               ee.role,
               ee.confidence,
               ee.extraction_revision,
               ee.metadata
        FROM atlas_evidence_entities ee
        JOIN atlas_evidence e USING (evidence_id)
        ${where}
        ORDER BY ee.evidence_id, ee.entity_type, ee.entity_id, ee.role
      `, params);

      const checksum = sha256(JSON.stringify(result.rows));
      return evidenceEntityReadbackReceiptSchema.parse({
        source_snapshot_revision: input.source_snapshot_revision,
        fact_count: result.rows.length,
        canonical_entity_count: new Set(result.rows.map((row) => `${row.entity_type}:${row.entity_id}`)).size,
        evidence_count: new Set(result.rows.map((row) => row.evidence_id)).size,
        checksum,
        producer_revision: input.producer_revision,
      });
    },
  };
}
