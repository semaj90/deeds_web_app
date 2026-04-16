/**
 * ACE (Augmented Context Engine) type contracts.
 * Defines chunk shapes, policy tiers, and context assembly results
 * used throughout the retrieval and synthesis pipeline.
 */

export interface ACEContextChunk {
  id: string;
  score: number;
  source: 'qdrant' | 'neo4j' | 'redis' | 'bifrost' | 'manual';
  file_path?: string;
  content: string;
  summary?: string;
  tags: string[];
  som_cluster?: number | null;
  graph_distance?: number | null;
  authority_score?: number | null;
}

export type ACEPolicyTier =
  | 'small'
  | 'medium'
  | 'large'
  | 'authority_heavy'
  | 'web_augmented';

export interface ACEPolicy {
  tier: ACEPolicyTier;
  maxChunks: number;
  maxCharsPerChunk: number;
  includeGraphNeighbors: boolean;
  includeWebResults: boolean;
  includeAuthorityChain: boolean;
  maxTotalChars: number;
}

export interface ACEContextResult {
  query: string;
  policy: ACEPolicy;
  chunks: ACEContextChunk[];
  cacheHit: 'l1' | 'l2' | 'miss';
  totalTokensEstimated: number;
  graphNeighborCount: number;
  durationMs: number;
}

/** Policy presets keyed by tier name. */
export const ACE_POLICIES: Record<ACEPolicyTier, ACEPolicy> = {
  small: {
    tier: 'small',
    maxChunks: 3,
    maxCharsPerChunk: 400,
    includeGraphNeighbors: false,
    includeWebResults: false,
    includeAuthorityChain: false,
    maxTotalChars: 1200,
  },
  medium: {
    tier: 'medium',
    maxChunks: 8,
    maxCharsPerChunk: 600,
    includeGraphNeighbors: true,
    includeWebResults: false,
    includeAuthorityChain: false,
    maxTotalChars: 4800,
  },
  large: {
    tier: 'large',
    maxChunks: 16,
    maxCharsPerChunk: 800,
    includeGraphNeighbors: true,
    includeWebResults: false,
    includeAuthorityChain: true,
    maxTotalChars: 12800,
  },
  authority_heavy: {
    tier: 'authority_heavy',
    maxChunks: 12,
    maxCharsPerChunk: 1000,
    includeGraphNeighbors: true,
    includeWebResults: false,
    includeAuthorityChain: true,
    maxTotalChars: 12000,
  },
  web_augmented: {
    tier: 'web_augmented',
    maxChunks: 10,
    maxCharsPerChunk: 600,
    includeGraphNeighbors: true,
    includeWebResults: true,
    includeAuthorityChain: false,
    maxTotalChars: 6000,
  },
};

/**
 * Select the appropriate ACE policy based on query length and optional
 * complexity hint.
 *
 * Rules:
 * - queryLength < 50 and no hint → small
 * - complexityHint === 'authority' → authority_heavy
 * - queryLength > 200 → large
 * - default → medium
 */
export function selectACEPolicy(
  queryLength: number,
  complexityHint?: 'simple' | 'legal' | 'authority',
): ACEPolicy {
  if (complexityHint === 'authority') {
    return ACE_POLICIES.authority_heavy;
  }
  if (queryLength < 50 && complexityHint === undefined) {
    return ACE_POLICIES.small;
  }
  if (queryLength > 200) {
    return ACE_POLICIES.large;
  }
  return ACE_POLICIES.medium;
}
