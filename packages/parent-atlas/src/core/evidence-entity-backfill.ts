import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const evidenceEntityFactSchema = z.object({
  evidence_id: id,
  evidence_revision: revision,
  source_ref: z.string().min(1),
  source_revision: revision,
  entity_type: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  entity_id: id,
  role: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  producer_revision: revision,
}).strict();

export const evidenceEntityBackfillReceiptSchema = z.object({
  schema: z.literal('atlas.evidence-entity-backfill-receipt.v1').default('atlas.evidence-entity-backfill-receipt.v1'),
  source_snapshot_revision: revision,
  evidence_count: z.number().int().nonnegative(),
  fact_count: z.number().int().nonnegative(),
  inserted_count: z.number().int().nonnegative(),
  rejected_count: z.number().int().nonnegative(),
  rejected_refs: z.array(id).default([]),
  source_checksum: z.string().min(1),
  output_checksum: z.string().min(1),
  producer_revision: revision,
}).strict();

export type EvidenceEntityFactV1 = z.infer<typeof evidenceEntityFactSchema>;
export type EvidenceEntityBackfillReceiptV1 = z.infer<typeof evidenceEntityBackfillReceiptSchema>;

/**
 * TODO(FI-16J): implement source-specific deterministic extractors:
 * - AST: symbols/routes/imports/calls
 * - schema: table/column/index/policy/FK
 * - tests: test target/asserted feature/runtime result
 * - OpenSpec: requirement/scenario/task IDs
 * - runtime: tool/action/receipt/resource IDs
 * Extraction may nominate an entity; canonical promotion must resolve stable ID.
 */
export interface EvidenceEntityExtractorV1 {
  extract(input: {
    evidence_id: string;
    evidence_kind: string;
    source_ref: string;
    source_revision: string;
    evidence_revision: string;
    payload: unknown;
  }): Promise<EvidenceEntityFactV1[]>;
}

/** TODO: PostgreSQL writer should upsert by evidence_id/entity_type/entity_id/role and emit receipt after readback. */
