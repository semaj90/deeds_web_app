import { describe, expect, it, vi } from 'vitest';

const { mockExecute, mockEmbedText, mockSyncSummaryPayloadToQdrant } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockEmbedText: vi.fn(),
  mockSyncSummaryPayloadToQdrant: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    execute: mockExecute,
  },
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
  embedText: mockEmbedText,
}));

vi.mock('./qdrant-summary-sync.js', () => ({
  syncSummaryPayloadToQdrant: mockSyncSummaryPayloadToQdrant,
}));

import { promoteResults } from './promote-results.js';
import type { FeatureEnvelope } from './feature-envelope.js';

describe('promote-results', () => {
  it('syncs qdrant payloads for the full result set, not only embedded rows', async () => {
    const results: FeatureEnvelope[] = [
      {
        chunk_id: 'chunk-a',
        packet_key: 'packet-a',
        source_ref: 'src/a.ts',
        feature_id: 'feature.a',
        summary: 'Summary A',
        content: 'content a',
        created_at: new Date(),
        retrieval_score: 0.9,
        fusion_score: 0.8,
      },
      {
        chunk_id: 'chunk-b',
        packet_key: 'packet-b',
        source_ref: 'src/b.ts',
        feature_id: 'feature.b',
        summary: '',
        content: 'content b',
        created_at: new Date(),
        retrieval_score: 0.8,
        fusion_score: 0.7,
      },
    ];

    mockExecute
      .mockResolvedValueOnce({ rows: [{ packet_key: 'packet-a' }, { packet_key: 'packet-b' }] })
      .mockResolvedValueOnce({ rows: [{ packet_key: 'packet-a' }, { packet_key: 'packet-b' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            packet_key: 'packet-a',
            source_ref: 'src/a.ts',
            summary: 'Summary A',
            summary_embedding_384: [0.1, 0.2, 0.3],
            qdrant_point_id: 'point-a',
          },
        ],
      });

    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockSyncSummaryPayloadToQdrant.mockResolvedValueOnce({
      collection: 'codebase_chunks_384_hybrid',
      matchedPoints: 1,
      updatedPoints: 1,
      pointIds: ['point-a'],
    });

    const result = await promoteResults(results, { queryText: 'summary promotion' });

    expect(result.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(4);
    expect(mockExecute.mock.calls[3][1]).toEqual(['packet-a', 'packet-b']);
    expect(mockSyncSummaryPayloadToQdrant).toHaveBeenCalledTimes(1);
    expect(mockSyncSummaryPayloadToQdrant).toHaveBeenCalledWith(
      expect.objectContaining({
        packetKey: 'packet-a',
        qdrantPointId: 'point-a',
        payload: expect.objectContaining({
          source_ref: 'src/a.ts',
          summary: 'Summary A',
          summary_embedding_384: [0.1, 0.2, 0.3],
        }),
      }),
    );
  });
});
