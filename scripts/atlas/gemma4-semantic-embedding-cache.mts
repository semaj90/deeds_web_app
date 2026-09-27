#!/usr/bin/env node
/**
 * Semantic embedding topology experiment.
 *
 * This script intentionally builds a DERIVED semantic k-NN graph before
 * running PageRank. The k-NN graph is a retrieval/topology artifact only and
 * never replaces the canonical source/code graph.
 *
 * GPU execution is routed through the existing pytorch-graph owner so native
 * signatures, VRAM guards, and CPU fallbacks are not duplicated here.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import {
  attentionScoreGPU,
  kmeansWithCentroids,
  pageRankGPU,
  trainSOM,
} from '../../sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts';
import {
  buildSemanticKnnGraphV1,
  connectedComponentsFromAdjacencyV1,
  flattenEmbeddingMatrixV1,
  maxAbsDifferenceV1,
  pageRankCpuOracleV1,
} from '../../sveltekit-frontend/src/lib/server/graph/semantic-knn-graph-v1.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.includes('='))
    .map((arg) => {
      const [k, v] = arg.split('=');
      return [k.replace(/^--/, ''), v];
    }),
);

const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const apply = process.argv.includes('--apply');
const redisHost = args.get('redis-host') || '127.0.0.1';
const redisPort = Number.parseInt(args.get('redis-port') || '6379', 10);
const limit = Math.max(2, Number.parseInt(args.get('limit') || '10000', 10));
const graphLimit = Math.max(2, Math.min(limit, Number.parseInt(args.get('graph-limit') || '512', 10)));
const graphK = Math.max(1, Number.parseInt(args.get('graph-k') || '8', 10));
const minSimilarity = Number.parseFloat(args.get('min-similarity') || '0');

const LOG_DIR = resolve(__dirname, '../../log/artifacts/semantic-embeddings');
mkdirSync(LOG_DIR, { recursive: true });

const runId = randomUUID();
const startTime = Date.now();

console.log('\n🧠 Semantic Embedding Topology Experiment');
console.log(`🔍 Run ID: ${runId}`);
console.log('📊 Strategy: semantic k-NN graph → PageRank + attention + K-means + SOM');
console.log(`🎯 Vector limit: ${limit}; graph limit: ${graphLimit}; k=${graphK}`);
console.log(`💾 Cache mode: ${apply ? `APPLY ${redisHost}:${redisPort}` : 'READ-ONLY / NO CACHE WRITE'}`);

interface QdrantPoint {
  id: string | number;
  vector?: number[] | Record<string, number[]>;
  vectors?: number[] | Record<string, number[]>;
  payload?: Record<string, unknown>;
}

function vectorFromPoint(point: QdrantPoint): number[] | null {
  const candidates = [point.vector, point.vectors];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, number[]>;
      for (const key of ['content', 'default', '']) {
        if (Array.isArray(record[key])) return record[key];
      }
    }
  }
  return null;
}

// ============================================================================
// STEP 1: Fetch embeddings from Qdrant
// ============================================================================

console.log(`\n1️⃣  Fetching up to ${limit} embeddings from Qdrant...`);

const embeddings: Float32Array[] = [];
const metadata: Array<{ id: string; score?: number; cluster?: number }> = [];

try {
  const response = await fetch(
    'http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit,
        with_vector: true,
        with_payload: true,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) throw new Error(`Qdrant HTTP ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { result?: { points?: QdrantPoint[] } };
  const points = data.result?.points ?? [];

  for (const point of points) {
    const vec = vectorFromPoint(point);
    if (!vec || vec.length !== 768) continue;
    embeddings.push(new Float32Array(vec));
    metadata.push({
      id: String(point.id ?? point.payload?.qdrant_point_id ?? `point-${embeddings.length}`),
    });
  }

  console.log(`   ✅ Fetched ${embeddings.length} valid 768-dim embeddings`);
} catch (err) {
  console.error(`   ❌ Qdrant fetch failed: ${(err as Error).message}`);
  process.exit(1);
}

if (embeddings.length < 2) {
  console.error('   ❌ Need at least two embeddings');
  process.exit(1);
}

const flatEmbeddings = flattenEmbeddingMatrixV1(embeddings);

// ============================================================================
// STEP 2: Build a bounded semantic k-NN graph, then PageRank
// ============================================================================

const graphEmbeddings = embeddings.slice(0, Math.min(graphLimit, embeddings.length));
console.log(
  `\n2️⃣  Building derived semantic k-NN graph (${graphEmbeddings.length} nodes, k=${graphK})...`,
);

const graph = buildSemanticKnnGraphV1(graphEmbeddings, {
  k: graphK,
  minSimilarity,
  symmetric: true,
});
const components = connectedComponentsFromAdjacencyV1(graph.adjacency, graph.nodeCount);
const componentCount = components.length ? Math.max(...components) + 1 : 0;

let pageRankScores: Float32Array | null = null;
let pageRankSource: 'gpu' | 'cpu' | null = null;
let pageRankOracleMaxAbsDiff: number | null = null;

try {
  const result = pageRankGPU(graph.adjacency, graph.nodeCount, 0.85, 50);
  pageRankScores = result.scores;
  pageRankSource = result.source;
  const oracle = pageRankCpuOracleV1(graph.adjacency, graph.nodeCount, 0.85, 50);
  pageRankOracleMaxAbsDiff = maxAbsDifferenceV1(pageRankScores, oracle);
  console.log(
    `   ✅ PageRank ${result.source}: ${pageRankScores.length} scores; CPU oracle max |Δ|=${pageRankOracleMaxAbsDiff.toExponential(3)}`,
  );
} catch (err) {
  console.warn(`   ⚠️  PageRank failed: ${(err as Error).message}`);
}

// ============================================================================
// STEP 3: Attention over the same flattened embedding representation
// ============================================================================

console.log('\n3️⃣  Computing attention scores...');

let attentionScores: Float32Array | null = null;
let attentionSource: 'gpu' | 'cpu' | null = null;
const probeVec = embeddings[0];

try {
  const result = attentionScoreGPU(probeVec, 768, flatEmbeddings, embeddings.length);
  attentionScores = result.weights;
  attentionSource = result.source;
  console.log(`   ✅ Attention ${result.source}: ${attentionScores.length} values`);
} catch (err) {
  console.warn(`   ⚠️  Attention scoring failed: ${(err as Error).message}`);
}

// ============================================================================
// STEP 4: K-Means
// ============================================================================

console.log('\n4️⃣  Clustering embeddings via K-means...');

const numClusters = Math.max(2, Math.min(64, Math.ceil(Math.sqrt(embeddings.length))));
let assignments: Int32Array | null = null;
let centroids: Float32Array | null = null;
let kmeansSource: 'gpu' | 'cpu' | null = null;

try {
  const result = kmeansWithCentroids(
    flatEmbeddings,
    embeddings.length,
    768,
    numClusters,
    50,
  );
  assignments = result.assignments;
  centroids = result.centroids;
  kmeansSource = result.source;
  console.log(
    `   ✅ K-means ${result.source}: ${numClusters} clusters, ${assignments.length} assignments`,
  );
} catch (err) {
  console.warn(`   ⚠️  K-means failed: ${(err as Error).message}`);
}

// ============================================================================
// STEP 5: SOM topology
// ============================================================================

console.log('\n5️⃣  Training Self-Organizing Map...');

let somWeights: Float32Array | null = null;
let somBmu: Int32Array | null = null;
let somSource: 'gpu' | 'cpu' | null = null;

try {
  const result = trainSOM(
    flatEmbeddings,
    embeddings.length,
    768,
    8,
    8,
    100,
    0.1,
    0.01,
    4,
    1,
  );
  somWeights = result.weights;
  somBmu = result.bmu;
  somSource = result.source;
  console.log(
    `   ✅ SOM ${result.source}: ${somWeights.length} weights, ${somBmu.length} BMU indices`,
  );
} catch (err) {
  console.warn(`   ⚠️  SOM training failed: ${(err as Error).message}`);
}

// ============================================================================
// STEP 6: Optional disposable cache projection
// ============================================================================

let cacheWrites = 0;
if (apply) {
  console.log(`\n6️⃣  Caching disposable observations to Redis (${redisHost}:${redisPort})...`);
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await redis.connect();

    for (let i = 0; i < metadata.length; i++) {
      const entry = {
        index: i,
        pagerank: i < graph.nodeCount ? pageRankScores?.[i] ?? null : null,
        attention: attentionScores?.[i] ?? null,
        cluster: assignments?.[i] ?? null,
        som_bmu: somBmu?.[i] ?? null,
        graph_artifact_kind: 'DERIVED_SEMANTIC_KNN',
        canonical_authority: false,
        timestamp: new Date().toISOString(),
      };
      await redis.setex(`semantic:embedding:${metadata[i].id}`, 86400, JSON.stringify(entry));
      cacheWrites++;
    }

    if (centroids) {
      await redis.setex(
        `semantic:centroids:${runId}`,
        604800,
        JSON.stringify(Array.from(centroids)),
      );
      cacheWrites++;
    }
    await redis.quit();
    console.log(`   ✅ Cache writes: ${cacheWrites}`);
  } catch (err) {
    console.warn(`   ⚠️  Redis caching failed: ${(err as Error).message}`);
  }
} else {
  console.log('\n6️⃣  Cache write skipped (read-only mode)');
}

// ============================================================================
// STEP 7: Report
// ============================================================================

const duration = Date.now() - startTime;
const report = {
  schema: 'atlas.semantic-embedding-topology-experiment.v1',
  run_id: runId,
  dry_run: dryRun,
  applied: apply,
  duration_ms: duration,
  writes_performed: cacheWrites > 0,
  canonical_authority: false,
  embeddings: {
    total: embeddings.length,
    dimension: 768,
    source: 'qdrant:codebase_chunks_768',
  },
  graph: {
    schema: graph.schema,
    kind: 'DERIVED_SEMANTIC_KNN',
    node_count: graph.nodeCount,
    dimension: graph.dimension,
    k: graph.k,
    min_similarity: graph.minSimilarity,
    symmetric: graph.symmetric,
    directed_edge_count: graph.directedEdgeCount,
    undirected_edge_count: graph.undirectedEdgeCount,
    density: graph.density,
    connected_components: componentCount,
    canonical_authority: graph.canonicalAuthority,
  },
  algorithms: {
    pagerank: pageRankScores
      ? {
          ok: true,
          source: pageRankSource,
          scores: pageRankScores.length,
          cpu_oracle_max_abs_diff: pageRankOracleMaxAbsDiff,
        }
      : { ok: false },
    attention: attentionScores
      ? { ok: true, source: attentionSource, scores: attentionScores.length }
      : { ok: false },
    kmeans: assignments
      ? {
          ok: true,
          source: kmeansSource,
          clusters: numClusters,
          assignments: assignments.length,
        }
      : { ok: false },
    som: somBmu
      ? { ok: true, source: somSource, grid: '8x8', bmu_count: somBmu.length }
      : { ok: false },
  },
  cache: apply
    ? {
        backend: 'redis',
        host: redisHost,
        port: redisPort,
        writes: cacheWrites,
        disposable: true,
      }
    : { backend: 'none', writes: 0, reason: 'read-only mode' },
  timestamp: new Date().toISOString(),
};

const reportPath = resolve(LOG_DIR, `semantic-embedding-topology-${runId}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n7️⃣  Report: ${reportPath}`);
console.log(`   Graph: ${report.graph.node_count} nodes / ${report.graph.undirected_edge_count} edges / ${report.graph.connected_components} components`);
console.log(`   PageRank: ${report.algorithms.pagerank.ok ? '✅' : '❌'}`);
console.log(`   Attention: ${report.algorithms.attention.ok ? '✅' : '❌'}`);
console.log(`   K-Means: ${report.algorithms.kmeans.ok ? '✅' : '❌'}`);
console.log(`   SOM: ${report.algorithms.som.ok ? '✅' : '❌'}`);
console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);

process.exit(report.algorithms.pagerank.ok && report.algorithms.kmeans.ok ? 0 : 1);
