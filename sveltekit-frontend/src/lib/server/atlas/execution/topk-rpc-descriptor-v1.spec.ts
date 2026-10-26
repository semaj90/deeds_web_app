import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
vi.mock('pg', () => ({ default: { Pool: class {} } }));

import { TopKExecutionSchema, type TopKExecutionV1 } from './topk-execution-receipt-v1.js';
import {
  TOPK_RPC_MAX_SELECTED,
  attachTopKDescriptorToRpcResultV1,
  buildTopKRpcDescriptorV1,
} from './topk-rpc-descriptor-v1.js';

const h = (c: string) => c.repeat(64);

function execution(selectedCount = 5): TopKExecutionV1 {
  return TopKExecutionSchema.parse({
    schema: 'atlas.topk.execution.v1', requestId: 'req:1', executionId: `topk:${h('a')}`,
    workspaceRevision: 'ws:1', candidateSnapshotRevision: 'snap:1', sourceRevisionSetChecksum: h('1'),
    representationRevision: 'rep:1', graphRevision: 'graph:1', taxonomyRevision: 'tax:1', featureSchemaRevision: 'fs:1',
    evidenceRevision: 'ev:1', algorithm: 'cpu_exact', backend: 'cpu', k: 100, headId: 'head:1',
    candidateOrdinals: Array.from({ length: selectedCount }, (_, i) => i), candidateSetDigest: h('2'),
    ordinalMapDigest: h('3'), columnarChecksum: h('4'), tileDigest: h('5'), scoreVectorDigest: h('6'),
    selected: Array.from({ length: selectedCount }, (_, i) => ({ canonicalId: `c${i}`, ordinal: i, score: 1 - i / 1000, rank: i + 1 })),
    outputDigest: h('7'), parityVerified: false, status: 'PASS', canonicalAuthority: false, writesPerformed: false, gpuExecuted: false,
  });
}

const rpcResult = () => ({
  query: 'q', strategy: 'fusion' as const, packets: [{ packet_key: 'p:2', rank: 1 }, { packet_key: 'p:1', rank: 2 }] as never[],
  trace: { retrieval_strategy: 'fusion', cache_hit_source: null, qdrant_hits: 0, postgres_hits: 0, rrf_hits: 2, neo4j_expansions: 0,
    duckdb_join_used: false, latency_ms: 1, fusion_used: true,
    collection_split: { runtime_legal: 'legal_documents', codebase_topology: 'codebase_chunks_768' } } as never,
});

describe('Top-K RPC descriptor', () => {
  it('carries references and checksums only, never scores or vectors', () => {
    const d = buildTopKRpcDescriptorV1({ execution: execution() });
    expect(Object.keys(d.selected[0]).sort()).toEqual(['canonicalId', 'ordinal', 'rank']);
    expect(JSON.stringify(d)).not.toContain('score');
    expect(d.canonicalAuthority).toBe(false);
    expect(d.retrievalVoteAdded).toBe(false);
    expect(d.verified).toBe('NOT_VERIFIED');
  });

  it('is deterministic and bounded, and marks truncation', () => {
    const e = execution(40);
    expect(buildTopKRpcDescriptorV1({ execution: e })).toEqual(buildTopKRpcDescriptorV1({ execution: e }));
    const d = buildTopKRpcDescriptorV1({ execution: e });
    expect(d.selected).toHaveLength(TOPK_RPC_MAX_SELECTED);
    expect(d.truncated).toBe(true);
  });

  it('accepts a verdict only for the same execution', () => {
    const e = execution();
    const ok = buildTopKRpcDescriptorV1({ execution: e, verification: { status: 'VERIFIED_PASS', executionId: e.executionId } });
    const stranger = buildTopKRpcDescriptorV1({ execution: e, verification: { status: 'VERIFIED_PASS', executionId: `topk:${h('b')}` } });
    expect(ok.verified).toBe('VERIFIED_PASS');
    expect(stranger.verified).toBe('NOT_VERIFIED');
  });

  it('rejects a malformed execution instead of describing it', () => {
    expect(() => buildTopKRpcDescriptorV1({ execution: { ...execution(), gpuExecuted: true } as never })).toThrow();
  });

  it('attaches without touching packet order or trace', () => {
    const base = rpcResult();
    const out = attachTopKDescriptorToRpcResultV1(base, buildTopKRpcDescriptorV1({ execution: execution() }));
    expect(out.packets).toBe(base.packets);
    expect(out.trace).toBe(base.trace);
    expect(out.topk_execution?.executionId).toBe(`topk:${h('a')}`);
    expect((base as Record<string, unknown>).topk_execution).toBeUndefined();
  });
});
