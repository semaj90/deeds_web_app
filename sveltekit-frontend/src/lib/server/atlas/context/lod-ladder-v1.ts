import { z } from 'zod';

/**
 * LOD-LADDER-V1
 * 
 * Eight-Tier Memory Hierarchy and Level of Detail (LOD) expansion ladder:
 * - L0: Typed ordinal (1–4 bytes: domain/concept/entity/relation IDs)
 * - L1: Compact feature card (tens/hundreds bytes: graph ranks, latent refs)
 * - L2: Latent vector (64/128 dims)
 * - L3: Canonical semantic vector (semantic_768)
 * - L4: Packet / grounded ontology tuple set
 * - L5: Structural graph neighborhood
 * - L6: Exact source evidence & byte spans
 * - L7: Full prompt / model state (tokens, KV cache, hidden state)
 */

export const LodTierSchema = z.enum([
  'L0_TYPED_ORDINAL',
  'L1_FEATURE_CARD',
  'L2_LATENT_VECTOR',
  'L3_SEMANTIC_VECTOR',
  'L4_ONTOLOGY_TUPLES',
  'L5_GRAPH_NEIGHBORHOOD',
  'L6_SOURCE_EVIDENCE',
  'L7_MODEL_STATE',
]);

export type LodTier = z.infer<typeof LodTierSchema>;

export const LOD_TIER_ORDER: Record<LodTier, number> = {
  L0_TYPED_ORDINAL: 0,
  L1_FEATURE_CARD: 1,
  L2_LATENT_VECTOR: 2,
  L3_SEMANTIC_VECTOR: 3,
  L4_ONTOLOGY_TUPLES: 4,
  L5_GRAPH_NEIGHBORHOOD: 5,
  L6_SOURCE_EVIDENCE: 6,
  L7_MODEL_STATE: 7,
};

export interface LodLadderCandidate {
  candidateId: string;
  currentTier: LodTier;
  data: Record<string, unknown>;
}

export type LodExpansionLoader = (
  candidateId: string,
  targetTier: LodTier,
  signal?: AbortSignal,
) => Promise<Record<string, unknown>>;

export interface ExpandLodOptions {
  signal?: AbortSignal;
  maxBytes?: number;
  expectedRevision?: string;
  requireRevision?: boolean;
  expectedChecksum?: string;
  allowModelState?: boolean;
}

export const DEFAULT_LOD_MAX_BYTES = 512 * 1024;
const FORBIDDEN_RUNTIME_KEYS = new Set([
  'hiddenThoughts',
  'chainOfThought',
  'kv_cache',
  'kvCache',
  'hiddenState',
]);

export function isServiceWorkerCacheableTier(tier: LodTier): boolean {
  return tier !== 'L7_MODEL_STATE';
}

export function createLodConsumerLease(onReleaseLast: () => void): {
  acquire: () => () => void;
  activeConsumers: () => number;
} {
  let count = 0;
  let releasedAll = false;
  return {
    acquire() {
      count += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        count = Math.max(0, count - 1);
        if (count === 0 && !releasedAll) {
          releasedAll = true;
          onReleaseLast();
        }
      };
    },
    activeConsumers() {
      return count;
    },
  };
}

export async function expandLOD(
  candidate: LodLadderCandidate,
  targetTier: LodTier,
  loader: LodExpansionLoader,
  options: ExpandLodOptions = {},
): Promise<LodLadderCandidate> {
  if (options.signal?.aborted) {
    throw new Error('LOD_EXPANSION_ABORTED');
  }
  if (targetTier === 'L7_MODEL_STATE' && !options.allowModelState) {
    throw new Error('LOD_L7_MODEL_STATE_FORBIDDEN');
  }

  const maxBytes = options.maxBytes ?? DEFAULT_LOD_MAX_BYTES;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('LOD_BYTE_BUDGET_INVALID');
  }

  const currentRank = LOD_TIER_ORDER[candidate.currentTier];
  const targetRank = LOD_TIER_ORDER[targetTier];

  if (targetRank <= currentRank) {
    // Already at or above requested level of detail
    return candidate;
  }

  const enrichedData = await loader(candidate.candidateId, targetTier, options.signal);
  if (options.signal?.aborted) {
    throw new Error('LOD_EXPANSION_ABORTED');
  }

  if (!options.allowModelState) {
    for (const key of Object.keys(enrichedData)) {
      if (FORBIDDEN_RUNTIME_KEYS.has(key)) {
        throw new Error(`LOD_FORBIDDEN_RUNTIME_STATE:${key}`);
      }
    }
  }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(enrichedData)).byteLength;
  if (payloadBytes > maxBytes) {
    throw new Error(`LOD_BYTE_BUDGET_EXCEEDED:${payloadBytes}>${maxBytes}`);
  }

  const actualRevision = enrichedData.sourceRevision ?? enrichedData.revision;
  if (options.requireRevision && typeof actualRevision !== 'string') {
    throw new Error('LOD_STALE_REVISION:MISSING');
  }
  if (
    options.expectedRevision !== undefined
    && actualRevision !== undefined
    && actualRevision !== options.expectedRevision
  ) {
    throw new Error('LOD_STALE_REVISION');
  }

  if (
    options.expectedChecksum !== undefined
    && enrichedData.checksum !== undefined
    && enrichedData.checksum !== options.expectedChecksum
  ) {
    throw new Error('LOD_CHECKSUM_MISMATCH');
  }

  return {
    candidateId: candidate.candidateId,
    currentTier: targetTier,
    data: {
      ...candidate.data,
      ...enrichedData,
    },
  };
}
