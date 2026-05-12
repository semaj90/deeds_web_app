import { json } from '@sveltejs/kit';
import { resolveRuntimeConfig } from '$lib/server/ai/inference-configs.js';
import { CudaGraphManager } from '$lib/server/ai/cuda-graph-manager.js';
import { isTopologySearchHealthy } from '$lib/server/retrieval/topology-search-client.js';

/**
 * GET /api/health/inference
 * 
 * Reports the status of the inference stack, including active runtime profiles,
 * GPU bridge availability (CUDA Graphs), and downstream service health.
 */
export async function GET() {
  const runtime = resolveRuntimeConfig();
  const cudaGraphAvailable = CudaGraphManager.isAvailable();
  const topologyHealthy = await isTopologySearchHealthy();

  return json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    runtime: {
      profile: runtime.profile,
      backend: runtime.backend,
      turboQuant: runtime.turboQuant,
      runtimeAvailable: runtime.runtimeAvailable,
      notes: runtime.notes
    },
    gpu: {
      cudaGraphSupported: cudaGraphAvailable,
      topologySearchHealthy: topologyHealthy
    },
    recommendation: runtime.profile === 'stock' 
      ? 'Using stock CUDA + IQ4_XS weights. Reliable but missing RotorQuant compression.'
      : 'Using specialized fork for optimized inference.'
  });
}
