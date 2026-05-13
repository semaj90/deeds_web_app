// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExplainWikiPage } = vi.hoisted(() => ({
  mockExplainWikiPage: vi.fn()
}));

vi.mock('../../../../../../src/lib/server/kb/wiki-logic.js', () => ({
  explainWikiPage: mockExplainWikiPage
}));

describe('src/routes/api/wiki/page/[id]/+server.ts', () => {
  let handler: any;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../../../../../../src/routes/api/wiki/page/[id]/+server.js');
    handler = mod.GET;
    mockExplainWikiPage.mockResolvedValue({
      mapping: {
        id: 'feature:wiki:page',
        kind: 'feature',
        label: 'Wiki Page',
        path: 'src/lib/server/kb/wiki-logic.ts',
        summary: 'Wiki logic page',
        edges: [],
        scores: {},
        metadata: {}
      },
      sourceFiles: ['src/lib/server/kb/wiki-logic.ts'],
      recommendations: ['Check related features']
    });
  });

  function makeEvt(id?: string) {
    return {
      params: id ? { id } : {},
      locals: { user: { id: 1 } },
    };
  }

  it('401 when locals.user is missing', async () => {
    const resp = await handler({ params: { id: 'feature:wiki:page' }, locals: {} });
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('400 when id is missing', async () => {
    const resp = await handler({ params: {}, locals: { user: { id: 1 } } });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toBe('Missing ID');
  });

  it('200 and returns page details', async () => {
    const resp = await handler(makeEvt('feature:wiki:page'));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.page.mapping.id).toBe('feature:wiki:page');
    expect(mockExplainWikiPage).toHaveBeenCalledWith('feature:wiki:page');
  });

  it('404 when the page is missing', async () => {
    mockExplainWikiPage.mockResolvedValueOnce(null);
    const resp = await handler(makeEvt('feature:missing'));
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toBe('Page not found');
  });
});
