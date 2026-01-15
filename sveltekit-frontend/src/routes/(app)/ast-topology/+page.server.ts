/**
 * Phase 89: AST Topology Explorer - Server Load
 *
 * Fetches:
 * - Error statistics from PostgreSQL
 * - Learning patterns from Qdrant
 * - Real-time fix status from Redis
 */

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  // Fetch error stats from our API
  let errorStats = {
    total: 0,
    embedded: 0,
    fixed: 0,
    sources: [] as { source: string; count: number; embedded: number }[]
  };

  let topologyData = {
    nodes: [] as Array<{
      id: string; label: string;
      type: 'file' | 'directory' | 'error' | 'cluster';
      errorCount: number; status: 'clean' | 'warning' | 'error' | 'fixing';
    }>,
    edges: [] as Array<{
      from: string; to: string;
      type: 'contains' | 'imports' | 'similar_error';
    }>
  };

  let recentActivity = [] as Array<{
    id: string; type: 'fix' | 'embed' | 'learn';
    message: string; timestamp: string;
  }>;

  try {
    // Try to fetch from internal APIs
    const [statsRes, activityRes] = await Promise.all([
      fetch('/api/phase89/stats').catch(() => null),
      fetch('/api/phase89/activity').catch(() => null)
    ]);

    if (statsRes?.ok) {
      const data = await statsRes.json();
      errorStats = data.stats ?? errorStats;
    }

    if (activityRes?.ok) {
      const data = await activityRes.json();
      recentActivity = data.activity ?? recentActivity;
    }
  } catch (e) {
    console.warn('Could not fetch Phase 89 data:', e);
  }

  return {
    errorStats,
    topologyData,
    recentActivity,
    config: { qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      ollamaModels: ['embeddinggemma:latest', 'gemma3-legal:latest']
    }
  };
};




