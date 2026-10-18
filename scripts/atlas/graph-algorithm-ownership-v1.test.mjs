import { describe, expect, it } from 'vitest';
import {
  GRAPH_ALGORITHM_OWNERSHIP_MAP,
  evaluateGraphAlgorithmExecutionPlan,
  computeDeterministicCentrality,
  generateGraphOwnershipReport,
} from './graph-algorithm-ownership-v1.mjs';

describe('GRAPH-ALGORITHM-OWNERSHIP-MAP-01', () => {
  it('maps all 7 canonical graph algorithms with distinct bound feature keys and zero DB writes', () => {
    const algos = Object.keys(GRAPH_ALGORITHM_OWNERSHIP_MAP.algorithms);
    expect(algos).toEqual([
      'pagerank',
      'cheirank',
      'bfs_shortest_paths',
      'connected_components',
      'louvain_modularity',
      'betweenness_centrality',
      'cypher_multi_hop',
    ]);
    expect(GRAPH_ALGORITHM_OWNERSHIP_MAP.writesPerformed).toBe(false);
    expect(GRAPH_ALGORITHM_OWNERSHIP_MAP.canonicalAuthority).toBe(false);

    for (const [name, def] of Object.entries(GRAPH_ALGORITHM_OWNERSHIP_MAP.algorithms)) {
      expect(def.canonicalOracle).toBeDefined();
      expect(def.boundFeatureKey).toBeDefined();
      expect(def.evidenceReport).toBeDefined();
    }
  });

  it('enforces GPU contention guard: routes to NetworkX CPU oracle when :8090 is running without authorization', () => {
    const plan = evaluateGraphAlgorithmExecutionPlan('pagerank', {
      preferGpu: true,
      gpuServer8090Active: true,
      gpuExplicitlyAuthorized: false,
    });

    expect(plan.admittedExecutor).toBe('networkx_cpu_oracle');
    expect(plan.lane).toBe('CPU_INTERCHANGE_ORACLE');
    expect(plan.requiresGpu).toBe(false);
    expect(plan.fallbackReason).toContain('8090');
  });

  it('routes to nx-cugraph GPU acceleration lane ONLY when GPU is explicitly authorized and free', () => {
    const plan = evaluateGraphAlgorithmExecutionPlan('pagerank', {
      preferGpu: true,
      gpuServer8090Active: false,
      gpuExplicitlyAuthorized: true,
    });

    expect(plan.admittedExecutor).toBe('nx_cugraph_gpu');
    expect(plan.lane).toBe('ACCELERATION_LANE_8098');
    expect(plan.requiresGpu).toBe(true);
  });

  it('falls back to in-memory NetworkX AST traversal when Neo4j is disabled', () => {
    const planDisabled = evaluateGraphAlgorithmExecutionPlan('cypher_multi_hop', {
      neo4jEnabled: false,
    });
    expect(planDisabled.admittedExecutor).toBe('networkx_cpu_fallback');
    expect(planDisabled.isFallback).toBe(true);

    const planEnabled = evaluateGraphAlgorithmExecutionPlan('cypher_multi_hop', {
      neo4jEnabled: true,
    });
    expect(planEnabled.admittedExecutor).toBe('neo4j_bolt');
    expect(planEnabled.isFallback).toBe(false);
  });

  it('computes deterministic PageRank and CheiRank satisfying probability axioms (sum=1, non-negative)', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'C'],
      ['C', 'A'],
      ['D', 'C'],
    ];

    const { pagerank, cheirank } = computeDeterministicCentrality(nodes, edges);

    const sumPr = Object.values(pagerank).reduce((a, b) => a + b, 0);
    const sumChei = Object.values(cheirank).reduce((a, b) => a + b, 0);

    expect(Math.abs(sumPr - 1.0)).toBeLessThan(1e-6);
    expect(Math.abs(sumChei - 1.0)).toBeLessThan(1e-6);

    for (const n of nodes) {
      expect(pagerank[n]).toBeGreaterThan(0);
      expect(cheirank[n]).toBeGreaterThan(0);
    }

    // Node C has most incoming edges (from A, B, D) -> highest PageRank
    expect(pagerank['C']).toBeGreaterThan(pagerank['B']);
    expect(pagerank['C']).toBeGreaterThan(pagerank['D']);

    // Node A has 2 outgoing edges, D has 1, C has 1 -> A has high CheiRank
    expect(cheirank['A']).toBeGreaterThan(cheirank['D']);
  });

  it('generates reproducible report with cryptographic sha256 checksum', () => {
    const { reportPath, report } = generateGraphOwnershipReport();
    expect(report.schema).toBe('atlas.graph-algorithm-ownership.v1');
    expect(report.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(report.writesPerformed).toBe(false);
    expect(report.summary.totalAlgorithmsMapped).toBe(7);
  });
});
