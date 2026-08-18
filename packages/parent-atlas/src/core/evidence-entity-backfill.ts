import { z } from 'zod';
import type {
  FrameworkEntityNominationV1,
  StructuralReferenceFactV1,
  StructuralSymbolNominationV1,
  SymbolResolutionV1,
} from './structural-symbol.js';

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

export type EvidenceExtractionInputV1 = {
  evidence_id: string;
  evidence_kind: string;
  source_ref: string;
  source_revision: string;
  evidence_revision: string;
  workspace_revision: string;
  payload: unknown;
};

/**
 * Structural extractors produce nominations and reference facts first. They do
 * not directly write symbol entity IDs into atlas_evidence_entities.
 */
export type StructuralEvidenceExtractionResultV1 = {
  symbol_nominations: StructuralSymbolNominationV1[];
  reference_facts: StructuralReferenceFactV1[];
  framework_nominations: FrameworkEntityNominationV1[];
};

export interface StructuralEvidenceExtractorV1 {
  extract(input: EvidenceExtractionInputV1): Promise<StructuralEvidenceExtractionResultV1>;
}

/**
 * Promotion adapter converts only canonical symbol resolutions into shared
 * evidence-entity facts. Degraded/ambiguous/unresolved nominations remain
 * evidence candidates and cannot become shared SQL join keys.
 */
export function promoteResolvedSymbolsToEvidenceEntities(input: {
  evidence_id: string;
  evidence_revision: string;
  source_ref: string;
  source_revision: string;
  producer_revision: string;
  nominations: StructuralSymbolNominationV1[];
  resolutions: SymbolResolutionV1[];
}): EvidenceEntityFactV1[] {
  const resolutionByNomination = new Map(input.resolutions.map((item) => [item.nomination_id, item]));
  const facts: EvidenceEntityFactV1[] = [];

  for (const nomination of input.nominations) {
    const resolution = resolutionByNomination.get(nomination.nomination_id);
    if (!resolution || resolution.status !== 'canonical' || !resolution.stable_symbol_id) continue;

    facts.push(evidenceEntityFactSchema.parse({
      evidence_id: input.evidence_id,
      evidence_revision: input.evidence_revision,
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      entity_type: 'symbol',
      entity_id: resolution.stable_symbol_id,
      role: 'defines',
      confidence: 1,
      producer_revision: input.producer_revision,
    }));
  }

  return facts;
}

/**
 * Non-structural extractors may produce already-canonical entity facts only
 * when their own resolver guarantees the entity_id is canonical. Examples:
 * schema registry table IDs, OpenSpec requirement IDs, or runtime receipt IDs.
 */
export interface EvidenceEntityExtractorV1 {
  extract(input: EvidenceExtractionInputV1): Promise<EvidenceEntityFactV1[]>;
}

/**
 * TODO(FI-16J): source-specific deterministic producers:
 *
 * AST / code
 * - Tree-sitter tags/queries: definitions + references + exact byte/AST paths.
 * - ast-grep: higher-level structural observations (route handler patterns,
 *   framework conventions, DB-call shapes, test API patterns).
 * - chunker: creates replaceable StructuralChunkProjectionV1 spans only.
 * - canonical symbol registry: promotes symbol nominations to stable_symbol_id.
 *
 * Schema
 * - tables/columns/FKs/indexes/policies from pinned migration/schema revision.
 *
 * Tests
 * - test case/assertion/target nominations + runtime result receipts.
 *
 * OpenSpec
 * - requirement/scenario/task identities from pinned document revision.
 *
 * Runtime
 * - tool/action/receipt/resource identities from revisioned execution receipts.
 *
 * Only canonical resolutions may enter atlas_evidence_entities as shared SQL
 * join keys. Degraded/ambiguous/unresolved nominations stay candidate evidence.
 */

/** TODO: PostgreSQL writer should upsert by evidence_id/entity_type/entity_id/role and emit receipt after readback. */
