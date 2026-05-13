import * as crypto from 'node:crypto';
import type { GrpoMemoryStick } from './feature-map.types.js';

/**
 * Creates a GRPO (Group Relative Policy Optimization) memory stick for synthesis evaluation.
 * Stores what helped (selectedSourceIds) and what didn't (rejectedSourceIds).
 */
export function createGrpoMemoryStick(input: {
  featureId?: string;
  query: string;
  contextPacketHash: string;
  selectedSourceIds: string[];
  rejectedSourceIds: string[];
  rewardSignals?: GrpoMemoryStick['rewardSignals'];
  scores?: GrpoMemoryStick['scores'];
  cacheKeys?: Partial<GrpoMemoryStick['cacheKeys']>;
}): GrpoMemoryStick {
  const queryHash = crypto.createHash('sha256').update(input.query).digest('hex');
  
  return {
    id: `grpo:${queryHash.slice(0, 16)}:${input.contextPacketHash.slice(0, 12)}`,
    featureId: input.featureId,
    queryHash,
    contextPacketHash: input.contextPacketHash,
    selectedSourceIds: input.selectedSourceIds,
    rejectedSourceIds: input.rejectedSourceIds,
    rewardSignals: input.rewardSignals ?? {},
    scores: input.scores ?? {},
    cacheKeys: {
      redis: input.cacheKeys?.redis ?? [],
      bitfrost: input.cacheKeys?.bitfrost ?? [],
      qdrant: input.cacheKeys?.qdrant ?? [],
      neo4j: input.cacheKeys?.neo4j ?? []
    }
  };
}
