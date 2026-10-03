// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const { mockGraphRetrieve } = vi.hoisted(() => ({ mockGraphRetrieve: vi.fn() }));

vi.mock('./graph-retriever.js', () => ({ graphRetrieve: mockGraphRetrieve }));

import { createAtlasSearchAdapter } from './search-runtime-adapter.js';

describe('Atlas SearchRuntime graph expansion wiring', () => {
  it('waits for SearchRuntime and seeds only from its explicit pre-fusion dense set', async () => {
    mockGraphRetrieve.mockReset().mockResolvedValue([
      {
        packetKey: 'pkt:neighbor',
        seedPacketKey: 'pkt:dense-seed',
        relationshipPath: ['CALLS'],
        relationshipEdges: [{ fromPacketKey: 'pkt:dense-seed', toPacketKey: 'pkt:neighbor', relationshipType: 'CALLS' }],
        depth: 1,
        graphScore: 0.2,
      },
    ]);
    const adapter = createAtlasSearchAdapter({
      runtime: {
        search: vi.fn().mockResolvedValue({
          packets: [{ packet_key: 'pkt:fused-top' }],
          denseSeedPacketKeys: ['pkt:dense-seed'],
          metadata: {},
          provenance: {},
        }),
      } as never,
    });

    const result = await adapter.search({ query: 'find neighbors', withGraphExpansion: true });

    expect(mockGraphRetrieve).toHaveBeenCalledWith({
      seedPacketKeys: ['pkt:dense-seed'],
      allowedRelationships: ['IMPORTS', 'CALLS', 'SIMILAR_TOPOLOGY', 'USES_CONCEPT'],
      maxDepth: 2,
      maxCandidates: 20,
    });
    expect(result.topPacketKeys).toEqual(['pkt:fused-top']);
    expect(result.graphExpanded).toHaveLength(1);
  });

  it('does not call graph expansion when the dense lane has no canonical seed', async () => {
    mockGraphRetrieve.mockReset();
    const adapter = createAtlasSearchAdapter({
      runtime: {
        search: vi.fn().mockResolvedValue({
          packets: [{ packet_key: 'pkt:lexical-only' }],
          metadata: {},
          provenance: {},
        }),
      } as never,
    });

    const result = await adapter.search({ query: 'lexical only', withGraphExpansion: true });
    expect(mockGraphRetrieve).not.toHaveBeenCalled();
    expect(result.graphExpanded).toBeUndefined();
  });
});
