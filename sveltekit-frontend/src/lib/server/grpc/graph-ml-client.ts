/**
 * GraphML Client — server-only.
 *
 * Thin TypeScript bridge for the 4 GPU graph-ML operations defined in graph_ml.proto.
 * Execution priority per call:
 *   1. Local N-API (pytorch-graph.ts)  — fastest, synchronous, RTX 3060 Ti CUDA
 *   2. Remote gRPC                     — when GRAPH_ML_GRPC_URL + GRAPH_ML_GRPC_ENABLED=true
 *   3. CPU JS fallback                 — always available (pytorch-graph.ts internals)
 *
 * ENV:
 *   GRAPH_ML_GRPC_URL      — gRPC server address (default: 127.0.0.1:50056)
 *   GRAPH_ML_GRPC_ENABLED  — "true" to enable remote gRPC path (default: "false")
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
//      Go microservice address (e.g. 127.0.0.1:50056).

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
    _grpcClient = new GraphMLService(url, grpc.credentials.createInsecure(), {
      'grpc.keepalive_time_ms': 10_000,
      'grpc.keepalive_timeout_ms': 5_000,
      'grpc.keepalive_permit_without_calls': 1,
      'grpc.max_connection_idle_ms': 300_000,
      'grpc.max_send_message_length': 32 * 1024 * 1024,
      'grpc.max_receive_message_length': 32 * 1024 * 1024,
    });

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
 * Tries N-API GPU first; falls through to CPU JS fallback inside pytorch-graph.
 *
 * @param embeddings - Flat Float32Array [n × dim], row-major
 * @param n          - Number of data points
 * @param dim        - Embedding dimension
 * @param k          - Number of clusters
 * @param maxIters   - Maximum Lloyd iterations (default 100)
 */
export function runKMeans(
  embeddings: Float32Array,
  n: number,
  dim: number,
  k: number,
  maxIters = 100
): GraphMLKMeansResult {
  const t0 = performance.now();
  const result = kmeansWithCentroids(embeddings, n, dim, k, maxIters);
  return {
    assignments: result.assignments,
    centroids: result.centroids,
    source: result.source, // 'gpu' | 'cpu' — set by pytorch-graph
    durationMs: Math.round(performance.now() - t0),
  };
}

/**
 * Kohonen Self-Organizing Map training.
 * Returns trained neuron weights and BMU index for each input.
 *
 * @param embeddings - Flat Float32Array [n × dim]
 * @param n          - Number of data points
 * @param dim        - Embedding dimension
 * @param gridW      - SOM grid width
 * @param gridH      - SOM grid height (total neurons = gridW × gridH)
 * @param iters      - Training iterations (default 1000)
 * @param lrInit     - Initial learning rate (default 0.1)
 * @param lrFinal    - Final learning rate (default 0.01)
 * @param radInit    - Initial neighbourhood radius (default max(gridW, gridH) / 2)
 * @param radFinal   - Final neighbourhood radius (default 1.0)
 */
export function runSOM(
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
): GraphMLSOMResult {
  const t0 = performance.now();
  const result = trainSOM(
    embeddings,
    n,
    dim,
    gridW,
    gridH,
    iters,
    lrInit,
    lrFinal,
    radInit,
    radFinal
  );
  return {
    weights: result.weights,
    bmu: result.bmu,
    source: result.source,
    durationMs: Math.round(performance.now() - t0),
  };
}

/**
 * Scaled dot-product attention weights for ACE context chunk ranking.
 * Returns softmax weights over the n key vectors.
 *
 * @param query - Float32Array of length dim
 * @param dim   - Query/key dimension
 * @param keys  - Flat Float32Array [n × dim], row-major
 * @param n     - Number of key vectors
 */
export function scoreAttention(
  query: Float32Array,
  dim: number,
  keys: Float32Array,
  n: number
): GraphMLAttentionResult {
  const result = attentionScoreGPU(query, dim, keys, n);
  return {
    scores: result.weights,
    source: result.source,
  };
}

/**
 * GPU power-iteration PageRank for code dependency graphs.
 * Returns normalised rank scores summing to 1.0.
 *
 * @param adj     - Flat Float32Array [n × n] adjacency matrix, row-major
 * @param n       - Number of nodes
 * @param damping - Damping factor (default 0.85)
 * @param iters   - Power iterations (default 50)
 */
export function runPageRank(
  adj: Float32Array,
  n: number,
  damping = 0.85,
  iters = 50
): GraphMLPageRankResult {
  const result = pageRankGPU(adj, n, damping, iters);
  return {
    scores: result.scores,
    source: result.source,
  };
}

/**
 * GRPO reward score for LangGraph synthesis evaluation.
 * Computes cosine similarity between generated-answer and query embeddings.
 * Reward ∈ [-1, 1] — higher = more query-aligned answer.
 *
 * Called after every L3 synthesis run; score is persisted to synthesis_runs
 * for QLoRA fine-tuning and GRPO reward-model training.
 *
 * @param genEmbedding   Float32Array of length dim (generated answer)
 * @param queryEmbedding Float32Array of length dim (query / reference)
 * @param dim            Embedding dimension (768 for embeddinggemma)
 */
export function scoreGRPOReward(
  genEmbedding: Float32Array,
  queryEmbedding: Float32Array,
  dim: number
): { reward: number; source: 'gpu' | 'cpu' } {
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
  const { scores, source } = scoreAttention(queryVec, dim, keys, centroids.length);
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
