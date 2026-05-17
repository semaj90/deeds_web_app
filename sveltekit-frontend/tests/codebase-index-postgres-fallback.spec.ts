// @vitest-environment node
/**
 * Regression coverage for the PostgreSQL mirror fallback.
 *
 * Verifies that:
 * - cluster-aware retrieval uses codebase_chunk_index when Postgres has rows
 * - cluster summaries are generated from mirrored rows and persisted back
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFetch,
  mockPoolQuery,
  mockBifrostChat,
  mockOllamaFetch,
  mockRedisGet,
  mockRedisSet,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockBifrostChat: vi.fn(),
  mockOllamaFetch: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat: (...args: unknown[]) => mockBifrostChat(...args),
  ollamaFetch: (...args: unknown[]) => mockOllamaFetch(...args),
  VLM_MODELS: {
    legal: 'gemma4-legal:latest',
    vision: 'gemma4-legal-vlm:latest',
    embedding: 'embeddinggemma:latest',
    gemma4: 'gemma4-legal:latest',
    tool: 'gemma4-legal:latest',
  },
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
  }),
}));

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue('OK');
  mockFetch.mockImplementation(async () => jsonResponse({ result: { points: [] } }));
  mockOllamaFetch.mockImplementation(async (url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/chat')) {
      return jsonResponse({
        message: {
          content: JSON.stringify({
            summary: 'Cluster summary for the Postgres mirror.',
            purpose: 'Mirror bridge',
            patterns: ['Postgres fallback', 'LLM summary'],
            keyFiles: ['src/lib/server/indexer/cluster-summary.ts'],
            warnings: [],
          }),
        },
      });
    }
    return jsonResponse({ embedding: [0.11, 0.22, 0.33, 0.44] });
  });
  mockPoolQuery.mockImplementation(async (sql: unknown, params?: unknown[]) => {
    const text = String(sql);

    if (text.includes('SET cluster_summary') || text.includes('SET summary_embedding')) {
      return { rows: [] };
    }

    if (text.includes('SELECT qdrant_id') && params?.length === 2) {
      return {
        rows: [
          {
            qdrant_id: 'chunk-123',
            relative_path: 'src/lib/server/indexer/cluster-summary.ts',
            path: 'src/lib/server/indexer/cluster-summary.ts',
            symbol: 'searchCodebaseByCluster',
            kind: 'server-module',
            content: 'export async function searchCodebaseByCluster() {}',
            tags: ['server-module', 'mirror'],
            page_rank_score: 0.91,
            gpu_cluster: 12,
            som_cluster: 12,
            cluster_summary: {
              summary: 'Cluster narrative',
              purpose: 'Mirror bridge',
            },
          },
        ],
      };
    }

    if (text.includes('SELECT qdrant_id') && params?.length === 1) {
      return {
        rows: [
          {
            qdrant_id: 'chunk-456',
            relative_path: 'src/lib/server/retrieval/codebase-context.ts',
            path: 'src/lib/server/retrieval/codebase-context.ts',
            symbol: 'searchCodebaseByCluster',
            kind: 'server-module',
            content: 'export async function searchCodebaseByCluster() {}',
            tags: ['server-module', 'database'],
            page_rank_score: 0.88,
            gpu_cluster: 7,
            som_cluster: 7,
            cluster_summary: {},
          },
        ],
      };
    }

    return { rows: [] };
  });
});

describe('searchCodebaseByCluster', () => {
  it('returns Postgres mirrored chunks before falling back to Qdrant', async () => {
    const mod = await import('../src/lib/server/retrieval/codebase-context.js');
    mockFetch.mockClear();

    const results = await mod.searchCodebaseByCluster(12, 5);

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('chunk-123');
    expect(results[0]?.score).toBe(0.91);
    expect(results[0]?.payload.cluster_summary).toMatchObject({
      summary: 'Cluster narrative',
      purpose: 'Mirror bridge',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('generateClusterSummary', () => {
  it('builds from mirrored rows and persists summary JSON plus embedding', async () => {
    mockBifrostChat.mockResolvedValue(
      JSON.stringify({
        summary: 'Cluster summary for the Postgres mirror.',
        purpose: 'Mirror bridge',
        patterns: ['Postgres fallback', 'LLM summary'],
        keyFiles: ['src/lib/server/indexer/cluster-summary.ts'],
        warnings: [],
      })
    );

    const mod = await import('../src/lib/server/indexer/cluster-summary.js');
    mockFetch.mockClear();

    const result = await mod.generateClusterSummary(7, true);

    expect(result.ok).toBe(true);
    const summary = (result as any).summary;
    expect(summary).not.toBeNull();
    expect(summary?.clusterId).toBe(7);
    expect(summary?.purpose).toBe('Mirror bridge');
    expect(summary?.patterns).toContain('Postgres fallback');
    expect(summary?.generatedAt).toEqual(expect.any(String));

    const updateSql = mockPoolQuery.mock.calls.map(([sql]) => String(sql));
    expect(updateSql.some((sql) => sql.includes('SET cluster_summary = $1::jsonb'))).toBe(true);
    expect(updateSql.some((sql) => sql.includes('SET summary_embedding = $1::vector'))).toBe(true);
    expect(mockOllamaFetch).toHaveBeenCalled();
  });
});
