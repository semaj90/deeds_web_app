/**
 * Cache Layers Orchestrator — Layers 2-4 Integration
 *
 * Measures and coordinates three independent cache layers:
 * 1. Layer 2: OpenCode provider adapter (port 8091)
 * 2. Layer 3: BitFrost exact packet cache (Valkey key: bifrost:packet:{key})
 * 3. Layer 4: BitFrost semantic packet cache (Valkey key: ace:cache:{intentHash}:{hmmState})
 *
 * Each layer has isolated measurement, no data conflation.
 * Non-blocking: failures in Layer 2-4 do not cascade; fallback to Layer 1 (direct llama.cpp).
 */

import { createHash } from 'crypto';

export interface CacheLayerMetrics {
  layer: 'layer2_adapter' | 'layer3_exact' | 'layer4_semantic';
  hit: boolean;
  latency_ms: number;
  source?: string;
  error?: string;
}

export interface CacheLayersOrchestrationResult {
  layer1_direct_fallback_ms: number;
  layer2_adapter?: CacheLayerMetrics;
  layer3_exact?: CacheLayerMetrics;
  layer4_semantic?: CacheLayerMetrics;
  cache_decision: 'layer2' | 'layer3' | 'layer4' | 'layer1_direct';
  total_orchestration_ms: number;
}

/**
 * Layer 2: OpenCode Adapter Cache
 *
 * Provider adapter at port 8091 wraps llama.cpp :8090 with tool-call support.
 * Measures whether adapter adds overhead and whether it inherits KV cache reuse.
 */
async function measureLayer2Adapter(
  systemPrompt: string,
  userPrompt: string
): Promise<CacheLayerMetrics> {
  const start = performance.now();
  try {
    const body = JSON.stringify({
      model: 'gemma4-legal-iq4xs-direct.gguf',
      temperature: 0,
      max_tokens: 96,
      stream: false,
      cache_prompt: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const response = await fetch('http://127.0.0.1:8091/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!response.ok) {
      return {
        layer: 'layer2_adapter',
        hit: false,
        latency_ms: performance.now() - start,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    const latency = performance.now() - start;

    // Check if adapter preserved cache metrics from llama.cpp
    const adapterTimings = data.timings || {};
    const promptEvalMs = adapterTimings.prompt_ms ?? 0;
    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;

    return {
      layer: 'layer2_adapter',
      hit: cachedTokens > 0 || promptEvalMs < 100,
      latency_ms: latency,
      source: `adapter_promptEval=${promptEvalMs}ms cached=${cachedTokens}`
    };
  } catch (error) {
    return {
      layer: 'layer2_adapter',
      hit: false,
      latency_ms: performance.now() - start,
      error: String(error)
    };
  }
}

/**
 * Layer 3: BitFrost Exact Cache (Valkey)
 *
 * Exact-match cache for (intent_hash, HMM_state) tuples.
 * Cache key: bifrost:packet:{intentHash}
 *
 * Test whether Redis lookup is faster than compute.
 */
async function measureLayer3Exact(intentHash: string): Promise<CacheLayerMetrics> {
  const start = performance.now();
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const cacheKey = `bifrost:packet:${intentHash}`;

    // Non-blocking GET attempt
    const cached = await Promise.race([
      redis.get(cacheKey),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)) // 100ms timeout
    ]);

    const latency = performance.now() - start;

    return {
      layer: 'layer3_exact',
      hit: !!cached,
      latency_ms: latency,
      source: cached ? `redis_hit (${(cached as string).length} bytes)` : 'cache_miss'
    };
  } catch (error) {
    return {
      layer: 'layer3_exact',
      hit: false,
      latency_ms: performance.now() - start,
      error: String(error)
    };
  }
}

/**
 * Layer 4: BitFrost Semantic Cache (Valkey)
 *
 * Semantic-match cache for paraphrased intents.
 * Cache key: ace:cache:{intentHash}:{hmmState}
 *
 * Test whether semantic similarity lookup beats recomputation.
 */
async function measureLayer4Semantic(
  intentHash: string,
  hmmState: string = 'RETRIEVE'
): Promise<CacheLayerMetrics> {
  const start = performance.now();
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const cacheKey = `ace:cache:${intentHash}:${hmmState}`;

    // Non-blocking GET with timeout
    const cached = await Promise.race([
      redis.get(cacheKey),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))
    ]);

    const latency = performance.now() - start;

    return {
      layer: 'layer4_semantic',
      hit: !!cached,
      latency_ms: latency,
      source: cached ? `redis_hit (${(cached as string).length} bytes)` : 'cache_miss'
    };
  } catch (error) {
    return {
      layer: 'layer4_semantic',
      hit: false,
      latency_ms: performance.now() - start,
      error: String(error)
    };
  }
}

/**
 * Orchestrate all four layers in parallel.
 * Returns the fastest cache hit, or falls back to Layer 1 (direct llama.cpp).
 *
 * @param systemPrompt System context for retrieval
 * @param userPrompt User query
 * @param measureDirect Latency from direct llama.cpp :8090 (Layer 1)
 */
export async function orchestrateCacheLayers(
  systemPrompt: string,
  userPrompt: string,
  measureDirect: number
): Promise<CacheLayersOrchestrationResult> {
  const start = performance.now();

  // Compute intent hash (same logic as Bifrost)
  const intentHash = createHash('sha256')
    .update(userPrompt)
    .digest('hex')
    .substring(0, 16); // First 128 bits

  // Run layers 2-4 in parallel (non-blocking)
  const [layer2, layer3, layer4] = await Promise.all([
    measureLayer2Adapter(systemPrompt, userPrompt).catch((error) => ({
      layer: 'layer2_adapter' as const,
      hit: false,
      latency_ms: performance.now() - start,
      error: String(error)
    })),
    measureLayer3Exact(intentHash),
    measureLayer4Semantic(intentHash)
  ]);

  const totalMs = performance.now() - start;

  // Decision logic: pick fastest cache hit; otherwise fall back to Layer 1
  let cacheDecision: 'layer2' | 'layer3' | 'layer4' | 'layer1_direct';
  const candidates = [
    { layer: 'layer2', metrics: layer2, speedup: measureDirect - layer2.latency_ms },
    { layer: 'layer3', metrics: layer3, speedup: measureDirect - layer3.latency_ms },
    { layer: 'layer4', metrics: layer4, speedup: measureDirect - layer4.latency_ms }
  ];

  const cacheHit = candidates.find((c) => c.metrics.hit && c.speedup > 10);
  cacheDecision = cacheHit ? (cacheHit.layer as any) : 'layer1_direct';

  return {
    layer1_direct_fallback_ms: measureDirect,
    layer2_adapter: layer2,
    layer3_exact: layer3,
    layer4_semantic: layer4,
    cache_decision: cacheDecision,
    total_orchestration_ms: totalMs
  };
}

/**
 * Health check: verify Layers 2-4 are accessible (read-only).
 */
export async function checkCacheLayersHealth(): Promise<{
  layer2_adapter: boolean;
  layer3_valkey: boolean;
  layer4_valkey: boolean;
}> {
  const [layer2, layer3, layer4] = await Promise.allSettled([
    fetch('http://127.0.0.1:8091/v1/models', { signal: AbortSignal.timeout(1000) })
      .then((r) => r.ok)
      .catch(() => false),
    (async () => {
      const { getRedis } = await import('$lib/server/redis.js');
      return getRedis()
        .ping()
        .then(() => true)
        .catch(() => false);
    })(),
    (async () => {
      const { getRedis } = await import('$lib/server/redis.js');
      return getRedis()
        .ping()
        .then(() => true)
        .catch(() => false);
    })()
  ]);

  return {
    layer2_adapter: layer2.status === 'fulfilled' ? layer2.value : false,
    layer3_valkey: layer3.status === 'fulfilled' ? layer3.value : false,
    layer4_valkey: layer4.status === 'fulfilled' ? layer4.value : false
  };
}
