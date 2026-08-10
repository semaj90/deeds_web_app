import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    execute: executeMock,
  },
}));

import { atlasToolRegistry } from '$lib/server/ace/atlas-tool-registry.js';

function flattenSqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] } | null | undefined)?.queryChunks ?? [];

  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string' || typeof chunk === 'number' || typeof chunk === 'bigint') {
        return String(chunk);
      }

      if (chunk && typeof chunk === 'object' && 'value' in chunk) {
        const value = (chunk as { value?: unknown }).value;
        if (Array.isArray(value)) {
          return value.map((part) => String(part)).join('');
        }

        return String(value ?? '');
      }

      return '';
    })
    .join('');
}

describe('atlas.graph.pagerank', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('queries pagerank only and does not fall back to authority_score', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          packet_key: 'packet-a',
          source_ref: 'src-a',
          pagerank_score: 0.91,
          authority_score: 0.5,
          total_count: 2,
        },
        {
          packet_key: 'packet-b',
          source_ref: null,
          pagerank_score: 0.73,
          authority_score: 0.5,
          total_count: 2,
        },
      ],
    });

    const result = await atlasToolRegistry['atlas.graph.pagerank'].execute(
      { limit: 25, offset: 0 },
      {} as never,
    );

    expect(executeMock).toHaveBeenCalledTimes(1);

    const sqlText = flattenSqlText(executeMock.mock.calls[0]?.[0]);
    expect(sqlText).toContain('pagerank_score');
    expect(sqlText).not.toContain('authority_score');
    expect(sqlText).toContain('WHERE pagerank_score IS NOT NULL AND pagerank_score > 0');
    expect(sqlText).toContain('ORDER BY pagerank_score DESC, packet_key ASC');

    expect(result.results).toEqual([
      {
        packetKey: 'packet-a',
        sourceRef: 'src-a',
        pageRankScore: 0.91,
        rank: 1,
      },
      {
        packetKey: 'packet-b',
        sourceRef: null,
        pageRankScore: 0.73,
        rank: 2,
      },
    ]);
    expect(result.total).toBe(2);
    expect(result.metadata.source).toBe('postgres:atlas_packets.pagerank_score');
  });
});
