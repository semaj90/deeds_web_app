import { describe, expect, it } from 'vitest';
import { createTraceRepairEvidenceExecutor, type TraceRepairToolCaller } from './trace-repair-evidence-adapter.js';

const request = {
  requestId: 'r1',
  queryText: 'fix imports and callers in src/lib/a.ts',
  targetFiles: ['src/lib/a.ts'],
  workspaceRevision: 'ws1',
  sourceRevision: 'src1',
  topK: 8,
  graphHops: 4,
  graphFanout: 24,
  latencyBudgetMs: 500,
};

describe('createTraceRepairEvidenceExecutor', () => {
  it('uses canonical packet search and does not copy the requested revision onto an unrevisioned packet hit', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const caller: TraceRepairToolCaller = async (name, args) => {
      calls.push({ name, args });
      return {
        packets: [{
          packet_key: 'p1',
          source_ref: 'src/lib/a.ts',
          summary: 'export function a() {}',
          byte_start: 10,
          byte_end: 32,
          sha256: 'abc123',
          reward_prior: 0.8,
        }],
      };
    };
    const executor = createTraceRepairEvidenceExecutor(caller);
    const result = await executor.packetLookup(request);

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('atlas.packet_search');
    expect(calls[0].args.source_ref).toBe('src/lib/a.ts');
    expect(result.library).toBe('PACKET_FABRIC');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].packetKey).toBe('p1');
    expect(result.candidates[0].exactEvidence).toBe(true);
    expect(result.candidates[0].sourceRevision).toBeNull();
    expect(result.observedRevision).toBeNull();
    expect(result.candidates[0].evidenceRefs).toEqual(expect.arrayContaining([
      'packet:p1',
      'sha256:abc123',
      'byte-start:10',
    ]));
  });

  it('uses TRACE KAG as one semantic capability adapter without creating an independent lane vote', async () => {
    const calls: string[] = [];
    const executor = createTraceRepairEvidenceExecutor(async (name) => {
      calls.push(name);
      return {
        hits: [{
          packet_key: 'p2',
          source_ref: 'src/lib/b.ts',
          content: 'export const b = 1',
          score: 0.92,
        }],
      };
    });

    const result = await executor.semanticSearch(request);
    expect(calls).toEqual(['trace.kag_search']);
    expect(result.candidates[0].lanes).toEqual(['semantic']);
    expect(result.candidates[0].exactEvidence).toBe(false);
    expect(result.reasonCodes).toContain('NO_INDEPENDENT_SEMANTIC_LANE_VOTE');
  });

  it('clamps graph expansion to TRACE maxHops=2 and keeps graph output non-exact', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const executor = createTraceRepairEvidenceExecutor(async (name, args) => {
      calls.push({ name, args });
      return {
        sourceRefs: ['src/lib/a.ts', 'src/lib/b.ts'],
        graph: {
          nodes: [
            { stableKey: 'file:src/lib/a.ts', pagerank: 0.8 },
            { stableKey: 'file:src/lib/b.ts', pagerank: 0.4 },
          ],
          edges: [],
        },
      };
    });

    const result = await executor.graphExpand({ ...request, seedSourceRefs: ['src/lib/a.ts'] });
    expect(calls[0].name).toBe('graph.expand_neighborhood');
    expect(calls[0].args.maxHops).toBe(2);
    expect(result.degraded).toBe(true);
    expect(result.reasonCodes).toContain('TRACE_GRAPH_MAX_HOPS_CLAMPED_TO_2');
    expect(result.candidates.every((row) => row.exactEvidence === false)).toBe(true);
  });

  it('uses ACE validation as a read/probe and never calls mutation or cache-warm tools', async () => {
    const calls: string[] = [];
    const executor = createTraceRepairEvidenceExecutor(async (name) => {
      calls.push(name);
      return {
        cache: { aceHit: true, redisHit: true },
        graphNodePresent: true,
      };
    });

    const result = await executor.aceValidate({ ...request, candidateSourceRefs: ['src/lib/a.ts'] });
    expect(calls).toEqual(['trace.validate_ace_hit']);
    expect(calls.some((name) => name.startsWith('ops.'))).toBe(false);
    expect(calls.some((name) => /warm|ingest|write/i.test(name))).toBe(false);
    expect(result.cacheHitCount).toBeGreaterThan(0);
    expect(result.candidates[0].exactEvidence).toBe(false);
  });

  it('normalizes centroid prefilter output as routing evidence, never canonical identity', async () => {
    const executor = createTraceRepairEvidenceExecutor(async () => ({
      clusterIds: [7, 9],
      centroidScores: [0.91, 0.72],
      backend: 'python',
    }));

    const result = await executor.centroidLookup(request);
    expect(result.library).toBe('CENTROID_CACHE');
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].packetKey).toBeNull();
    expect(result.candidates[0].centroidAffinity).toBeCloseTo(0.91);
    expect(result.reasonCodes).toContain('CENTROID_DOES_NOT_CREATE_CANONICAL_IDENTITY');
  });
});
