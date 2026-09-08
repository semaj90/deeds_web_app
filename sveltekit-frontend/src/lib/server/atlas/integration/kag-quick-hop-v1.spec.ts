import { describe, expect, it } from 'vitest';
import { createPostgresKagQuickHopReaderV1, executeKagQuickHopV1, runKagQuickHopV1 } from './kag-quick-hop-v1.js';
import { createHyperedgeV1, type HyperedgeV1 } from '../../graph/hyperedge-contract.js';

const edge = (id: string, a: string, b: string, predicate = 'RELATED') => ({
  ...createHyperedgeV1({ predicate, participants: [{ canonicalId: a, role: 'from', ordinal: 0 }, { canonicalId: b, role: 'to', ordinal: 1 }], evidenceRefs: [`evidence:${id}`], workspaceRevision: 'ws-1', graphRevision: 'graph-1', sourceRevision: 'src-1', producerRevision: 'test-1' }),
  hyperedgeId: id,
}) as HyperedgeV1;

describe('bounded KAG quick-hop', () => {
  it('preserves a multi-participant fact without clique expansion', () => {
    const result = runKagQuickHopV1({ seedCanonicalIds: ['a'], workspaceRevision: 'ws-1', graphRevision: 'graph-1', hyperedges: [{
      ...edge('edge-1', 'a', 'b'), participants: [{ canonicalId: 'a', role: 'requirement', ordinal: 0 }, { canonicalId: 'b', role: 'symbol', ordinal: 1 }, { canonicalId: 'c', role: 'test', ordinal: 2 }],
    }] });
    expect(result.visitedHyperedgeIds).toEqual(['edge-1']);
    expect(result.paths).toHaveLength(2);
    expect(result.paths.map((path) => path.toCanonicalId)).toEqual(['b', 'c']);
    expect(result.evidenceRefs).toEqual(['evidence:edge-1']);
  });

  it('filters revisions and enforces depth/frontier/edge budgets', () => {
    const result = runKagQuickHopV1({ seedCanonicalIds: ['a'], workspaceRevision: 'ws-1', graphRevision: 'graph-1', maxDepth: 1, maxFrontier: 1, maxHyperedges: 1, hyperedges: [edge('edge-1', 'a', 'b'), { ...edge('stale', 'a', 'stale'), workspaceRevision: 'old' }] });
    expect(result.visitedCanonicalIds).toEqual(['a', 'b']);
    expect(result.visitedHyperedgeIds).toEqual(['edge-1']);
    expect(result.paths).toHaveLength(1);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects missing revision authority', () => {
    expect(() => runKagQuickHopV1({ seedCanonicalIds: ['a'], workspaceRevision: '', graphRevision: 'graph-1', hyperedges: [] })).toThrow('WORKSPACE_REVISION_REQUIRED');
  });

  it('coordinates bounded reader pages and rejects a stale reader result', async () => {
    const calls: string[][] = [];
    const result = await executeKagQuickHopV1({ seedCanonicalIds: ['a'], workspaceRevision: 'ws-1', graphRevision: 'graph-1', maxDepth: 2 }, {
      readHyperedges: async (ids) => { calls.push([...ids]); return calls.length === 1 ? [edge('edge-1', 'a', 'b')] : []; },
    });
    expect(calls).toEqual([['a'], ['b']]);
    expect(result.visitedHyperedgeIds).toEqual(['edge-1']);
    await expect(executeKagQuickHopV1({ seedCanonicalIds: ['a'], workspaceRevision: 'ws-1', graphRevision: 'graph-1' }, {
      readHyperedges: async () => [{ ...edge('stale', 'a', 'b'), graphRevision: 'old' }],
    })).rejects.toThrow('READER_REVISION_MISMATCH');
  });

  it('exposes a side-effect-free production reader composition point', async () => {
    const reader = await createPostgresKagQuickHopReaderV1();
    expect(typeof reader.readHyperedges).toBe('function');
  });
});
