// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { mockIngestDirectorySummaries } = vi.hoisted(() => ({
  mockIngestDirectorySummaries: vi.fn(),
}));

vi.mock('$lib/server/indexer/directory-summarizer.js', () => ({
  ingestDirectorySummaries: (...args: unknown[]) => mockIngestDirectorySummaries(...args),
}));

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.ts';

describe('POST /api/codebase-index/directory-summaries', () => {
  let POST: (typeof import('../../src/routes/api/codebase-index/directory-summaries/+server.js'))['POST'];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIngestDirectorySummaries.mockResolvedValue({
      directoriesProcessed: 1,
      wikiNotesWritten: 1,
      neo4jEdgesCreated: 1,
      communityRowsUpserted: 1,
      webSearchTriggered: 0,
      errors: [],
    });

    POST = (await import('../../src/routes/api/codebase-index/directory-summaries/+server.js')).POST;
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({
      method: 'POST',
      url: '/api/codebase-index/directory-summaries',
      body: { dirOutputs: [] },
    });

    const res = await POST(event as never);
    expect(res.status).toBe(401);
  });

  it('accepts structured deep-directory-audit payloads and forwards them to the ingester', async () => {
    const body = {
      dirOutputs: [
        {
          rel: 'src/lib/server/cache',
          score: 42,
          metrics: { fileCount: 5, tsErrors: 2 },
          ragSummary: {
            tags: ['cache', 'redis'],
            domains: ['server'],
            summaries: ['Handles Redis exact-match cache.', 'Provides cache invalidation helpers.'],
            chunkCount: 2,
          },
          agentSummary: 'Refactor the invalidation path and add validation coverage.',
          hyperedge: {
            edgeCount: 3,
            topGrade: 'A',
            avgReward: '0.812',
            clusters: [1, 2],
          },
        },
      ],
    };

    const event = makeAuthEvent({
      method: 'POST',
      url: '/api/codebase-index/directory-summaries',
      body,
    });

    const res = await POST(event as never);
    expect(res.status).toBe(200);

    const response = await responseJson<Record<string, unknown>>(res);
    expect(response).toMatchObject({
      directoriesProcessed: 1,
      wikiNotesWritten: 1,
      communityRowsUpserted: 1,
    });

    expect(mockIngestDirectorySummaries).toHaveBeenCalledTimes(1);
    expect(mockIngestDirectorySummaries).toHaveBeenCalledWith([
      expect.objectContaining({
        rel: 'src/lib/server/cache',
        score: 42,
        ragSummary: expect.objectContaining({
          tags: ['cache', 'redis'],
          domains: ['server'],
        }),
        hyperedge: expect.objectContaining({
          topGrade: 'A',
          edgeCount: 3,
        }),
      }),
    ]);
  });

  it('returns 400 for invalid payloads', async () => {
    const event = makeAuthEvent({
      method: 'POST',
      url: '/api/codebase-index/directory-summaries',
      body: { dirOutputs: [] },
    });

    const res = await POST(event as never);
    expect(res.status).toBe(400);
  });
});
