import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SEMANTIC_TAGS, type SemanticTag } from './gpu-karpathy-tagger.js';

/**
 * KarpathyDagHitSchema
 * 
 * Bounded schema representing a cached DAG hit returned during dense agentic indexing.
 * Enforces provenance, revision qualification, and non-authoritative bounds.
 */
export const KarpathyDagHitSchema = z.object({
  nodeId: z.string().min(1),
  filePath: z.string().min(1),
  semanticTag: z.enum(SEMANTIC_TAGS),
  similarityScore: z.number().min(0).max(1),
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  dagLevel: z.enum(['FILE', 'SYMBOL', 'CLUSTER', 'FUSED_TOPOLOGY']),
  dependencies: z.array(z.string().min(1)),
  dependents: z.array(z.string().min(1)),
  cacheKey: z.string().regex(/^dag:karpathy:[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
}).strict();

export type KarpathyDagHit = z.infer<typeof KarpathyDagHitSchema>;

export interface DenseSearchQueryInput {
  query: string;
  sourceFiles: readonly string[];
  currentSourceRevisions: Readonly<Record<string, string>>; // filePath -> sha256
  topK?: number;
  minSimilarity?: number;
}

/**
 * Pure helper calculating deterministic DAG cache keys based on source revisions and semantic tag.
 */
export function buildKarpathyDagCacheKey(
  filePath: string,
  sourceRevision: string,
  tag: SemanticTag
): string {
  const hash = createHash('sha256')
    .update(`${filePath}:${sourceRevision}:${tag}`)
    .digest('hex');
  return `dag:karpathy:${hash}`;
}

/**
 * Filters and validates cached DAG hits against current source revisions to prevent stale index consumption.
 */
export function resolveValidDagHits(
  cachedHits: readonly KarpathyDagHit[],
  currentSourceRevisions: Readonly<Record<string, string>>
): KarpathyDagHit[] {
  return cachedHits.filter((hit) => {
    const currentRev = currentSourceRevisions[hit.filePath];
    return currentRev !== undefined && currentRev === hit.sourceRevision;
  });
}

/**
 * Ranks candidate DAG hits by combining semantic similarity and topological connectivity.
 * Fused Score = 0.5 * similarity + 0.3 * normalized_dependents + 0.2 * normalized_dependencies
 */
export function rankDenseDagHits(
  hits: readonly KarpathyDagHit[],
  topK = 5
): KarpathyDagHit[] {
  const scored = hits.map((hit) => {
    const depScore = Math.min(1.0, hit.dependencies.length / 10);
    const dependentsScore = Math.min(1.0, hit.dependents.length / 10);
    const fusedScore = 0.5 * hit.similarityScore + 0.3 * dependentsScore + 0.2 * depScore;
    return { hit, fusedScore };
  });

  scored.sort((a, b) => b.fusedScore - a.fusedScore);
  return scored.slice(0, Math.max(1, topK)).map((s) => s.hit);
}
