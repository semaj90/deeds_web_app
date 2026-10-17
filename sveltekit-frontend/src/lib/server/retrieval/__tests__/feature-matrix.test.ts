import { describe, expect, it, vi, beforeEach } from 'vitest';

const executeMock = vi.fn();
const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const graphRevision = 'b'.repeat(64);
const sourceRevisionOne = `sha256:${'1'.repeat(64)}`;
const sourceRevisionTwo = `sha256:${'2'.repeat(64)}`;

function authorityInput(identities: Array<{ packetKey: string; sourceRef: string; sourceRevision: string }> = []) {
  return { identities, workspaceRevision, graphRevision };
}

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
    const result = await fetchAuthorityScores(authorityInput());
    expect(result.size).toBe(0);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('fails closed without exact workspace and graph snapshot revisions', async () => {
    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores({
      ...authorityInput([{ packetKey: 'pkt:1', sourceRef: 'src/foo.ts', sourceRevision: sourceRevisionOne }]),
      graphRevision: '',
    });
    expect(result.size).toBe(0);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('keys the map by packet_key when present, falling back to source_ref', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        { matched_packet_key: 'pkt:1', matched_source_ref: 'src/foo.ts', matched_source_revision: sourceRevisionOne, authority_percentile: 0.8 },
        { matched_packet_key: 'pkt:2', matched_source_ref: 'src/bar.ts', matched_source_revision: sourceRevisionTwo, authority_percentile: 0.4 },
      ],
    });

    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores(authorityInput([
      { packetKey: 'pkt:1', sourceRef: 'src/foo.ts', sourceRevision: sourceRevisionOne },
      { packetKey: 'pkt:2', sourceRef: 'src/bar.ts', sourceRevision: sourceRevisionTwo },
    ]));

    expect(result.get('pkt:1')).toBe(0.8);
    expect(result.get('src/foo.ts')).toBe(0.8);
    expect(result.get('pkt:2')).toBe(0.4);
    expect(result.get('src/bar.ts')).toBe(0.4);
  });

  it('rejects rows whose packet source revision differs from the request snapshot', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{
        matched_packet_key: 'pkt:1',
        matched_source_ref: 'src/foo.ts',
        matched_source_revision: sourceRevisionTwo,
        authority_percentile: 0.99,
      }],
    });

    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores(authorityInput([
      { packetKey: 'pkt:1', sourceRef: 'src/foo.ts', sourceRevision: sourceRevisionOne },
    ]));

    expect(result.size).toBe(0);
  });

  it('does not select an arbitrary source fallback when same-source packet scores disagree', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        { matched_packet_key: 'pkt:1', matched_source_ref: 'src/foo.ts', matched_source_revision: sourceRevisionOne, authority_percentile: 0.8 },
        { matched_packet_key: 'pkt:2', matched_source_ref: 'src/foo.ts', matched_source_revision: sourceRevisionOne, authority_percentile: 0.4 },
      ],
    });

    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores(authorityInput([
      { packetKey: 'pkt:1', sourceRef: 'src/foo.ts', sourceRevision: sourceRevisionOne },
      { packetKey: 'pkt:2', sourceRef: 'src/foo.ts', sourceRevision: sourceRevisionOne },
    ]));

    expect(result.get('pkt:1')).toBe(0.8);
    expect(result.get('pkt:2')).toBe(0.4);
    expect(result.has('src/foo.ts')).toBe(false);
  });

  it('degrades to an empty map (does not throw) when the db call fails', async () => {
    executeMock.mockRejectedValueOnce(new Error('connection refused'));
    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores(authorityInput([
      { packetKey: 'pkt:1', sourceRef: 'src/foo.ts', sourceRevision: sourceRevisionOne },
    ]));
    expect(result.size).toBe(0);
  });

  it('ignores non-finite authority_percentile values instead of poisoning the map', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        { matched_packet_key: 'pkt:bad', matched_source_ref: 'src/bad.ts', matched_source_revision: sourceRevisionOne, authority_percentile: 'not-a-number' },
        { matched_packet_key: 'pkt:good', matched_source_ref: 'src/good.ts', matched_source_revision: sourceRevisionTwo, authority_percentile: 0.55 },
      ],
    });

    const { fetchAuthorityScores } = await import('../feature-matrix.js');
    const result = await fetchAuthorityScores(authorityInput([
      { packetKey: 'pkt:bad', sourceRef: 'src/bad.ts', sourceRevision: sourceRevisionOne },
      { packetKey: 'pkt:good', sourceRef: 'src/good.ts', sourceRevision: sourceRevisionTwo },
    ]));

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
