import { describe, expect, it, vi } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: { execute: mockExecute },
}));

import { hydrateCandidatesWithProof } from './hydrate-candidates.js';
import type { FusedCandidate } from './fuse-candidates.js';

function baseCandidate(overrides: Partial<FusedCandidate> = {}): FusedCandidate {
  return {
    id: 'row-a',
    packetKey: 'packet-a',
    sourceRef: 'src/foo.ts',
    summary: 'a summary',
    content: 'content',
    score: 0.75,
    scoreSource: 'postgres_trigram',
    fusionScore: 0.5,
    rankBefore: 1,
    sourceCount: 1,
    ...overrides,
  } as FusedCandidate;
}

function mockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-a',
    qdrant_id: null,
    relative_path: 'src/foo.ts',
    source_ref: 'src/foo.ts',
    symbol: 'fooFn',
    summary: 'a summary',
    content: 'content',
    semantic_tags: [],
    metadata: {},
    domain: 'general',
    som_cluster: null,
    page_rank_score: null,
    community_id: null,
    content_hash: 'abc123',
    updated_at: new Date('2026-01-01T00:00:00Z'),
    language: 'ts',
    kind: 'function',
    output_meta: {},
    ...overrides,
  };
}

describe('hydrateCandidatesWithProof — BM25/lexical signal wiring', () => {
  it('populates envelope.lexical from a postgres_trigram (real ts_rank BM25) candidate', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [mockRow()] }); // exact-match query
    mockExecute.mockResolvedValueOnce({ rows: [] }); // source_ref fallback query (unused here)

    const { envelopes } = await hydrateCandidatesWithProof([
      baseCandidate({ score: 0.82, scoreSource: 'postgres_trigram' }),
    ]);

    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].lexical).toBeDefined();
    expect(envelopes[0].lexical).toMatchObject({
      name: 'lexical',
      score: 0.82,
      query_coverage: 0.82,
      confidence: 0.82,
      matched_terms: [],
    });
  });

  it('does not populate envelope.lexical for a non-lexical candidate (e.g. qdrant dense)', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [mockRow()] });
    mockExecute.mockResolvedValueOnce({ rows: [] });

    const { envelopes } = await hydrateCandidatesWithProof([
      baseCandidate({ scoreSource: 'qdrant', embeddingLane: 'dense_768' }),
    ]);

    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].lexical).toBeUndefined();
  });

  it('clamps an out-of-range lexical score defensively to [0, 1]', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [mockRow()] });
    mockExecute.mockResolvedValueOnce({ rows: [] });

    const { envelopes } = await hydrateCandidatesWithProof([
      baseCandidate({ score: 1.4, scoreSource: 'postgres_trigram' }),
    ]);

    expect(envelopes[0].lexical?.score).toBe(1);
  });
});
