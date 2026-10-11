import { z } from 'zod';

const id = z.string().min(1);

export const MEMORY_ACTIONS = [
  'KEEP_RESIDENT', 'PREFETCH_CPU', 'PROMOTE_GPU', 'DEMOTE_CPU',
  'EVICT_RECOMPUTABLE', 'REJECT_STALE', 'WAIT_FOR_LEASE',
] as const;
export type MemoryAction = (typeof MEMORY_ACTIONS)[number];

export const cacheRecommendationV1Schema = z.object({
  schema: z.literal('atlas.cache-recommendation.v1').default('atlas.cache-recommendation.v1'),
  materializationId: id,
  canonicalId: id,
  sourceRevision: id,
  representationRevision: id,
  residentBytes: z.number().int().nonnegative(),
  predictedReuse: z.number().min(0).max(1),
  estimatedRecomputeMs: z.number().nonnegative(),
  currentlyLeased: z.boolean(),
  action: z.enum(MEMORY_ACTIONS),
  /** What the advisory signal (KMeans/SOM/HMM score) asked for, kept for audit. */
  advisoryAction: z.enum(MEMORY_ACTIONS),
  /** False when the block must not be served for a new request. */
  servable: z.boolean(),
  reasonCodes: z.array(id),
  canonicalAuthority: z.literal(false),
}).strict();

export type CacheRecommendationV1 = z.infer<typeof cacheRecommendationV1Schema>;

export interface MemoryBlockStateV1 {
  materializationId: string;
  canonicalId: string;
  sourceRevision: string;
  representationRevision: string;
  residentBytes: number;
  predictedReuse: number;
  estimatedRecomputeMs: number;
  currentlyLeased: boolean;
  tier: 'NONE' | 'CPU' | 'GPU';
  recomputable: boolean;
}

export interface DecideMemoryActionInput {
  block: MemoryBlockStateV1;
  currentSourceRevision: string;
  currentRepresentationRevision: string;
  /** Free GPU bytes from an admission source outside the CUDA process (e.g. nvidia-smi), not cudaMemGetInfo on WDDM. */
  gpuAdmissibleBytes: number;
  /** Advisory only: from HMM/KMeans/SOM policy. It can never override the guards below. */
  advisoryAction: MemoryAction;
}

/**
 * Deterministic guard policy. Guard order: stale revision, active lease, GPU
 * admission, recomputability. Advisory scores are accepted only when every
 * guard passes. No I/O, no writes; the residency owner executes the result.
 */
export function decideMemoryActionV1(input: DecideMemoryActionInput): CacheRecommendationV1 {
  const { block, advisoryAction } = input;
  const reasons: string[] = [];
  let action: MemoryAction = advisoryAction;
  let servable = true;

  const stale =
    block.sourceRevision !== input.currentSourceRevision ||
    block.representationRevision !== input.currentRepresentationRevision;

  if (stale) {
    servable = false;
    reasons.push('STALE_REVISION');
    if (block.currentlyLeased) {
      action = 'WAIT_FOR_LEASE';
      reasons.push('LEASE_PROTECTED');
    } else {
      action = 'REJECT_STALE';
    }
  } else if (block.currentlyLeased && (advisoryAction === 'DEMOTE_CPU' || advisoryAction === 'EVICT_RECOMPUTABLE')) {
    action = 'KEEP_RESIDENT';
    reasons.push('LEASE_PROTECTED');
  } else if (advisoryAction === 'PROMOTE_GPU' && block.tier !== 'GPU' && block.residentBytes > input.gpuAdmissibleBytes) {
    action = block.tier === 'CPU' ? 'KEEP_RESIDENT' : 'PREFETCH_CPU';
    reasons.push('GPU_ADMISSION_FAILED');
  } else if (advisoryAction === 'EVICT_RECOMPUTABLE' && !block.recomputable) {
    action = 'KEEP_RESIDENT';
    reasons.push('NOT_RECOMPUTABLE');
  }

  if (action !== advisoryAction && reasons.length === 0) reasons.push('GUARD_OVERRIDE');

  return cacheRecommendationV1Schema.parse({
    materializationId: block.materializationId,
    canonicalId: block.canonicalId,
    sourceRevision: block.sourceRevision,
    representationRevision: block.representationRevision,
    residentBytes: block.residentBytes,
    predictedReuse: block.predictedReuse,
    estimatedRecomputeMs: block.estimatedRecomputeMs,
    currentlyLeased: block.currentlyLeased,
    action,
    advisoryAction,
    servable,
    reasonCodes: reasons,
    canonicalAuthority: false,
  });
}
