// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAssemblePacketForSourceRef,
  mockBuildAcePacketFromSource,
} = vi.hoisted(() => ({
  mockAssemblePacketForSourceRef: vi.fn(),
  mockBuildAcePacketFromSource: vi.fn(),
}));

vi.mock('../../../src/lib/server/ace/parent-atlas-packet-assembler.js', () => ({
  assemblePacketForSourceRef: mockAssemblePacketForSourceRef,
}));

vi.mock('../../../src/lib/server/ace/source-to-packet.js', () => ({
  buildAcePacketFromSource: mockBuildAcePacketFromSource,
}));

describe('buildIndexedSourcePacket', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('prefers the indexed identity path for an existing source_ref', async () => {
    mockAssemblePacketForSourceRef.mockResolvedValue({
      fromCache: false,
      card: { id: 'card-1' },
      packet: {
        packet_id: 'packet-indexed',
        query: 'src/lib/server/ace/query-router.ts',
        query_hash: 'abc123',
        source_refs: ['src/lib/server/ace/query-router.ts'],
        feature_ids: ['src.lib.server.ace.query-router'],
        lane_ids: ['nes-card', 'som-cluster'],
        cluster_id: '4:7',
        som_cluster: '4:7',
        ranked_cards: [],
      },
    });

    const mod = await import('../../../src/lib/server/ace/indexed-source-packet.js');
    const result = await mod.buildIndexedSourcePacket({
      sourceRef: 'src/lib/server/ace/query-router.ts',
    });

    expect(result.mode).toBe('indexed-identity');
    expect(result.clusterId).toBe('4:7');
    expect(result.laneIds).toContain('nes-card');
    expect(mockBuildAcePacketFromSource).not.toHaveBeenCalled();
  });

  it('falls back to bounded source packetization when indexed identity misses', async () => {
    mockAssemblePacketForSourceRef.mockResolvedValue(null);
    mockBuildAcePacketFromSource.mockResolvedValue({
      fromCache: false,
      normalizedSourceRef: 'docs/example.md',
      packet: {
        packet_id: 'packet-fallback',
        query: 'docs/example.md',
        query_hash: 'hash123',
        source_refs: ['docs/example.md'],
        feature_ids: ['docs.example'],
        lane_ids: ['source-to-packet'],
        cluster_id: null,
        som_cluster: null,
        ranked_cards: [{ source_ref: 'docs/example.md', score: 1, feature_id: 'docs.example', snippet: 'Example' }],
        prompt_context: 'Example context',
      },
    });

    const mod = await import('../../../src/lib/server/ace/indexed-source-packet.js');
    const result = await mod.buildIndexedSourcePacket({
      sourceRef: 'docs/example.md',
      query: 'example',
    });

    expect(result.mode).toBe('source-fallback');
    expect(result.normalizedSourceRef).toBe('docs/example.md');
    expect(result.packet.packet_id).toBe('packet-fallback');
    expect(mockBuildAcePacketFromSource).toHaveBeenCalledOnce();
  });
});
