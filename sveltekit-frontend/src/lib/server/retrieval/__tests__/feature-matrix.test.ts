import { describe, expect, it, vi, beforeEach } from 'vitest';

const executeMock = vi.fn();

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    execute: executeMock,
  },
}));

describe('fetchAuthorityScores', () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
  });

  it('returns an empty map when no packet keys or source refs are given', async () => {
    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores({ packetKeys: [], sourceRefs: [] });
    expect(result.size).toBe(0);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('keys the map by packet_key when present, falling back to source_ref', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        { packet_key: 'pkt:1', source_ref: null, authority_percentile: 0.8 },
        { packet_key: null, source_ref: 'src/foo.ts', authority_percentile: 0.4 },
      ],
    });

    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores({
      packetKeys: ['pkt:1'],
      sourceRefs: ['src/foo.ts'],
    });

    expect(result.get('pkt:1')).toBe(0.8);
    expect(result.get('src/foo.ts')).toBe(0.4);
  });

  it('degrades to an empty map (does not throw) when the db call fails', async () => {
    executeMock.mockRejectedValueOnce(new Error('connection refused'));
    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores({ packetKeys: ['pkt:1'], sourceRefs: [] });
    expect(result.size).toBe(0);
  });

  it('ignores non-finite authority_percentile values instead of poisoning the map', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        { packet_key: 'pkt:bad', source_ref: null, authority_percentile: 'not-a-number' },
        { packet_key: 'pkt:good', source_ref: null, authority_percentile: 0.55 },
      ],
    });

    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores({ packetKeys: ['pkt:bad', 'pkt:good'], sourceRefs: [] });

    expect(result.has('pkt:bad')).toBe(false);
    expect(result.get('pkt:good')).toBe(0.55);
  });
});

describe('resolveAuthorityScore', () => {
  it('prefers packet_key over source_ref', async () => {
    const { resolveAuthorityScore } = await import('../feature-matrix.js');
    const authority = new Map([
      ['pkt:1', 0.9],
      ['src/foo.ts', 0.1],
    ]);
    expect(resolveAuthorityScore(authority, 'pkt:1', 'src/foo.ts')).toBe(0.9);
  });

  it('falls back to source_ref when packet_key has no entry', async () => {
    const { resolveAuthorityScore } = await import('../feature-matrix.js');
    const authority = new Map([['src/foo.ts', 0.1]]);
    expect(resolveAuthorityScore(authority, 'pkt:missing', 'src/foo.ts')).toBe(0.1);
  });

  it('returns undefined (not 0) when neither key matches — must not fake a zero authority signal', async () => {
    const { resolveAuthorityScore } = await import('../feature-matrix.js');
    const authority = new Map<string, number>();
    expect(resolveAuthorityScore(authority, 'pkt:missing', 'src/missing.ts')).toBeUndefined();
  });
});

describe('wiring proof: populating pagerank + graph signals changes the blended score', () => {
  it('blendScores ignores pagerank/graph when undefined, but honors them once populated', async () => {
    const { blendScores, DEFAULT_BLEND_WEIGHTS } = await import('../runtime-reranker.js');

    const withoutSignals = blendScores(
      {
        packetKey: 'pkt:1',
        sourceRef: 'src/foo.ts',
        content: '',
        retrievedRank: 1,
        denseScore: 0.5,
      },
      DEFAULT_BLEND_WEIGHTS,
    );

    const withSignals = blendScores(
      {
        packetKey: 'pkt:1',
        sourceRef: 'src/foo.ts',
        content: '',
        retrievedRank: 1,
        denseScore: 0.5,
        pagerankScore: 0.9,
        graphScore: 0.9,
      },
      DEFAULT_BLEND_WEIGHTS,
    );

    // Both signals now carry real, high weight — the blended score must rise.
    expect(withSignals).toBeGreaterThan(withoutSignals);
  });
});
