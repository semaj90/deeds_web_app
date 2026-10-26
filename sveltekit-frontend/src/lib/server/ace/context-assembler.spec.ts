import { describe, expect, it, vi } from 'vitest';
import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import { ACEContextAssembler, estimateContentTokensV1, selectTopCandidatesV1 } from './context-assembler.js';
import { buildTopologicalKagCacheScopeV1, readAceCacheProjectionIdentityV1 } from '../features/ai/ace/context-assembler.js';

describe('buildTopologicalKagCacheScopeV1', () => {
  const base = {
    files: ['1. src/ace.ts [PR=0.42]'],
    fileGraphBindings: [{ key: 'packet:ace', packetKey: 'packet:ace', sourceRef: 'src/ace.ts', sourceRevision: 'source:r1', workspaceRevision: 'workspace:r1', graphRevision: 'graph:r1', projectionRevision: 'projection:r1', neighborhoodHash: 'sha256:a' }],
    clusters: ['- cluster:gpu:3 [backend] tags=cache'],
    lanes: ['ast', 'graph'],
    laneTopFiles: ['src/ace.ts'],
    agentsScope: 'root',
  };

  it('changes cache scope when rendered topology content or graph revisions change', () => {
    const original = buildTopologicalKagCacheScopeV1(base);
    expect(buildTopologicalKagCacheScopeV1({ ...base, files: ['1. src/ace.ts [PR=0.81]'] })).not.toBe(original);
    expect(buildTopologicalKagCacheScopeV1({
      ...base,
      fileGraphBindings: [{ ...base.fileGraphBindings[0], graphRevision: 'graph:r2' }],
    })).not.toBe(original);
    expect(buildTopologicalKagCacheScopeV1({
      ...base,
      fileGraphBindings: [{ ...base.fileGraphBindings[0], sourceRevision: 'source:r2' }],
    })).not.toBe(original);
    expect(buildTopologicalKagCacheScopeV1({
      ...base,
      fileGraphBindings: [{ ...base.fileGraphBindings[0], workspaceRevision: 'workspace:r2' }],
    })).not.toBe(original);
  });

  it('is deterministic for an identical bounded prompt scope', () => {
    expect(buildTopologicalKagCacheScopeV1(base)).toBe(buildTopologicalKagCacheScopeV1(base));
  });
});

describe('readAceCacheProjectionIdentityV1', () => {
  it('preserves explicitly supplied identity fields without inferring missing revisions', () => {
    expect(readAceCacheProjectionIdentityV1({ packet_key: 'p1', source_ref: 'src/a.ts', source_revision: 'src:r1' })).toEqual({
      packetKey: 'p1', sourceRef: 'src/a.ts', sourceRevision: 'src:r1', workspaceRevision: null,
    });
  });

  it('ignores non-string projection values and leaves them unavailable', () => {
    expect(readAceCacheProjectionIdentityV1({ packet_key: 4, source_revision: null, workspaceRevision: false })).toEqual({
      packetKey: null, sourceRef: null, sourceRevision: null, workspaceRevision: null,
    });
  });
});

describe('estimateContentTokensV1', () => {
  it('estimates from evidence bytes rather than packet identity fields', () => {
    expect(estimateContentTokensV1('a'.repeat(8))).toBe(2);
    expect(estimateContentTokensV1('')).toBe(0);
    expect(estimateContentTokensV1('é'.repeat(4))).toBe(2);
  });
});

describe('selectTopCandidatesV1 (parent-atlas-ace-bitfrost-cache-correctness T2 item 3)', () => {
  it('keeps the highest-scoring candidates when input exceeds the limit', () => {
    const candidates = [
      { id: 'a', final_score: 0.2 },
      { id: 'b', final_score: 0.9 },
      { id: 'c', final_score: 0.5 },
      { id: 'd', final_score: 0.7 },
    ];
    const top2 = selectTopCandidatesV1(candidates, 2);
    expect(top2.map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('reproduces the real bug scenario: unsorted upstream order must not silently drop the best candidates', () => {
    // Simulates extracted_facts arriving in arbitrary (non-score) order, as the real
    // caller (phase110-end-to-end-retrieval-flow.ts) does today.
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `candidate-${index}`,
      // Deliberately put the highest scores at the END of the array (indices 50-59),
      // which a naive slice(0, 50) would have silently dropped entirely.
      final_score: index >= 50 ? 1 + (index - 50) : index / 100,
    }));
    const top50 = selectTopCandidatesV1(many, 50);
    expect(top50).toHaveLength(50);
    // All 10 highest-scoring candidates (originally at the tail) must survive.
    for (let index = 50; index < 60; index += 1) {
      expect(top50.some((c) => c.id === `candidate-${index}`)).toBe(true);
    }
    // The lowest-scoring candidate from the front must NOT survive (it's genuinely worst).
    expect(top50.some((c) => c.id === 'candidate-0')).toBe(false);
  });

  it('preserves relative order for tied scores (stable sort)', () => {
    const candidates = [
      { id: 'first', final_score: 0.5 },
      { id: 'second', final_score: 0.5 },
      { id: 'third', final_score: 0.5 },
    ];
    expect(selectTopCandidatesV1(candidates, 3).map((c) => c.id)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input array', () => {
    const candidates = [
      { id: 'a', final_score: 0.1 },
      { id: 'b', final_score: 0.9 },
    ];
    const snapshot = [...candidates];
    selectTopCandidatesV1(candidates, 1);
    expect(candidates).toEqual(snapshot);
  });

  it('handles a limit larger than the candidate count without error', () => {
    const candidates = [{ id: 'only', final_score: 0.4 }];
    expect(selectTopCandidatesV1(candidates, 50)).toEqual(candidates);
  });

  it('returns an empty array for empty input', () => {
    expect(selectTopCandidatesV1([], 50)).toEqual([]);
  });
});

describe('ACEContextAssembler Redis connection ownership (T2 item 1)', () => {
  it('reuses the shared getValkeyClient() singleton when no connection override is given', () => {
    const assembler = new ACEContextAssembler();
    expect((assembler as unknown as { redis: unknown }).redis).toBe(getValkeyClient());
    expect((assembler as unknown as { ownsRedisConnection: boolean }).ownsRedisConnection).toBe(false);
  });

  it('opens a distinct connection only when an explicit override is supplied', () => {
    const assembler = new ACEContextAssembler(undefined, '127.0.0.1', 6399, 'not-the-real-password');
    expect((assembler as unknown as { redis: unknown }).redis).not.toBe(getValkeyClient());
    expect((assembler as unknown as { ownsRedisConnection: boolean }).ownsRedisConnection).toBe(true);
  });

  it('close() does not quit the shared singleton when this instance never owned its own connection', async () => {
    const assembler = new ACEContextAssembler();
    const quitSpy = vi.spyOn(getValkeyClient(), 'quit').mockResolvedValue('OK');
    const endSpy = vi
      .spyOn((assembler as unknown as { pgPool: { end: () => Promise<void> } }).pgPool, 'end')
      .mockResolvedValue();

    await assembler.close();

    expect(quitSpy).not.toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalled();
    quitSpy.mockRestore();
    endSpy.mockRestore();
  });

  it('does not restore an evidence packet from a cursor missing source and representation lineage', async () => {
    const assembler = new ACEContextAssembler();
    const redis = (assembler as unknown as { redis: { get: (key: string) => Promise<string | null> } }).redis;
    const getSpy = vi.spyOn(redis, 'get').mockResolvedValue(JSON.stringify({
      id: '00000000-0000-4000-8000-000000000001',
      query_text: 'test',
      query_hash: 'a'.repeat(64),
      last_rank: 0,
      last_score: 0.9,
      candidates_retrieved: 1,
      lanes_completed: ['qdrant'],
      session_id: 'session-1',
      created_at: '2026-10-13T00:00:00.000Z',
      last_accessed_at: '2026-10-13T00:00:00.000Z',
      ttl_seconds: 3600,
      packet_key: 'packet-1',
      last_retrieved_at: '2026-10-13T00:00:00.000Z',
      validation_gates: { gate_1: 'PASS' },
      dimension_verified: 768,
      embedding_lane: 'dense_768',
    }));

    await expect(assembler.getCachedCursorPacket('session-1')).resolves.toBeNull();
    getSpy.mockRestore();
  });
});
