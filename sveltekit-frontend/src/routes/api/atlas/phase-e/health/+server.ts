/**
 * GET /api/atlas/phase-e/health
 * Returns Phase E enrichment status and metrics
 */

import { json } from '@sveltejs/kit';
import { checkPhase5EnrichmentHealth } from '$lib/server/ace/phase-e-enrichment-bridge.js';

export async function GET() {
  try {
    const health = await checkPhase5EnrichmentHealth();

    return json({
      phase_e: {
        status: health.healthy ? 'ready' : 'partial',
        healthy: health.healthy,
        metrics: health.metrics,
        timestamp: new Date().toISOString(),
      },
      enrichment_lanes: {
        neo4j_used_concept: true, // wired
        karpathy_authority: health.metrics.redis_karpathy_keys > 0,
        community_provenance: health.metrics.postgres_packets_with_community > 0,
        autoencoder_768_64: null, // placeholder
        som_topology: null, // placeholder
      },
    });
  } catch (err) {
    return json(
      {
        phase_e: {
          status: 'error',
          healthy: false,
          error: (err as Error).message,
        },
      },
      { status: 500 }
    );
  }
}
