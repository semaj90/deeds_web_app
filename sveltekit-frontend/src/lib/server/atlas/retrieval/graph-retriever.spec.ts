// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRun, mockClose, mockSession } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockClose: vi.fn(),
  mockSession: vi.fn(),
}));

vi.mock('../../neo4j-driver.js', () => ({
  getNeo4jDriver: () => ({
    session: mockSession,
  }),
}));

import { graphRetrieve } from './graph-retriever.js';

const record = (values: Record<string, unknown>) => ({
  get: (key: string) => values[key],
});

describe('graphRetrieve bounded path evidence', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockClose.mockReset().mockResolvedValue(undefined);
    mockSession.mockReset().mockReturnValue({ run: mockRun, close: mockClose });
  });

  it('returns the actual one- and two-hop edge paths from a read-only query', async () => {
    mockRun.mockResolvedValue({
      records: [
        record({
          packetKey: 'pkt:direct',
          sourceRef: 'src/direct.ts',
          featureId: 'feature-direct',
          pageRankPrior: 2,
          depth: 1,
          relationshipPath: ['CALLS'],
          nodePacketKeys: ['pkt:seed', 'pkt:direct'],
        }),
        record({
          packetKey: 'pkt:two-hop',
          sourceRef: 'src/two-hop.ts',
          featureId: 'feature-two-hop',
          pageRankPrior: 4,
          depth: 2,
          relationshipPath: ['IMPORTS', 'CALLS'],
          nodePacketKeys: ['pkt:seed', 'pkt:middle', 'pkt:two-hop'],
        }),
      ],
    });

    const candidates = await graphRetrieve({
      seedPacketKeys: ['pkt:seed'],
      allowedRelationships: ['IMPORTS', 'CALLS'],
      maxDepth: 2,
      maxCandidates: 10,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        packetKey: 'pkt:two-hop',
        seedPacketKey: 'pkt:seed',
        relationshipPath: ['IMPORTS', 'CALLS'],
        relationshipEdges: [
          { fromPacketKey: 'pkt:seed', toPacketKey: 'pkt:middle', relationshipType: 'IMPORTS' },
          { fromPacketKey: 'pkt:middle', toPacketKey: 'pkt:two-hop', relationshipType: 'CALLS' },
        ],
        depth: 2,
        graphScore: 0.4,
        sourceRef: 'src/two-hop.ts',
        featureId: 'feature-two-hop',
      }),
      expect.objectContaining({
        packetKey: 'pkt:direct',
        relationshipPath: ['CALLS'],
        relationshipEdges: [
          { fromPacketKey: 'pkt:seed', toPacketKey: 'pkt:direct', relationshipType: 'CALLS' },
        ],
        depth: 1,
      }),
    ]);

    const [cypher, parameters] = mockRun.mock.calls[0]!;
    expect(cypher).toContain('length(p) AS depth');
    expect(cypher).toContain('[rel IN relationships(p) | type(rel)] AS relationshipPath');
    expect(cypher).toContain('[node IN nodes(p) | node.packet_key] AS nodePacketKeys');
    expect(cypher).toContain('all(rel IN r WHERE type(rel) IN $allowedRelationships)');
    expect(mockSession).toHaveBeenCalledWith({ defaultAccessMode: 'READ' });
    expect(parameters).toEqual({
      packetKey: 'pkt:seed',
      allowedRelationships: ['IMPORTS', 'CALLS'],
      perSeedLimit: 10,
    });
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('fails closed before opening Neo4j for invalid depth or unbounded candidate limits', async () => {
    const request = {
      seedPacketKeys: ['pkt:seed'],
      allowedRelationships: ['CALLS'] as const,
      maxDepth: 2 as const,
      maxCandidates: 10,
    };

    expect(await graphRetrieve({ ...request, maxDepth: 3 as 1 | 2 })).toEqual([]);
    expect(await graphRetrieve({ ...request, maxCandidates: 1001 })).toEqual([]);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });
});
