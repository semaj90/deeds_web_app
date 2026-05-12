/**
 * GraphML Client — server-only.
 *
 * Thin TypeScript bridge for the 4 GPU graph-ML operations defined in graph_ml.proto.
 * Execution priority per call:
 *   1. Local N-API (pytorch-graph.ts)  — fastest, synchronous, RTX 3060 Ti CUDA
 *   2. Remote gRPC                     — when GRAPH_ML_GRPC_ENABLED=true
 *   3. CPU JS fallback                 — always available (pytorch-graph.ts internals)
 *
 * All addresses resolved via ENV.* getters in env.server.ts.
 */

import {
  pageRankGPU,
  kmeansWithCentroids,
  attentionScoreGPU,
  trainSOM,
  rewardScoreGPU,
  isPytorchGpuAvailable,
} from '$lib/server/gpu/pytorch-graph.js';
import { ENV } from '$lib/server/env.server.js';
import { buildGrpcClientChannelOptions } from './client-options.js';

// ── Result types ──────────────────────────────────────────────────────────────

export interface GraphMLKMeansResult {
  assignments: Int32Array;
  centroids: Float32Array;
  source: 'gpu' | 'cpu' | 'grpc';
  durationMs: number;
}

export interface GraphMLSOMResult {
  weights: Float32Array;
  bmu: Int32Array;
  source: 'gpu' | 'cpu' | 'grpc';
  durationMs: number;
}

export interface GraphMLAttentionResult {
  scores: Float32Array;
  source: 'gpu' | 'cpu' | 'grpc';
}

export interface GraphMLPageRankResult {
  scores: Float32Array;
  source: 'gpu' | 'cpu' | 'grpc';
}

// ── gRPC stub (TODO: wire actual transport once proto stubs are generated) ────
//
// To activate the gRPC path:
//   1. Run `npx grpc_tools_node_protoc` against graph_ml.proto to generate
//      graph_ml_grpc_pb.js + graph_ml_pb.js (or use @grpc/proto-loader at runtime).
//   2. Replace the stub body below with the real client call, mirroring the
//      pattern in embedding-client.ts (lazy import, deadline, callback → Promise).
//   3. Set GRAPH_ML_GRPC_ENABLED=true in .env and point GRAPH_ML_GRPC_URL at the
//      Go microservice address (e.g. via ENV.GRAPH_ML_GRPC_URL).

let _grpcClient: any = null;
let _grpcLoadFailed = false;
let _grpcRetryAt = 0;
let _grpcFailLogged = false;

async function getGrpcClient(): Promise<any> {
  if (_grpcLoadFailed) {
    if (Date.now() < _grpcRetryAt) return null;
    _grpcLoadFailed = false;
    _grpcClient = null;
  }
  if (_grpcClient) return _grpcClient;

  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');
    const { resolve } = await import('path');

    const PROTO_PATH = resolve(process.cwd(), 'src/lib/server/grpc/graph_ml.proto');

    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    const GraphMLService = protoDescriptor?.graphml?.GraphMLService;

    if (!GraphMLService) throw new Error('GraphMLService not found in proto descriptor');

    const url = ENV.GRAPH_ML_GRPC_URL;
    _grpcClient = new GraphMLService(
      url,
      grpc.credentials.createInsecure(),
      buildGrpcClientChannelOptions({
        maxConnectionIdleMs: 300_000,
        maxSendMessageLength: 32 * 1024 * 1024,
        maxReceiveMessageLength: 32 * 1024 * 1024,
      })
    );

    return _grpcClient;
  } catch (err) {
    if (!_grpcFailLogged) {
      console.warn(
        '[graph-ml-client] gRPC client init failed, falling back to N-API/CPU:',
        (err as Error).message
      );
      _grpcFailLogged = true;
    }
    _grpcLoadFailed = true;
    _grpcRetryAt = Date.now() + 30_000;
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * K-means clustering with centroid output.
 * Priority: 1. Local N-API GPU, 2. Remote gRPC, 3. Local CPU JS.
 */
export async function runKMeans(
  embeddings: Float32Array,
  n: number,
  dim: number,
  k: number,
  maxIters = 100
): Promise<GraphMLKMeansResult> {
  const t0 = performance.now();

  // 1. Try local path first
  const local = kmeansWithCentroids(embeddings, n, dim, k, maxIters);
  if (local.source === 'gpu') {
    return {
      assignments: local.assignments,
      centroids: local.centroids,
      source: 'gpu',
      durationMs: Math.round(performance.now() - t0),
    };
  }

  // 2. Try gRPC path if enabled
  if (ENV.GRAPH_ML_GRPC_ENABLED) {
    const client = await getGrpcClient();
    if (client) {
      try {
        const response = await new Promise<any>((resolve, reject) => {
          client.RunKMeans(
            {
              embeddings: Array.from(embeddings),
              n,
              dim,
              k,
              maxIters,
            },
            (err: Error | null, resp: any) => (err ? reject(err) : resolve(resp))
          );
        });
        return {
          assignments: new Int32Array(response.assignments),
          centroids: new Float32Array(response.centroids),
          source: 'grpc',
          durationMs: Math.round(performance.now() - t0),
        };
      } catch (err) {
        console.warn('[graph-ml-client] gRPC RunKMeans failed, falling back to CPU:', (err as Error).message);
      }
    }
  }

  // 3. Fallback to CPU result (already computed in local step)
  return {
    assignments: local.assignments,
    centroids: local.centroids,
    source: 'cpu',
    durationMs: Math.round(performance.now() - t0),
  };
}

/**
 * Kohonen Self-Organizing Map training.
 * Priority: 1. Local N-API GPU, 2. Remote gRPC, 3. Local CPU JS.
 */
export async function runSOM(
  embeddings: Float32Array,
  n: number,
  dim: number,
  gridW: number,
  gridH: number,
  iters = 1000,
  lrInit = 0.1,
  lrFinal = 0.01,
  radInit = Math.max(gridW, gridH) / 2,
  radFinal = 1.0
): Promise<GraphMLSOMResult> {
  const t0 = performance.now();

  // 1. Try local
  const local = trainSOM(embeddings, n, dim, gridW, gridH, iters, lrInit, lrFinal, radInit, radFinal);
  if (local.source === 'gpu') {
    return {
      weights: local.weights,
      bmu: local.bmu,
      source: 'gpu',
      durationMs: Math.round(performance.now() - t0),
    };
  }

  // 2. Try gRPC
  if (ENV.GRAPH_ML_GRPC_ENABLED) {
    const client = await getGrpcClient();
    if (client) {
      try {
        const response = await new Promise<any>((resolve, reject) => {
          client.RunSOM(
            {
              embeddings: Array.from(embeddings),
              n,
              dim,
              gridW,
              gridH,
              iters,
              lrInit,
              lrFinal,
              radInit,
              radFinal,
            },
            (err: Error | null, resp: any) => (err ? reject(err) : resolve(resp))
          );
        });
        return {
          weights: new Float32Array(response.weights),
          bmu: new Int32Array(response.bmu),
          source: 'grpc',
          durationMs: Math.round(performance.now() - t0),
        };
      } catch (err) {
        console.warn('[graph-ml-client] gRPC RunSOM failed:', (err as Error).message);
      }
    }
  }

  return {
    weights: local.weights,
    bmu: local.bmu,
    source: 'cpu',
    durationMs: Math.round(performance.now() - t0),
  };
}

/**
 * Scaled dot-product attention weights.
 */
export async function scoreAttention(
  query: Float32Array,
  dim: number,
  keys: Float32Array,
  n: number
): Promise<GraphMLAttentionResult> {
  // 1. Try local
  const local = attentionScoreGPU(query, dim, keys, n);
  if (local.source === 'gpu') {
    return {
      scores: local.weights,
      source: 'gpu',
    };
  }

  // 2. Try gRPC
  if (ENV.GRAPH_ML_GRPC_ENABLED) {
    const client = await getGrpcClient();
    if (client) {
      try {
        const response = await new Promise<any>((resolve, reject) => {
          client.ScoreAttention(
            {
              query: Array.from(query),
              dim,
              keys: Array.from(keys),
              n,
            },
            (err: Error | null, resp: any) => (err ? reject(err) : resolve(resp))
          );
        });
        return {
          scores: new Float32Array(response.scores),
          source: 'grpc',
        };
      } catch (err) {
        console.warn('[graph-ml-client] gRPC ScoreAttention failed:', (err as Error).message);
      }
    }
  }

  return {
    scores: local.weights,
    source: 'cpu',
  };
}

/**
 * GPU power-iteration PageRank for code dependency graphs.
 */
export async function runPageRank(
  adj: Float32Array,
  n: number,
  damping = 0.85,
  iters = 50
): Promise<GraphMLPageRankResult> {
  // 1. Try local
  const local = pageRankGPU(adj, n, damping, iters);
  if (local.source === 'gpu') {
    return {
      scores: local.scores,
      source: 'gpu',
    };
  }

  // 2. Try gRPC
  if (ENV.GRAPH_ML_GRPC_ENABLED) {
    const client = await getGrpcClient();
    if (client) {
      try {
        const response = await new Promise<any>((resolve, reject) => {
          client.RunPageRank(
            {
              adj: Array.from(adj),
              n,
              damping,
              iters,
            },
            (err: Error | null, resp: any) => (err ? reject(err) : resolve(resp))
          );
        });
        return {
          scores: new Float32Array(response.scores),
          source: 'grpc',
        };
      } catch (err) {
        console.warn('[graph-ml-client] gRPC RunPageRank failed:', (err as Error).message);
      }
    }
  }

  return {
    scores: local.scores,
    source: 'cpu',
  };
}

/**
 * GRPO reward score for LangGraph synthesis evaluation.
 */
export async function scoreGRPOReward(
  genEmbedding: Float32Array,
  queryEmbedding: Float32Array,
  dim: number
): Promise<{ reward: number; source: 'gpu' | 'cpu' }> {
  // Note: gRPC service currently does not expose RewardScore, stays local.
  const result = rewardScoreGPU(genEmbedding, queryEmbedding, 1, dim);
  return { reward: result.scores[0] ?? 0, source: result.source };
}

// ── Re-export rewardScoreGPU for GRPO consumers ───────────────────────────────

export { rewardScoreGPU };

// ── Memory Checkpoint — gRPC serialization for QLoRA adapter selection ────────

/**
 * A memory checkpoint is the HGNN-enriched X_prime centroid for one hyperedge,
 * serialized for consumption by the QLoRA adapter selector:
 *
 *   X_prime[j] (768-dim, reward-weighted cluster mean)
 *     → cosine distance to each LoRA adapter's parameter-space embedding
 *     → nearest adapter loaded for this query's inference request
 *
 * This closes the self-modification loop:
 *   user query → selectAdaptiveMemory → X_prime centroid
 *     → publishMemoryCheckpoints → gRPC server → LoRA adapter selection
 *     → inference with domain-specific adapter weights
 *     → user feedback → adaptFromAnalytics → RL policy update → rebuild
 */
export interface MemoryCheckpoint {
  hyperedgeHash: string; // 8-char FNV-1a key
  xPrimeCentroid: Float32Array; // 768-dim HGNN-enriched centroid
  gradeScore: number; // [0,1] GRPO reward signal
  gradeLabel: string; // 'A'|'B'|'C'|'D'
  pipeline: string; // dominant pipeline label
  memberCount: number;
  loraHint: string; // 'legal_rag' | 'legal_kag' | 'legal_dag' | 'legal_ace'
}

/**
 * Publish X_prime memory checkpoints to the gRPC graph-ML service.
 * The gRPC server maps each 768-dim centroid to the nearest LoRA adapter,
 * enabling per-query adapter loading at inference time.
 *
 * Falls back to Redis ZSET `rl:memory:checkpoints` when gRPC is unavailable.
 * Always fire-and-forget — never throws.
 */
export async function publishMemoryCheckpoints(checkpoints: MemoryCheckpoint[]): Promise<void> {
  const grpcEnabled = ENV.GRAPH_ML_GRPC_ENABLED;

  // ── gRPC path ─────────────────────────────────────────────────────────────
  if (grpcEnabled) {
    const client = await getGrpcClient().catch(() => null);
    if (client) {
      try {
        await Promise.all(
          checkpoints.map(
            (cp) =>
              new Promise<void>((resolve, reject) => {
                client.PublishMemoryCheckpoint(
                  {
                    hyperedge_hash: cp.hyperedgeHash,
                    x_prime: Array.from(cp.xPrimeCentroid),
                    grade_score: cp.gradeScore,
                    grade_label: cp.gradeLabel,
                    pipeline: cp.pipeline,
                    member_count: cp.memberCount,
                    lora_hint: cp.loraHint,
                  },
                  (err: Error | null) => (err ? reject(err) : resolve())
                );
              })
          )
        );
        return; // gRPC succeeded — skip Redis fallback
      } catch {
        /* fall through */
      }
    }
  }

  // ── Redis fallback: ZSET keyed by gradeScore, blob at rl:memory:cp:{hash} ──
  // turbo-prefix-cache.ts and ACE assembler can ZREVRANGEBYSCORE to get top-N
  // checkpoints without a gRPC round-trip.
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const pipe = redis.pipeline();
    const CP_TTL = 4 * 60 * 60; // 4h — matches HG_EDGE_TTL in hypergraph-4d.ts
    for (const cp of checkpoints) {
      pipe.set(
        `rl:memory:cp:${cp.hyperedgeHash}`,
        JSON.stringify({ ...cp, xPrimeCentroid: Array.from(cp.xPrimeCentroid) }),
        'EX',
        CP_TTL
      );
      pipe.zadd('rl:memory:checkpoints', cp.gradeScore, cp.hyperedgeHash);
    }
    pipe.expire('rl:memory:checkpoints', CP_TTL);
    await pipe.exec();
  } catch {
    /* non-fatal */
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Returns the current availability of each execution tier.
 *
 * - napi:  true when the tensorrt_bridge.node addon loaded successfully
 * - grpc:  true when GRAPH_ML_GRPC_ENABLED=true (does NOT probe the remote)
 * - cuda:  true when the addon confirmed CUDA is available on this machine
 */
export function getGraphMLStatus(): { napi: boolean; grpc: boolean; cuda: boolean } {
  const grpcEnabled = ENV.GRAPH_ML_GRPC_ENABLED;
  const cuda = isPytorchGpuAvailable();
  return {
    napi:
      cuda ||
      (() => {
        // addon may be loaded even when CUDA is absent (CPU fallback inside addon)
        try {
          kmeansWithCentroids(new Float32Array([1, 0, 0, 1]), 2, 2, 2, 1);
          return true;
        } catch {
          return false;
        }
      })(),
    grpc: grpcEnabled,
    cuda,
  };
}

/**
 * Condition a GlyphTileAtlas through the graph-ML pipeline.
 * Applies attention scoring and PageRank-based weighting to atlas tiles.
 * Returns attention weights and a conditioning vector for FLUX/Wan spatial hints.
 */
export async function conditionGlyphAtlas(
  atlas: import('$lib/server/cartridge/glyph-tile-engine.js').GlyphTileAtlas,
  queryVec: Float32Array,
): Promise<{
  attentionWeights: Float32Array;
  conditioningVector: Float32Array;
  source: string;
}> {
  const status = getGraphMLStatus();
  const centroids = atlas.tiles
    .filter((t) => t.centroid.length > 0)
    .map((t) => new Float32Array(t.centroid));
  if (centroids.length === 0 || (!status.napi && !status.grpc)) {
    return {
      attentionWeights: new Float32Array(atlas.tiles.length),
      conditioningVector: queryVec,
      source: 'passthrough',
    };
  }
  // Build flat key matrix [n × dim]
  const dim = queryVec.length;
  const keys = new Float32Array(centroids.length * dim);
  centroids.forEach((c, i) => {
    const slice = c.length >= dim ? c.subarray(0, dim) : c;
    keys.set(slice, i * dim);
  });
  const { scores, source } = await scoreAttention(queryVec, dim, keys, centroids.length);
  // Weighted sum of centroids as conditioning vector
  const condVec = new Float32Array(dim);
  for (let i = 0; i < centroids.length; i++) {
    const w = scores[i] ?? 0;
    for (let d = 0; d < dim && d < centroids[i].length; d++) {
      condVec[d] += w * centroids[i][d];
    }
  }
  return { attentionWeights: scores, conditioningVector: condVec, source };
}
