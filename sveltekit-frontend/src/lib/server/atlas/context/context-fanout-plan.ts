import { z } from 'zod';
import {
  ContextTreeNodeV1Schema,
  selectContextTreeFanout,
  type ContextTreeNodeV1,
  type ContextTreeScoringWeightsV1,
  type ContextTreeScoredNode,
} from './contextual-sparse-tree.js';

export const ContextFanoutExecutorSchema = z.enum([
  'QDRANT_QUERY_API',
  'NEO4J_READ',
  'NETWORKX_REFERENCE',
]);

export const ContextFanoutPlanV1Schema = z.object({
  schema: z.literal('atlas.context-fanout-plan.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  queryRepresentationRevision: z.string().min(1),
  seedCanonicalIds: z.array(z.string().min(1)).min(1).max(256),
  qdrantTopKPerSeed: z.number().int().min(0).max(4096),
  neo4jTopKPerSeed: z.number().int().min(0).max(4096),
  maxDepth: z.number().int().min(0).max(32),
  maxChildrenPerParent: z.number().int().min(1).max(4096),
  executors: z.array(ContextFanoutExecutorSchema).min(1).max(3),
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ContextFanoutPlanV1 = z.infer<typeof ContextFanoutPlanV1Schema>;

export interface ContextFanoutCandidate {
  canonicalId: string;
  parentCanonicalId: string | null;
  depth: number;
  source: 'QDRANT_FANOUT' | 'NEO4J_NEIGHBORHOOD' | 'NETWORKX_REFERENCE' | 'AST_PARENT_CHILD';
  cosineSimilarity?: number | null;
  structuralAffinity?: number | null;
  sparseLexicalAffinity?: number | null;
  graphAuthority?: number | null;
  toolRelevance?: number | null;
  evidenceRefs?: readonly string[];
}

/**
 * Compose already-resolved fanout results. This file intentionally does not
 * query Qdrant or Neo4j itself; those stores keep their existing ownership and
 * are injected by adapters/workers. NetworkX remains a reference executor.
 */
export function composeContextFanout(input: {
  plan: ContextFanoutPlanV1;
  candidates: readonly ContextFanoutCandidate[];
  weights: ContextTreeScoringWeightsV1;
}): {
  selectedByParent: Map<string, ContextTreeScoredNode[]>;
  selectedCanonicalIds: string[];
  allNodes: ContextTreeNodeV1[];
} {
  const plan = ContextFanoutPlanV1Schema.parse(input.plan);
  const dedup = new Map<string, ContextTreeNodeV1>();

  for (const raw of input.candidates) {
    if (raw.depth > plan.maxDepth) continue;
    const node = ContextTreeNodeV1Schema.parse({
      canonicalId: raw.canonicalId,
      parentCanonicalId: raw.parentCanonicalId,
      depth: raw.depth,
      source: raw.source,
      cosineSimilarity: raw.cosineSimilarity ?? null,
      structuralAffinity: raw.structuralAffinity ?? null,
      sparseLexicalAffinity: raw.sparseLexicalAffinity ?? null,
      graphAuthority: raw.graphAuthority ?? null,
      toolRelevance: raw.toolRelevance ?? null,
      evidenceRefs: [...new Set(raw.evidenceRefs ?? [])].sort(),
    });

    // Same canonical child under the same parent is one tree candidate even if
    // multiple executors surfaced it. Preserve the strongest numeric evidence
    // and union evidence refs rather than adding duplicate votes.
    const key = `${node.parentCanonicalId ?? '<root>'}\0${node.canonicalId}`;
    const prior = dedup.get(key);
    if (!prior) {
      dedup.set(key, node);
      continue;
    }
    const maxNullable = (a: number | null, b: number | null): number | null => {
      if (a === null) return b;
      if (b === null) return a;
      return Math.max(a, b);
    };
    dedup.set(key, {
      ...prior,
      cosineSimilarity: maxNullable(prior.cosineSimilarity, node.cosineSimilarity),
      structuralAffinity: maxNullable(prior.structuralAffinity, node.structuralAffinity),
      sparseLexicalAffinity: maxNullable(prior.sparseLexicalAffinity, node.sparseLexicalAffinity),
      graphAuthority: maxNullable(prior.graphAuthority, node.graphAuthority),
      toolRelevance: maxNullable(prior.toolRelevance, node.toolRelevance),
      evidenceRefs: [...new Set([...prior.evidenceRefs, ...node.evidenceRefs])].sort(),
    });
  }

  const allNodes = [...dedup.values()].sort((a, b) =>
    a.depth - b.depth
    || (a.parentCanonicalId ?? '').localeCompare(b.parentCanonicalId ?? '')
    || a.canonicalId.localeCompare(b.canonicalId));

  const grouped = new Map<string, ContextTreeNodeV1[]>();
  for (const node of allNodes) {
    const parent = node.parentCanonicalId ?? '<root>';
    const rows = grouped.get(parent) ?? [];
    rows.push(node);
    grouped.set(parent, rows);
  }

  const selectedByParent = new Map<string, ContextTreeScoredNode[]>();
  const selectedCanonicalIds = new Set<string>();
  for (const [parent, children] of grouped) {
    const selected = selectContextTreeFanout({
      children,
      weights: input.weights,
      maxChildren: plan.maxChildrenPerParent,
    });
    selectedByParent.set(parent, selected);
    for (const child of selected) selectedCanonicalIds.add(child.canonicalId);
  }

  return {
    selectedByParent,
    selectedCanonicalIds: [...selectedCanonicalIds].sort(),
    allNodes,
  };
}
