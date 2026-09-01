import { beforeEach, describe, expect, it, vi } from 'vitest';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('$lib/server/atlas/integration/kag-hypergraph-reader-v1.js', () => ({ readKagHypergraphNeighborsStrictV1: read }));

describe('oak KAG neighbor DAG handler', () => {
  beforeEach(() => read.mockReset());

  it('binds the exact KAG neighbor contract without pretending packet lookup', async () => {
    read.mockResolvedValueOnce({ requestedCanonicalIds: 1, matchedTuples: 1, matchedHyperedges: 1, neighbors: [{ canonicalId: 'canonical:1', hyperedgeIds: ['edge:1'] }] });
    const { createOakDagKagNeighborHandlerV1 } = await import('./oak-dag-kag-neighbor-handler-v1.js');
    const handler = createOakDagKagNeighborHandlerV1();
    const result = await handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: { canonicalIds: ['canonical:1'] }, action: {} } as never });

    expect(handler.implementationRef).toBe('parent-atlas.kag.neighbor-read.strict.v1');
    expect(result).toMatchObject({ requestedCanonicalIds: 1, writesPerformed: false, canonicalAuthority: false });
    expect(read).toHaveBeenCalledWith(['canonical:1']);
  });

  it('rejects empty or over-bounded canonical ID input', async () => {
    const { createOakDagKagNeighborHandlerV1 } = await import('./oak-dag-kag-neighbor-handler-v1.js');
    const handler = createOakDagKagNeighborHandlerV1();
    await expect(handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: { canonicalIds: [] }, action: {} } as never })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
