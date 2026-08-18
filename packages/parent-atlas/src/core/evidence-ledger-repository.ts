import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const atlasEvidenceRecordSchema = z.object({
  schema: z.literal('atlas.evidence-record.v1').default('atlas.evidence-record.v1'),
  evidence_id: id,
  evidence_kind: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  source_ref: z.string().min(1),
  source_revision: revision,
  evidence_revision: revision,
  producer_revision: revision,
  confidence: z.number().finite().min(0).max(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string().min(1)).default([]),
  search_text: z.string().default(''),
}).strict();

export const atlasEvidenceReadbackReceiptSchema = z.object({
  schema: z.literal('atlas.evidence-readback-receipt.v1').default('atlas.evidence-readback-receipt.v1'),
  evidence_id: id,
  source_revision: revision,
  evidence_revision: revision,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export type AtlasEvidenceRecordV1 = z.infer<typeof atlasEvidenceRecordSchema>;
export type AtlasEvidenceReadbackReceiptV1 = z.infer<typeof atlasEvidenceReadbackReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/**
 * Canonical evidence ledger writer independent of feature attachment.
 *
 * This is required for structural/schema/test/OpenSpec/runtime evidence that is
 * source-grounded before Parent Atlas knows which Feature entity it supports.
 * atlas_feature_evidence remains a later, optional relationship.
 */
export function createEvidenceLedgerRepository(pool: Pool) {
  return {
    async upsert(input: AtlasEvidenceRecordV1): Promise<AtlasEvidenceRecordV1> {
      const evidence = atlasEvidenceRecordSchema.parse(input);
      await pool.query(`
        INSERT INTO atlas_evidence (
          evidence_id, evidence_kind, source_ref, source_revision,
          evidence_revision, producer_revision, confidence, payload, tags, search_text
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::text[],$10)
        ON CONFLICT (evidence_id) DO UPDATE SET
          evidence_kind = EXCLUDED.evidence_kind,
          source_ref = EXCLUDED.source_ref,
          source_revision = EXCLUDED.source_revision,
          evidence_revision = EXCLUDED.evidence_revision,
          producer_revision = EXCLUDED.producer_revision,
          confidence = EXCLUDED.confidence,
          payload = EXCLUDED.payload,
          tags = EXCLUDED.tags,
          search_text = EXCLUDED.search_text
      `, [evidence.evidence_id, evidence.evidence_kind, evidence.source_ref,
        evidence.source_revision, evidence.evidence_revision, evidence.producer_revision,
        evidence.confidence, JSON.stringify(evidence.payload), evidence.tags, evidence.search_text]);
      return evidence;
    },

    async readback(input: {
      evidence_id: string;
      producer_revision: string;
    }): Promise<AtlasEvidenceReadbackReceiptV1> {
      const result = await pool.query<{
        evidence_id: string;
        evidence_kind: string;
        source_ref: string;
        source_revision: string;
        evidence_revision: string;
        producer_revision: string;
        confidence: number;
        payload: unknown;
        tags: string[];
        search_text: string;
      }>(`
        SELECT evidence_id, evidence_kind, source_ref, source_revision,
               evidence_revision, producer_revision, confidence, payload, tags, search_text
        FROM atlas_evidence WHERE evidence_id = $1
      `, [input.evidence_id]);
      if (result.rowCount !== 1) throw new Error(`EVIDENCE_READBACK_MISSING:${input.evidence_id}`);
      const row = result.rows[0]!;
      return atlasEvidenceReadbackReceiptSchema.parse({
        evidence_id: row.evidence_id,
        source_revision: row.source_revision,
        evidence_revision: row.evidence_revision,
        checksum: checksum(row),
        producer_revision: input.producer_revision,
      });
    },
  };
}

export function describeEvidenceLedgerRepository(): string {
  return [
    'atlas_evidence is the canonical source-grounded evidence ledger and does not require a feature attachment.',
    'atlas_feature_evidence is a later relation between canonical features and already-materialized evidence.',
    'atlas_evidence_entities may be written only after the referenced evidence row exists and entity identity is canonical.',
  ].join(' ');
}
