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
) => Promise<Record<string, unknown>>;

export async function expandLOD(
  candidate: LodLadderCandidate,
  targetTier: LodTier,
  loader: LodExpansionLoader,
): Promise<LodLadderCandidate> {
  const currentRank = LOD_TIER_ORDER[candidate.currentTier];
  const targetRank = LOD_TIER_ORDER[targetTier];

  if (targetRank <= currentRank) {
    // Already at or above requested level of detail
    return candidate;
  }

  const enrichedData = await loader(candidate.candidateId, targetTier);
  return {
    candidateId: candidate.candidateId,
    currentTier: targetTier,
    data: {
      ...candidate.data,
      ...enrichedData,
    },
  };
}
