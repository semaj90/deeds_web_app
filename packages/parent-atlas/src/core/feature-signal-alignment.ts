import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const FEATURE_SIGNAL_BLOCK_KIND_VALUES = [
  'continuous',
  'binary_mask',
  'dense_semantic',
  'sparse_relation',
  'context_window',
  'cluster_distribution',
  'som_coordinate',
  'interpolated_topology',
] as const;

export const FEATURE_SIGNAL_NORMALIZATION_VALUES = [
  'none',
  'binary_01',
  'minmax',
  'zscore',
  'log1p_minmax',
  'l2_row',
  'softmax_row',
  'sparse_softmax_row',
] as const;

export const featureSignalBlockSchema = z.object({
  block_id: z.string().min(1),
  block_revision: revision,
  kind: z.enum(FEATURE_SIGNAL_BLOCK_KIND_VALUES),
  row_identity_checksum: checksum,
  row_count: z.number().int().nonnegative(),
  dimensions: z.number().int().positive(),
  dtype: z.enum(['float32', 'float16', 'uint8', 'int32', 'int64']),
  normalization: z.enum(FEATURE_SIGNAL_NORMALIZATION_VALUES),
  tensor_checksum: checksum,
  source_snapshot_revision: revision,
  canonical_authority: z.literal(false).default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'binary_mask' && value.normalization !== 'binary_01') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalization'], message: 'binary masks must preserve exact 0/1 semantics' });
  }
  if (value.kind === 'sparse_relation' && !['binary_01', 'sparse_softmax_row'].includes(value.normalization)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalization'], message: 'sparse relation blocks must be binary support or sparse-softmax weights' });
  }
  if (value.kind === 'cluster_distribution' && value.normalization !== 'softmax_row') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalization'], message: 'cluster distributions must be row-softmax normalized' });
  }
});

export const featureSignalAlignmentSchema = z.object({
  schema: z.literal('atlas.feature-signal-alignment.v1').default('atlas.feature-signal-alignment.v1'),
  alignment_revision: revision,
  feature_snapshot_revision: revision,
  row_identity_checksum: checksum,
  row_count: z.number().int().nonnegative(),
  blocks: z.array(featureSignalBlockSchema).min(1),
  concatenated_dimensions: z.number().int().positive(),
  output_checksum: checksum,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const blockIds = new Set<string>();
  let dimensions = 0;
  for (const [index, block] of value.blocks.entries()) {
    dimensions += block.dimensions;
    if (blockIds.has(block.block_id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index, 'block_id'], message: 'block_id must be unique' });
    }
    blockIds.add(block.block_id);
    if (block.row_count !== value.row_count) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index, 'row_count'], message: 'every block must have identical row_count' });
    }
    if (block.row_identity_checksum !== value.row_identity_checksum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index, 'row_identity_checksum'], message: 'every block must share the same canonical row ordering' });
    }
  }
  if (dimensions !== value.concatenated_dimensions) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['concatenated_dimensions'], message: 'concatenated_dimensions must equal the sum of block dimensions' });
  }
});

export type FeatureSignalBlockV1 = z.infer<typeof featureSignalBlockSchema>;
export type FeatureSignalAlignmentV1 = z.infer<typeof featureSignalAlignmentSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function checksumFeatureSignalAlignment(value: Omit<FeatureSignalAlignmentV1, 'output_checksum'>): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function describeFeatureSignalAlignment(): string {
  return [
    'Dense semantic, sparse N-ary, contextual-window, clustering, SOM and interpolation blocks may only align after proving one canonical row ordering.',
    'Binary relation support remains exact 0/1; sparse softmax can assign probability only to explicitly supported entries.',
    'Soft KMeans, SOM coordinates and interpolated topology are derived routing signals and never canonical concepts or relationships.',
    'Normalization is explicit per block so counts, probabilities, masks and dense vectors are not silently mixed on incompatible scales.',
  ].join(' ');
}
