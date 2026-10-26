/**
 * Phase 89: AST Topology Explorer - Server Load
 *
 * Fetches:
 * - Error statistics from PostgreSQL
 * - Learning patterns from Qdrant
 * - Real-time fix status from Redis
 */

import type { PageServerLoad } from './$types';
import { getQdrantUrl } from '$lib/config/env.server.js';

export const load: PageServerLoad = async ({ fetch }) => {
  // Fetch error stats from our API
  let errorStats = {
    total: 0,
    embedded: 0,
    fixed: 0,
    sources: [] as { source: string, count: number; embedded: number }[]
  };

  let topologyData = {
    nodes: [] as Array<{ id: string, label: string;
      type: 'file' | 'directory' | 'error' | 'cluster';
      errorCount: number;
	status: 'clean' | 'warning' | 'error' | 'fixing';
    }>,
    edges: [] as Array<{ from: string, to: string;
	  type: string;
    }>,
    summary: { totalFiles: 0, totalErrors: 0, totalEmbedded: 0 }
  };

  let topologyError: string | null = null;

  let recentActivity = [] as Array<{ id: string, type: 'fix' | 'embed' | 'learn';
    message: string;
	timestamp: string;
  }>;

  let statsError: string | null = null;

  try {
    // Try to fetch from internal APIs
    const [statsRes, activityRes, topologyRes] = await Promise.all([
      fetch('/api/phase89/stats').catch(() => null),
      fetch('/api/phase89/activity').catch(() => null),
      fetch('/api/phase89/topology').catch(() => null)
    ]);

    if (statsRes?.ok) {
      const data = await statsRes.json();
      statsError = data.error ?? null;
      errorStats = {
        total: Number(data.error_nodes ?? 0),
        embedded: Number(data.error_embeddings ?? 0),
        fixed: 0,
        sources: []
      };
    }

    if (activityRes?.ok) {
      const data = await activityRes.json();
      recentActivity = data.activity ?? recentActivity;
    }

    if (topologyRes?.ok) {
      const data = await topologyRes.json();
      topologyData = data.topology ?? topologyData;
      topologyError = data.error ?? null;
      errorStats = {
        ...errorStats,
        total: Number(topologyData.summary?.totalErrors ?? errorStats.total),
        embedded: Number(topologyData.summary?.totalEmbedded ?? errorStats.embedded)
      };
    } else if (topologyRes) {
      topologyError = `Topology request failed (${topologyRes.status})`;
    } else {
      topologyError = 'Topology service is unavailable';
    }
  } catch (e) {
    console.warn('Could not fetch Phase 89 data:', e);
  }

  return {
    errorStats,
    statsError,
    topologyError,
    topologyData,
    recentActivity,
    config: {
	qdrantUrl: getQdrantUrl(),
      ollamaModels: ['embeddinggemma:latest', 'ornith-1.5-9b']
    }
  };
};




