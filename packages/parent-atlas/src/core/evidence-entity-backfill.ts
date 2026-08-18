import { z } from 'zod';
import type {
  AstGrepObservationV1,
  FrameworkEntityNominationV1,
  GroundedLangExtractObservationV1,
  StructuralReferenceFactV1,
  StructuralSymbolNominationV1,
  SymbolResolutionV1,
  TreesitterChunkerChunkV1,
  TreesitterChunkerXrefEdgeV1,
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
 * Code evidence is a three-producer fabric:
 * - Consiliency treesitter-chunker: primary CodeChunk/span/hierarchy/XRef facts.
 * - ast-grep: deterministic structural-pattern observations.
 * - LangExtract: grounded semantic/entity/relation observations with char spans.
 *
 * These remain evidence until canonical promotion resolves Atlas identities.
 */
export type StructuralEvidenceExtractionResultV1 = {
  chunks: TreesitterChunkerChunkV1[];
  xref_edges: TreesitterChunkerXrefEdgeV1[];
  symbol_nominations: StructuralSymbolNominationV1[];
  reference_facts: StructuralReferenceFactV1[];
  ast_grep_observations: AstGrepObservationV1[];
  langextract_observations: GroundedLangExtractObservationV1[];
  framework_nominations: FrameworkEntityNominationV1[];
};

export interface StructuralEvidenceExtractorV1 {
  extract(input: EvidenceExtractionInputV1): Promise<StructuralEvidenceExtractionResultV1>;
}

/**
 * Promotion adapter converts only canonical symbol resolutions into shared
 * evidence-entity facts. treesitter-chunker symbol_id/node_id/chunk_id stay
 * provenance keys unless the canonical registry resolves them to a stable
 * Atlas symbol identity.
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
 * LangExtract observations may enter canonical evidence only after grounding is
 * proven by a non-empty char_interval and their entity/relation nominations are
 * resolved by the relevant canonical registry. The LLM extraction never owns
 * code symbol identity.
 */
export function isGroundedLangExtractObservation(
  observation: GroundedLangExtractObservationV1,
): boolean {
  return observation.char_interval.end_pos > observation.char_interval.start_pos;
}

/**
 * Non-code registries may produce already-canonical entity facts only when the
 * registry is itself authoritative: schema table/column IDs, OpenSpec IDs, or
 * runtime receipt/resource IDs. LangExtract output alone is never sufficient.
 */
export interface EvidenceEntityExtractorV1 {
  extract(input: EvidenceExtractionInputV1): Promise<EvidenceEntityFactV1[]>;
}

/**
 * TODO(FI-16J): complete source-specific producers without creating a fourth
 * competing AST owner.
 *
 * CODE / AST
 * - 8095 `POST /ast/chunk` + Consiliency/treesitter-chunker is the primary
 *   structural evidence producer (`atlas.ast.evidence.v1`). Preserve upstream
 *   node_id/file_id/symbol_id/chunk_id, byte spans, hierarchy and XRef edges.
 * - Existing `atlas-ast-evidence-normalizer.ts` remains the compatibility
 *   normalization seam and must continue leaving canonical symbol/version IDs
 *   pending until GIS/canonical persistence resolves them.
 * - ast-grep attaches deterministic rule observations to chunk/node spans:
 *   routes, ORM calls, auth guards, tests, framework conventions, rewrites.
 *   ast-grep observations may nominate entities/relations but never mint Atlas
 *   canonical IDs.
 * - LangExtract attaches grounded semantic/entity/relation observations. Reject
 *   char_interval-less output from canonical evidence; keep it diagnostic only.
 * - GIS / canonical registry resolves upstream structural provenance into
 *   stable_symbol_id, symbol_version_id, feature_id and relationship_id.
 *
 * SCHEMA
 * - tables/columns/FKs/indexes/policies from pinned migration/schema revision.
 *
 * TESTS
 * - deterministic test target/assertion structure from chunker + ast-grep;
 *   runtime pass/fail comes from revisioned execution receipts, not LangExtract.
 *
 * OPENSPEC
 * - requirement/scenario/task identities from pinned document revision;
 *   LangExtract may help nominate grounded relations but OpenSpec IDs own truth.
 *
 * RUNTIME
 * - tool/action/receipt/resource identities from revisioned execution receipts.
 *
 * Only canonical resolutions may enter atlas_evidence_entities as shared SQL
 * join keys. Upstream chunker IDs and grounded NLP observations remain evidence
 * provenance until promotion.
 */

/** TODO: PostgreSQL writer should upsert by evidence_id/entity_type/entity_id/role and emit receipt after readback. */
