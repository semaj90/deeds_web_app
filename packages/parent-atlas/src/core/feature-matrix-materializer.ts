import { z } from 'zod';
import { featureMatrixRowSchema, type FeatureMatrixRowV1 } from './feature-matrix.js';

const revision = z.string().min(1);

export const featureMatrixSourceRowSchema = z.object({
  feature_ordinal: z.number().int().nonnegative(),
  feature_id: z.string().min(1),
  feature_revision: revision,
  semantic_768_ref: z.string().min(1).nullable().optional(),
  lexical_count: z.number().int().nonnegative().default(0),
  ast_symbol_count: z.number().int().nonnegative().default(0),
  route_count: z.number().int().nonnegative().default(0),
  requirement_coverage: z.number().finite().min(0).max(1).default(0),
  schema_coverage: z.number().finite().min(0).max(1).default(0),
  test_coverage: z.number().finite().min(0).max(1).default(0),
  runtime_coverage: z.number().finite().min(0).max(1).default(0),
  graph_degree: z.number().finite().nonnegative().default(0),
  in_degree: z.number().finite().nonnegative().default(0),
  out_degree: z.number().finite().nonnegative().default(0),
  fanout: z.number().finite().nonnegative().default(0),
  pagerank: z.number().finite().nonnegative().default(0),
  ppr: z.number().finite().nonnegative().default(0),
  completion: z.number().finite().min(0).max(100).default(0),
  confidence: z.number().finite().min(0).max(100).default(0),
  uncertainty: z.number().finite().min(0).max(1).default(1),
  staleness: z.number().finite().min(0).max(1).default(0),
  domain_bits: z.array(z.number().int().nonnegative()).default([]),
  evidence_bits: z.array(z.number().int().nonnegative()).default([]),
  relationship_bits: z.array(z.number().int().nonnegative()).default([]),
}).strict();

export const featureMatrixMaterializationReceiptSchema = z.object({
  schema: z.literal('atlas.feature-matrix-materialization-receipt.v1').default('atlas.feature-matrix-materialization-receipt.v1'),
  snapshot_revision: revision,
  source_feature_revision: revision,
  source_evidence_snapshot_revision: revision,
  source_graph_revision: revision,
  row_count: z.number().int().nonnegative(),
  column_contract_revision: revision,
  source_checksum: z.string().min(1),
  output_checksum: z.string().min(1),
  producer_revision: revision,
}).strict();

export type FeatureMatrixSourceRowV1 = z.infer<typeof featureMatrixSourceRowSchema>;
export type FeatureMatrixMaterializationReceiptV1 = z.infer<typeof featureMatrixMaterializationReceiptSchema>;

export function materializeFeatureMatrixRows(input: {
  snapshot_revision: string;
  rows: FeatureMatrixSourceRowV1[];
}): FeatureMatrixRowV1[] {
  return input.rows.map((row) => featureMatrixRowSchema.parse({
    schema: 'atlas.feature-matrix-row.v1',
    snapshot_revision: input.snapshot_revision,
    ...featureMatrixSourceRowSchema.parse(row),
    derived_signals: {},
  }));
}

/**
 * TODO(FI-22E): live loader must join canonical feature/evidence state with
 * revision-qualified AST counts and a pinned graph snapshot. Never fill missing
 * source revisions from 'latest' implicitly.
 */
export interface FeatureMatrixSourceLoaderV1 {
  load(input: {
    feature_revision: string;
    evidence_snapshot_revision: string;
    graph_revision: string;
  }): Promise<FeatureMatrixSourceRowV1[]>;
}
