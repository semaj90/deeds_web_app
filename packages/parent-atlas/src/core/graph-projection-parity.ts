import { z } from 'zod';

const revision = z.string().min(1);
const checksum = z.string().min(1);

export const graphProjectionParityReceiptSchema = z.object({
  schema: z.literal('atlas.graph-projection-parity-receipt.v1').default('atlas.graph-projection-parity-receipt.v1'),
  canonical_snapshot_revision: revision,
  incidence_projection_revision: revision,
  reference_executor: z.literal('networkx'),
  challenger_executor: z.enum(['neo4j', 'cugraph']),
  relationship_count: z.number().int().nonnegative(),
  entity_count: z.number().int().nonnegative(),
  incidence_edge_count: z.number().int().nonnegative(),
  canonical_relationship_checksum: checksum,
  projected_relationship_checksum: checksum,
  participant_roundtrip_mismatches: z.number().int().nonnegative(),
  ppr_max_abs_delta: z.number().finite().nonnegative().nullable().optional(),
  ppr_l1_delta: z.number().finite().nonnegative().nullable().optional(),
  pagerank_top_k_overlap: z.number().finite().min(0).max(1).nullable().optional(),
  tolerance: z.number().finite().positive(),
  passed: z.boolean(),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.passed && value.participant_roundtrip_mismatches !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'passed parity cannot have participant mismatches', path: ['passed'] });
  }
  if (value.passed && value.ppr_max_abs_delta != null && value.ppr_max_abs_delta > value.tolerance) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PPR delta exceeds tolerance', path: ['ppr_max_abs_delta'] });
  }
});

export type GraphProjectionParityReceiptV1 = z.infer<typeof graphProjectionParityReceiptSchema>;

/** TODO(FI-13C2/FI-14): materialize incidence vertices/edges into Neo4j. */
export interface Neo4jIncidenceProjectorV1 {
  project(input: { canonical_snapshot_revision: string; relationship_ids: string[] }): Promise<{ projection_revision: string; checksum: string }>;
}

/** TODO(FI-14/FI-16I): export dense integer ordinals + incidence edges to cuGraph and run PPR with alpha/tolerance matching the CPU oracle. */
export interface CugraphIncidenceProjectorV1 {
  project(input: { canonical_snapshot_revision: string; relationship_ids: string[] }): Promise<{ projection_revision: string; checksum: string; vertex_count: number; edge_count: number }>;
}
