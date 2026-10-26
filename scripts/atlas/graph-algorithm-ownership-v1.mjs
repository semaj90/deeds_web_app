#!/usr/bin/env node
/**
 * GRAPH-ALGORITHM-OWNERSHIP-V1
 *
 * Defines the canonical ownership, execution boundaries, and fallback contracts
 * for graph algorithms across Parent Atlas & Deeds Web App.
 *
 * Strict Invariants:
 * 1. NetworkX CPU is the deterministic interchange oracle for all graph metrics.
 * 2. nx-cugraph (:8098 / WSL2 RAPIDS) is an acceleration lane, gated behind GPU availability
 *    and NEVER executed while llama-server (:8090) holds VRAM without explicit authorization.
 * 3. Neo4j (:7687) is a read-only query projection. When NEO4J_ENABLED=false, calls fail closed
 *    or fallback to deterministic in-memory NetworkX/JSON DAG traversals.
 * 4. Derived graph coordinates (PageRank, CheiRank, Louvain communities, BFS depth) NEVER:
 *    - invent or mutate CandidateOrdinal or canonical chunk IDs (owned by PostgreSQL 18).
 *    - produce an additional retrieval vote in SearchRuntime (RRF requires 1 vote per logical lane).
 *    - mutate database stores (writesPerformed: false, canonicalAuthority: false).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO_ROOT } from './connection-config.mjs';

export const GRAPH_ALGORITHM_OWNERSHIP_MAP = {
  schema: 'atlas.graph-algorithm-ownership.v1',
  revision: '2026-10-17',
  writesPerformed: false,
  canonicalAuthority: false,
  rules: {
    single_fusion_owner: 'SearchRuntime (sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts)',
    chunk_identity_owner: 'PostgreSQL 18 (codebase_chunk_index.id)',
    dense_embedding_owner: 'codebase_chunk_index.content_embedding_768 (EmbeddingGemma:eg-task-prefix-v1)',
    graph_coordinates_promotional: false,
    extra_rrf_vote_allowed: false,
    gpu_contention_guard: 'RTX 3060 Ti 8GB cannot run GPU graph algorithms concurrently with llama-server :8090',
  },
  algorithms: {
    pagerank: {
      description: 'Directed link centrality measuring structural authority across documentation and code entities.',
      canonicalOracle: 'NetworkX (CPU deterministic power iteration, alpha=0.85, tol=1e-10)',
      accelerationLane: 'nx-cugraph (:8098 lane / WSL2 RAPIDS cu13)',
      cpuFallback: 'in-memory Float64 power iteration',
      parityStatus: 'FIXTURE_PROVEN',
      evidenceReport: 'docs/reports/nx-cugraph-backend-parity-v1.json',
      maxAbsDiffTolerance: 1e-4,
      minTopKOverlap: 0.90,
      boundFeatureKey: 'topo_pagerank',
    },
    cheirank: {
      description: 'Transposed directed link centrality measuring communicative/out-degree hubness.',
      canonicalOracle: 'NetworkX (CPU deterministic power iteration on transposed graph A^T)',
      accelerationLane: 'nx-cugraph (:8098 lane / WSL2 RAPIDS cu13, reversed graph)',
      cpuFallback: 'in-memory Float64 transposed power iteration',
      parityStatus: 'APPLY_PROVEN',
      evidenceReport: 'docs/reports/grpc-toc-entity-pipeline-v1.json',
      maxAbsDiffTolerance: 1e-4,
      minTopKOverlap: 0.90,
      boundFeatureKey: 'topo_cheirank',
    },
    bfs_shortest_paths: {
      description: 'Exact graph topological distance from source nodes for neighborhood expansion.',
      canonicalOracle: 'NetworkX (single_source_shortest_path_length)',
      accelerationLane: 'nx-cugraph (BFS shortest path)',
      cpuFallback: 'deterministic queue BFS',
      parityStatus: 'FIXTURE_PROVEN',
      evidenceReport: 'docs/reports/nx-cugraph-backend-parity-v1.json',
      exactEqualityRequired: true,
      boundFeatureKey: 'topo_bfs_depth',
    },
    connected_components: {
      description: 'Partitioning graph into weakly and strongly connected components.',
      canonicalOracle: 'NetworkX (connected_components / strongly_connected_components)',
      accelerationLane: 'nx-cugraph (connected_components)',
      cpuFallback: 'Disjoint-set Union-Find',
      parityStatus: 'FIXTURE_PROVEN',
      evidenceReport: 'docs/reports/nx-cugraph-backend-parity-v1.json',
      exactEqualityRequired: true,
      boundFeatureKey: 'topo_component_id',
    },
    louvain_modularity: {
      description: 'Community detection via modularity optimization for cluster topological class assignment.',
      canonicalOracle: 'networkx.community.louvain_communities (resolution=1.0, seed=42)',
      accelerationLane: 'nx-cugraph (Louvain community detection)',
      cpuFallback: 'deterministic greedy modularity communities',
      parityStatus: 'SPECIFIED_GATED',
      evidenceReport: 'docs/reports/lowrank-hll-radix-cugraph-toc-audit-2026-10-17.md',
      boundFeatureKey: 'topo_class',
    },
    betweenness_centrality: {
      description: 'Shortest-path vertex betweenness measuring broker / gateway entities.',
      canonicalOracle: 'NetworkX (betweenness_centrality, Brandes algorithm)',
      accelerationLane: 'nx-cugraph (betweenness_centrality)',
      cpuFallback: 'sampled Brandes CPU traversal',
      parityStatus: 'SPECIFIED_GATED',
      evidenceReport: 'docs/reports/lowrank-hll-radix-cugraph-toc-audit-2026-10-17.md',
      boundFeatureKey: 'topo_betweenness',
    },
    cypher_multi_hop: {
      description: 'Multi-hop ontology traversal and relationship path queries.',
      canonicalOracle: 'Neo4j Bolt Engine (:7687)',
      accelerationLane: 'none',
      cpuFallback: 'in-memory NetworkX MultiDiGraph / route-ast-graph.json subgraph match',
      parityStatus: 'READONLY_FALLBACK_ACTIVE',
      evidenceReport: 'docs/reports/kanban-runtime-ownership-v1.json',
      boundFeatureKey: 'neo4j_traversal_path',
    },
  },
};

/**
 * Evaluates execution admission for a graph algorithm invocation.
 * Enforces hardware constraints, profile flags, and fallback rules.
 */
export function evaluateGraphAlgorithmExecutionPlan(algorithmName, runtimeContext = {}) {
  const algo = GRAPH_ALGORITHM_OWNERSHIP_MAP.algorithms[algorithmName];
  if (!algo) {
    throw new Error(`Unknown graph algorithm: '${algorithmName}'`);
  }

  const {
    gpuServer8090Active = true, // By default llama-server :8090 is running
    gpuExplicitlyAuthorized = false,
    neo4jEnabled = false,
    preferGpu = false,
  } = runtimeContext;

  // Rule 1: Special case for Cypher queries
  if (algorithmName === 'cypher_multi_hop') {
    if (neo4jEnabled) {
      return {
        admittedExecutor: 'neo4j_bolt',
        endpoint: 'bolt://127.0.0.1:7687',
        lane: 'CANONICAL_QUERY_PROJECTION',
        isFallback: false,
        requiresGpu: false,
      };
    }
    return {
      admittedExecutor: 'networkx_cpu_fallback',
      endpoint: 'in_memory_ast_graph',
      lane: 'READONLY_IN_MEMORY_FALLBACK',
      isFallback: true,
      requiresGpu: false,
      reason: 'NEO4J_ENABLED is false; routed to deterministic in-memory NetworkX traversal',
    };
  }

  // Rule 2: GPU contention guard
  if (preferGpu && algo.accelerationLane) {
    if (gpuServer8090Active && !gpuExplicitlyAuthorized) {
      return {
        admittedExecutor: 'networkx_cpu_oracle',
        lane: 'CPU_INTERCHANGE_ORACLE',
        isFallback: false,
        fallbackReason: 'GPU contention: Ornith 1.5-9B active on :8090 occupying ~7.5 GiB VRAM. Gated from GPU.',
        requiresGpu: false,
      };
    }
    return {
      admittedExecutor: 'nx_cugraph_gpu',
      lane: 'ACCELERATION_LANE_8098',
      isFallback: false,
      requiresGpu: true,
      oracleVerificationRequired: true,
    };
  }

  // Rule 3: Default to deterministic CPU oracle
  return {
    admittedExecutor: 'networkx_cpu_oracle',
    lane: 'CPU_INTERCHANGE_ORACLE',
    isFallback: false,
    requiresGpu: false,
  };
}

/**
 * Deterministic CPU in-memory implementation of PageRank and CheiRank.
 */
export function computeDeterministicCentrality(nodes, edges, alpha = 0.85, maxIter = 100, tol = 1e-10) {
  const N = nodes.length;
  if (N === 0) return { pagerank: {}, cheirank: {} };

  const nodeIdx = new Map(nodes.map((n, i) => [n, i]));
  const outDegree = new Float64Array(N);
  const inDegree = new Float64Array(N);
  const adj = Array.from({ length: N }, () => []);
  const adjT = Array.from({ length: N }, () => []);

  for (const [u, v] of edges) {
    const i = nodeIdx.get(u);
    const j = nodeIdx.get(v);
    if (i !== undefined && j !== undefined) {
      adj[i].push(j);
      adjT[j].push(i);
      outDegree[i]++;
      inDegree[j]++;
    }
  }

  function runPowerIteration(edgesList, degreeList) {
    let p = new Float64Array(N).fill(1.0 / N);
    for (let it = 0; it < maxIter; it++) {
      const next = new Float64Array(N).fill((1.0 - alpha) / N);
      let danglingWeight = 0;
      for (let i = 0; i < N; i++) {
        if (degreeList[i] === 0) {
          danglingWeight += p[i];
        } else {
          const contrib = (alpha * p[i]) / degreeList[i];
          for (const target of edgesList[i]) {
            next[target] += contrib;
          }
        }
      }
      if (danglingWeight > 0) {
        const distributed = (alpha * danglingWeight) / N;
        for (let i = 0; i < N; i++) {
          next[i] += distributed;
        }
      }

      let diff = 0;
      for (let i = 0; i < N; i++) {
        diff += Math.abs(next[i] - p[i]);
      }
      p = next;
      if (diff < tol) break;
    }
    const result = {};
    for (let i = 0; i < N; i++) {
      result[nodes[i]] = p[i];
    }
    return result;
  }

  const pagerank = runPowerIteration(adj, outDegree);
  const cheirank = runPowerIteration(adjT, inDegree);

  return { pagerank, cheirank };
}

/**
 * Generates and saves the formal graph-algorithm ownership report.
 */
export function generateGraphOwnershipReport() {
  const reportPath = path.join(REPO_ROOT, 'docs/reports/graph-algorithm-ownership-map-v1.json');
  const report = {
    ...GRAPH_ALGORITHM_OWNERSHIP_MAP,
    generatedAt: new Date().toISOString(),
    status: 'SPECIFIED_AND_ENFORCED',
    summary: {
      totalAlgorithmsMapped: Object.keys(GRAPH_ALGORITHM_OWNERSHIP_MAP.algorithms).length,
      primaryOracle: 'NetworkX CPU',
      accelerationBackend: 'nx-cugraph (WSL2 RAPIDS cu13)',
      queryEngine: 'Neo4j with NetworkX in-memory fallback',
      gpuSafeModeActive: true,
      databaseMutationsAllowed: false,
    },
  };

  const serialized = JSON.stringify(report, null, 2);
  const checksum = crypto.createHash('sha256').update(serialized).digest('hex');
  report.checksum = `sha256:${checksum}`;

  osWriteJson(reportPath, report);
  return { reportPath, report };
}

function osWriteJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const { reportPath, report } = generateGraphOwnershipReport();
  console.log(`✓ Graph-Algorithm Ownership Map written to: ${reportPath}`);
  console.log(`✓ Algorithms mapped: ${report.summary.totalAlgorithmsMapped}`);
  console.log(`✓ Checksum: ${report.checksum}`);
}
