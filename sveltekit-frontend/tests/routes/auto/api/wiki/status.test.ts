// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetWikiStatus } = vi.hoisted(() => ({
  mockGetWikiStatus: vi.fn()
}));

vi.mock('../../../../../src/lib/server/kb/wiki-logic.js', () => ({
  getWikiStatus: mockGetWikiStatus
}));

describe('src/routes/api/wiki/status/+server.ts', () => {
  let handler: any;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../../../../../src/routes/api/wiki/status/+server.js');
    handler = mod.GET;
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
    const resp = await handler({ locals: {} });
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('200 and returns wiki status', async () => {
    const resp = await handler({ locals: { user: { id: 1 } } });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.status.pageCount).toBe(3);
    expect(body.status.couchdb.wikiDocs).toBe(4);
    expect(body.status.qdrant.collection).toBe('codebase_chunks_768');
  });
});
