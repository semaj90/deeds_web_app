import { z } from 'zod';

export const ContextTreeSourceSchema = z.enum([
  'QDRANT_FANOUT',
  'NEO4J_NEIGHBORHOOD',
  'NETWORKX_REFERENCE',
  'AST_PARENT_CHILD',
]);

export const ContextTreeNodeV1Schema = z.object({
  canonicalId: z.string().min(1),
  parentCanonicalId: z.string().min(1).nullable(),
  depth: z.number().int().nonnegative(),
  source: ContextTreeSourceSchema,
  cosineSimilarity: z.number().min(-1).max(1).nullable(),
  structuralAffinity: z.number().min(0).max(1).nullable(),
  sparseLexicalAffinity: z.number().min(0).max(1).nullable(),
  graphAuthority: z.number().min(0).max(1).nullable(),
  toolRelevance: z.number().min(0).max(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)).max(32),
}).strict();
export type ContextTreeNodeV1 = z.infer<typeof ContextTreeNodeV1Schema>;

export const ContextualSparseTreeV1Schema = z.object({
  schema: z.literal('atlas.contextual-sparse-tree.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  queryRepresentationRevision: z.string().min(1),
  maxDepth: z.number().int().min(0).max(32),
  maxFanoutPerNode: z.number().int().min(1).max(4096),
  nodes: z.array(ContextTreeNodeV1Schema).max(100_000),
  producerRevision: z.string().min(1),
}).strict();
export type ContextualSparseTreeV1 = z.infer<typeof ContextualSparseTreeV1Schema>;

export const ContextTreeScoringWeightsV1Schema = z.object({
  cosine: z.number().min(0),
  structural: z.number().min(0),
  lexical: z.number().min(0),
  authority: z.number().min(0),
  tool: z.number().min(0),
  temperature: z.number().positive(),
}).strict();
export type ContextTreeScoringWeightsV1 = z.infer<typeof ContextTreeScoringWeightsV1Schema>;

export type ContextTreeScoredNode = ContextTreeNodeV1 & {
  logit: number;
  probability: number;
};

const affineCosine01 = (value: number | null): number => value === null ? 0 : (value + 1) / 2;
const zero = (value: number | null): number => value ?? 0;

/** Stable softmax used only as a local fanout allocation policy. */
export function scoreContextTreeChildren(input: {
  children: readonly ContextTreeNodeV1[];
  weights: ContextTreeScoringWeightsV1;
}): ContextTreeScoredNode[] {
  const weights = ContextTreeScoringWeightsV1Schema.parse(input.weights);
  const rows = input.children.map((raw) => {
    const child = ContextTreeNodeV1Schema.parse(raw);
    const logit = (
      weights.cosine * affineCosine01(child.cosineSimilarity)
      + weights.structural * zero(child.structuralAffinity)
      + weights.lexical * zero(child.sparseLexicalAffinity)
      + weights.authority * zero(child.graphAuthority)
      + weights.tool * zero(child.toolRelevance)
    ) / weights.temperature;
    return { child, logit };
  });

  if (rows.length === 0) return [];
  const maxLogit = Math.max(...rows.map((row) => row.logit));
  const exp = rows.map((row) => Math.exp(row.logit - maxLogit));
  const denominator = exp.reduce((sum, value) => sum + value, 0);

  return rows.map((row, index) => ({
    ...row.child,
    logit: row.logit,
    probability: denominator > 0 ? exp[index] / denominator : 1 / rows.length,
  })).sort((a, b) =>
    b.probability - a.probability
    || a.canonicalId.localeCompare(b.canonicalId));
}

/**
 * Select a bounded sparse child frontier. Softmax is allocation, not truth:
 * omitted children remain reachable through later graph expansion or exact
 * promotion and do not receive a negative relevance claim.
 */
export function selectContextTreeFanout(input: {
  children: readonly ContextTreeNodeV1[];
  weights: ContextTreeScoringWeightsV1;
  maxChildren: number;
  minimumProbability?: number;
}): ContextTreeScoredNode[] {
  const maxChildren = Math.max(0, Math.floor(input.maxChildren));
  const minimumProbability = Math.max(0, Math.min(1, input.minimumProbability ?? 0));
  return scoreContextTreeChildren({ children: input.children, weights: input.weights })
    .filter((row) => row.probability >= minimumProbability)
    .slice(0, maxChildren);
}

export function cosineSimilarity01(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = Number(left[i]);
    const b = Number(right[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return Math.max(0, Math.min(1, (dot / Math.sqrt(leftNorm * rightNorm) + 1) / 2));
}
