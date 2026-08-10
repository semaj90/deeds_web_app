import { describe, expect, it, vi } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    execute: mockExecute,
  },
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
      .mockResolvedValueOnce({ rows: [{ packet_key: 'packet-a' }, { packet_key: 'packet-b' }] });

    const result = await promoteResults(results, { queryText: 'summary promotion' });

    expect(result.success).toBe(true);
    expect(result.stage).toBe('qdrant_sync');
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
