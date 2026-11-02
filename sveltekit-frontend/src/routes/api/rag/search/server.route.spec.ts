import { describe, expect, it, vi } from 'vitest';

vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('GET /api/rag/search (deprecated shim)', () => {
  async function call(search: string, user: unknown = { id: 1 }) {
    const { GET } = await import('./+server');
    return GET({ url: new URL(`http://localhost/api/rag/search${search}`), locals: { user } } as any);
  }

  it('redirects q= to the canonical endpoint', async () => {
    const res = await call('?q=lease&limit=5');
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toBe('/api/retrieval/search-unified?q=lease&topK=5');
  });

  it('accepts query= (what the legal spellbook sends)', async () => {
    const res = await call('?query=lease&limit=12&docType=regulation');
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toBe('/api/retrieval/search-unified?q=lease&topK=12');
  });

  it('still returns 400 when neither q nor query is given, and 401 when signed out', async () => {
    expect((await call('?limit=5')).status).toBe(400);
    expect((await call('?q=x', null)).status).toBe(401);
  });
});
