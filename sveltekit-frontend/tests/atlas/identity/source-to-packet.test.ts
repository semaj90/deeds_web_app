// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReadAcePacketBySourceRef,
  mockWriteAcePacket,
  mockBuildVarianceRecoveryContext,
} = vi.hoisted(() => ({
  mockReadAcePacketBySourceRef: vi.fn(),
  mockWriteAcePacket: vi.fn(),
  mockBuildVarianceRecoveryContext: vi.fn(),
}));

vi.mock('../../../src/lib/server/ace/ace-packet-store.js', () => ({
  makeQueryHash: (query: string) => `hash:${query.length}`,
  readAcePacketBySourceRef: mockReadAcePacketBySourceRef,
  writeAcePacket: mockWriteAcePacket,
}));

vi.mock('../../../src/lib/server/ace/variance-recovery.js', () => ({
  buildVarianceRecoveryContext: mockBuildVarianceRecoveryContext,
}));

vi.mock('../../../src/lib/server/ace/nes-chrom-card-store.js', () => ({
  normalizeCardId: (value: string) => value.replace(/\\/g, '/'),
}));

describe('buildAcePacketFromSource', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBuildVarianceRecoveryContext.mockResolvedValue({
      sourceRefs: ['docs/example.md'],
      rankedCards: [{ path: 'docs/example.md', score: 0.9, summary: 'Important summary' }],
      varianceRecovery: {
        exactMatchFailed: false,
        fuzzySearchCandidates: ['docs/example.md'],
        didYouMean: ['docs/example.md'],
        semanticSearchHits: ['docs/example.md'],
        qdrantTags: ['markdown', 'ace'],
        clusterTagRecall: ['cluster:docs'],
        langextractEntities: ['ace', 'packet'],
        semanticCacheHits: [],
        acePacket: 'ace:prompt:hash:7',
        nextSteps: ['synthesis'],
      },
    });
  });

  it('returns an existing packet from cache when sourceRef is already indexed', async () => {
    mockReadAcePacketBySourceRef.mockResolvedValue({
      packet_id: 'packet-existing',
      query: 'docs/example.md',
      source_refs: ['docs/example.md'],
    });

    const mod = await import('../../../src/lib/server/ace/source-to-packet.js');
    const result = await mod.buildAcePacketFromSource({ sourceRef: 'docs/example.md' });

    expect(result.fromCache).toBe(true);
    expect(result.packet.packet_id).toBe('packet-existing');
    expect(mockWriteAcePacket).not.toHaveBeenCalled();
  });

  it('builds and persists a bounded packet from inline markdown', async () => {
    mockReadAcePacketBySourceRef.mockResolvedValue(null);
    mockWriteAcePacket.mockImplementation(async (packet: Record<string, unknown>) => ({
      ...packet,
      packet_id: 'packet-new',
      created_at: '2026-07-26T12:00:00.000Z',
    }));

    const mod = await import('../../../src/lib/server/ace/source-to-packet.js');
    const result = await mod.buildAcePacketFromSource({
      sourceRef: 'docs/example.md',
      markdown: '# Example\n\nThis is a compact markdown body for ACE packet injection.',
      featureId: 'docs.example',
      forceRefresh: true,
    });

    expect(result.fromCache).toBe(false);
    expect(result.packet.packet_id).toBe('packet-new');
    expect(result.packet.source_refs).toContain('docs/example.md');
    expect(result.packet.feature_ids).toContain('docs.example');
    expect(result.packet.prompt_context.length).toBeLessThanOrEqual(3200);
    expect(result.packet.ranked_cards.length).toBeGreaterThan(0);
    expect(result.packet.redis_hot_keys).toEqual(['ace:prompt:hash:7']);
    expect(mockBuildVarianceRecoveryContext).toHaveBeenCalledOnce();
    expect(mockWriteAcePacket).toHaveBeenCalledOnce();
  });
});
