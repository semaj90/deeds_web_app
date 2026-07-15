/**
 * Disabled Retriever Adapter
 *
 * Explicitly reports a lane as unavailable instead of silently
 * substituting a different strategy or returning an empty array
 * without explanation.
 */

import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';

export function createDisabledRetriever(
  lane: LaneCandidate['lane'],
  reason: string,
): Retriever {
  return {
    lane,
    async retrieve(_input: RetrievalInput): Promise<LaneCandidate[]> {
      console.info(`[retriever:${lane}] disabled: ${reason}`);
      return [];
    },
  };
}
