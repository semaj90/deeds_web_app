// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetWikiStatus } = vi.hoisted(() => ({
  mockGetWikiStatus: vi.fn()
}));

vi.mock('../../../../../src/lib/server/kb/wiki-logic.js', () => ({
  getWikiStatus: mockGetWikiStatus
}));

describe('src/routes/(app)/admin/knowledge-base/+page.server.ts', () => {
  let load: any;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../../../../../src/routes/(app)/admin/knowledge-base/+page.server.js');
    load = mod.load;
    mockGetWikiStatus.mockResolvedValue({
      pageCount: 3,
      lastGraphify: '2026-05-12T00:00:00.000Z',
      redis: { agentsCards: 2, wikiPages: 1 },
      couchdb: { wikiDocs: 4 },
      qdrant: { pointCount: 11, collection: 'codebase_chunks_768' },
      neo4j: { agentsCardCount: 7 },
      staleDirectories: ['src/lib/server/kb'],
      directoryCount: 8
    });
  });

  it('401 when locals.user is missing', async () => {
    await expect(load({ locals: {} })).rejects.toMatchObject({ status: 401 });
  });

  it('returns wiki status for authenticated users', async () => {
    const result = await load({ locals: { user: { id: 1 } } });

    expect(mockGetWikiStatus).toHaveBeenCalledTimes(1);
    expect(result.status.pageCount).toBe(3);
    expect(result.status.couchdb.wikiDocs).toBe(4);
    expect(result.status.qdrant.collection).toBe('codebase_chunks_768');
  });
});
