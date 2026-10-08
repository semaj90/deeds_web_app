import { describe, expect, it } from 'vitest';
import {
  HypergraphComputePlanV1Schema,
  HypergraphContextProjectionV1Schema,
} from './hypergraph-compute-plan-v1.js';

const checksum = 'a'.repeat(64);

describe('HypergraphComputePlanV1', () => {
  it('accepts NetworkX as CPU oracle without artifact refs', () => {
    const result = HypergraphComputePlanV1Schema.parse({
      schema: 'atlas.hypergraph-compute-plan.v1',
      requestId: 'req:1',
      workspaceRevision: 'workspace:v1',
      proposalSetChecksum: checksum,
      backend: 'NETWORKX_CPU',
      algorithm: 'PAGERANK',
      maxNodes: 100,
      maxEdges: 1000,
      maxIterations: 100,
      artifactRefs: [],
      cpuOracleRequired: false,
      writesAllowed: false,
      canonicalAuthority: false,
    });
    expect(result.backend).toBe('NETWORKX_CPU');
  });

  it('requires artifact refs and CPU oracle for GPU execution', () => {
    expect(HypergraphComputePlanV1Schema.safeParse({
      schema: 'atlas.hypergraph-compute-plan.v1',
      requestId: 'req:1',
      workspaceRevision: 'workspace:v1',
      proposalSetChecksum: checksum,
      backend: 'CUGRAPH_RAPIDS',
      algorithm: 'PAGERANK',
      maxNodes: 100,
      maxEdges: 1000,
      maxIterations: 100,
      artifactRefs: [],
      cpuOracleRequired: false,
      writesAllowed: false,
      canonicalAuthority: false,
    }).success).toBe(false);
  });
});

describe('HypergraphContextProjectionV1', () => {
  it('keeps ACE/BitFrost downstream and non-authoritative', () => {
    const result = HypergraphContextProjectionV1Schema.parse({
      schema: 'atlas.hypergraph-context-projection.v1',
      requestId: 'req:1',
      proposalSetChecksum: checksum,
      rankedProposalIds: ['proposal:1'],
      acePacketRefs: ['ace:packet:1'],
      bitfrostCacheEligible: true,
      contextTokenBudget: 1024,
      graphAlgorithmRevision: 'pagerank:v1',
      canonicalAuthority: false,
    });
    expect(result.canonicalAuthority).toBe(false);
  });
});
