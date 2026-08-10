import { z } from 'zod';

export const FEATURE_MATRIX_5_NAMES = [
  'entropy_norm',
  'ast_signal',
  'domain_fit',
  'authority_norm',
  'execution_utility'
] as const;

export type FeatureMatrix5Name = (typeof FEATURE_MATRIX_5_NAMES)[number];
export type FeatureVector5 = readonly [number, number, number, number, number];

export interface FeatureMatrix5Row {
  packetKey: string;
  features: FeatureVector5;
  missingMask: number;
  workspaceRevision: string;
  sourceRevision?: string;
}

export const FeatureSourceStatusSchema = z.enum(['proven', 'blocked']);
export type FeatureSourceStatus = z.infer<typeof FeatureSourceStatusSchema>;

export const FeatureSourceNameSchema = z.enum(FEATURE_MATRIX_5_NAMES);
export type FeatureSourceName = z.infer<typeof FeatureSourceNameSchema>;

export const FeatureSourceEntrySchema = z
  .object({
    name: FeatureSourceNameSchema,
    status: FeatureSourceStatusSchema,
    source: z.string().min(1).nullable().default(null),
    sourceRevision: z.string().min(1).nullable().default(null),
    formula: z.string().min(1).nullable().default(null),
    liveCoverage: z.number().finite().min(0).max(1).nullable().default(null),
    notes: z.string().min(1),
    evidence: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type FeatureSourceEntry = z.infer<typeof FeatureSourceEntrySchema>;

export const FeatureSourceManifestSchema = z
  .object({
    schemaVersion: z.literal('atlas.feature-source-manifest.v1'),
    featureRevision: z.string().min(1),
    workspaceRevision: z.string().min(1),
    packetKey: z.string().min(1).nullable().default(null),
    sourceRef: z.string().min(1).nullable().default(null),
    provenCount: z.number().int().min(0).max(5),
    totalCount: z.literal(5),
    readyForFeatureMatrix: z.boolean(),
    generatedAt: z.string().datetime(),
    fields: z.array(FeatureSourceEntrySchema).length(5),
  })
  .strict();

export type FeatureSourceManifest = z.infer<typeof FeatureSourceManifestSchema>;

export function buildFeatureSourceManifest(input: {
  workspaceRevision: string;
  featureRevision?: string;
  packetKey?: string | null;
  sourceRef?: string | null;
}): FeatureSourceManifest {
  const fields: FeatureSourceEntry[] = [
    {
      name: 'authority_norm',
      status: 'proven',
      source: 'graph_node_metrics.pagerank',
      sourceRevision: 'live-db-2026-08-10',
      formula: 'pagerank_normalized',
      liveCoverage: 58546 / 61659,
      notes: 'PageRank join is live and packet-key aware; coverage is partial by design.',
      evidence: ['graph_node_metrics.pagerank', 'packet_key join'],
    },
    {
      name: 'domain_fit',
      status: 'proven',
      source: 'atlas_packets.domain_confidence',
      sourceRevision: 'live-db-2026-08-10',
      formula: 'domain_confidence',
      liveCoverage: 4412 / 61659,
      notes: 'Live source exists; sparse coverage is acceptable and must remain explicit.',
      evidence: ['atlas_packets.domain_confidence'],
    },
    {
      name: 'ast_signal',
      status: 'proven',
      source: 'codebase_chunk_index.ast_symbols',
      sourceRevision: 'ast-treesitter-facts.mjs',
      formula: 'tanh(symbol_count / 5)',
      liveCoverage: 2903 / 52417,
      notes: 'AST symbols are live and distribution-checked; no zero-filling allowed.',
      evidence: ['codebase_chunk_index.ast_symbols', 'web-tree-sitter'],
    },
    {
      name: 'entropy_norm',
      status: 'blocked',
      source: null,
      sourceRevision: null,
      formula: null,
      liveCoverage: null,
      notes: 'No live Engram byte/n-gram statistics table exists yet.',
      evidence: ['mapreduce_engram.py not yet run on real source text'],
    },
    {
      name: 'execution_utility',
      status: 'blocked',
      source: null,
      sourceRevision: null,
      formula: null,
      liveCoverage: null,
      notes: 'trace_runs lacks packet_key; run-level rows cannot be joined per packet as-is.',
      evidence: ['trace_runs', 'missing packet_key'],
    },
  ];

  return FeatureSourceManifestSchema.parse({
    schemaVersion: 'atlas.feature-source-manifest.v1',
    featureRevision: input.featureRevision ?? 'feature-matrix-5-t2-lineage-v1',
    workspaceRevision: input.workspaceRevision,
    packetKey: input.packetKey ?? null,
    sourceRef: input.sourceRef ?? null,
    provenCount: fields.filter((field) => field.status === 'proven').length,
    totalCount: 5,
    readyForFeatureMatrix: fields.every((field) => field.status === 'proven'),
    generatedAt: new Date().toISOString(),
    fields,
  });
}

export function validateFeatureVector5(v: readonly number[]): asserts v is FeatureVector5 {
  if (v.length !== 5 || v.some((x) => !Number.isFinite(x))) throw new Error('FeatureVector5 must contain five finite values');
}

export function scoreByCovector(x: FeatureVector5, w: FeatureVector5, bias = 0): number {
  let s = bias;
  for (let i = 0; i < 5; i += 1) s += x[i] * w[i];
  return s;
}

export function project5to2(
  x: FeatureVector5,
  p: readonly [FeatureVector5, FeatureVector5]
): readonly [number, number] {
  return [scoreByCovector(x, p[0]), scoreByCovector(x, p[1])];
}
