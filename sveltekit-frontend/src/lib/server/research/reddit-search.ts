/**
 * reddit-search.ts — Research subagent wrapper for Reddit.
 * 
 * Enforces raw_json=1 to prevent HTML escaping corruption.
 * Trust Priority: Low (Source of truth for community sentiment/unoffical workarounds).
 */

import { searchReddit } from './reddit-harvester.js';
import type { WebResearchChunk } from './web-research-ingester.js';

export const redditSearch = {
  /**
   * Search Reddit posts with keyword search and top sorting.
   */
  search: async (query: string, limit: number = 10): Promise<WebResearchChunk[]> => {
    const result = await searchReddit({
      query,
      limit,
      sort: 'top',
      timeRange: 'year'
    });
    return result.chunks;
  }
};
