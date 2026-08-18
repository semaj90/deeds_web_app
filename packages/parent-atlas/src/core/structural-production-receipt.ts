import { z } from 'zod';

const revision = z.string().min(1);

export const structuralProductionReceiptSchema = z.object({
  schema: z.literal('atlas.structural-production-receipt.v1').default('atlas.structural-production-receipt.v1'),
  workspace_revision: revision,
  source_snapshot_revision: revision,
  chunker_engine: z.literal('treesitter-chunker'),
  chunker_revision: revision,
  ast_grep_revision: revision,
  langextract_revision: revision,
  gis_revision: revision,
  symbol_registry_revision: revision,
  files_seen: z.number().int().nonnegative(),
  files_succeeded: z.number().int().nonnegative(),
  files_recovered_with_errors: z.number().int().nonnegative(),
  files_failed: z.number().int().nonnegative(),
  chunk_count: z.number().int().nonnegative(),
  xref_edge_count: z.number().int().nonnegative(),
  native_upstream_node_id_count: z.number().int().nonnegative(),
  compatibility_node_id_count: z.number().int().nonnegative(),
  symbol_nomination_count: z.number().int().nonnegative(),
  canonical_symbol_count: z.number().int().nonnegative(),
  unresolved_symbol_count: z.number().int().nonnegative(),
  ambiguous_symbol_count: z.number().int().nonnegative(),
  canonical_reference_count: z.number().int().nonnegative(),
  evidence_entity_fact_count: z.number().int().nonnegative(),
  grounded_langextract_count: z.number().int().nonnegative(),
  rejected_ungrounded_langextract_count: z.number().int().nonnegative(),
  persistence_status: z.enum(['not_attempted', 'written', 'readback_verified', 'failed']),
  graphify_daily_reachable: z.boolean(),
  fallback_policy: z.enum(['none', 'fail_closed', 'legacy_fallback', 'unknown']),
  canonical_identity_created_by_extractors: z.literal(false).default(false),
  source_checksum: z.string().min(1),
  output_checksum: z.string().min(1),
  diagnostics: z.array(z.string()).default([]),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.files_succeeded + value.files_recovered_with_errors + value.files_failed > value.files_seen) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'file outcome counts exceed files_seen' });
  }
  if (value.canonical_symbol_count + value.unresolved_symbol_count + value.ambiguous_symbol_count > value.symbol_nomination_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'symbol resolution counts exceed nominations' });
  }
});

export type StructuralProductionReceiptV1 = z.infer<typeof structuralProductionReceiptSchema>;

export function structuralReceiptCanPromoteOwnership(receipt: StructuralProductionReceiptV1): boolean {
  const parsed = structuralProductionReceiptSchema.parse(receipt);
  return (
    parsed.files_failed === 0
    && parsed.persistence_status === 'readback_verified'
    && parsed.graphify_daily_reachable
    && parsed.fallback_policy !== 'unknown'
    && parsed.compatibility_node_id_count === 0
    && parsed.canonical_identity_created_by_extractors === false
  );
}
