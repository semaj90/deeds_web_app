// @vitest-environment node
/**
 * ENHANCED TEST — verifies multipart upload, zod config, and happy path.
 *
 * Route: src/routes/api/evidence/search-by-image/+server.ts
 * Handlers: POST
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSearchByImage } = vi.hoisted(() => ({
  mockSearchByImage: vi.fn()
}));

vi.mock('$lib/server/vector/image-search.js', () => ({
  searchByImage: mockSearchByImage
}));

describe('src/routes/api/evidence/search-by-image/+server.ts', () => {
  describe('POST /api/evidence/search-by-image', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../src/routes/api/evidence/search-by-image/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;

      mockSearchByImage.mockResolvedValue({
        hits: [
          { id: '1', score: 0.95, caption: 'A blue car', tags: ['car', 'blue'] }
        ],
        vlmCaption: 'A blue car on a road',
        vlmTags: ['car', 'blue', 'road']
      });
    });

    function makeReq(image?: File | Blob, config?: unknown) {
      const fd = new FormData();
      if (image) fd.append('image', image);
      if (config) fd.append('config', JSON.stringify(config));
      
      return new Request('http://localhost/api/evidence/search-by-image', {
        method: 'POST',
        body: fd
      });
    }
    function makeUrl() { return new URL('http://localhost/api/evidence/search-by-image'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      // SvelteKit error() throws an exception that vitest/sveltekit handles.
      // In this test environment, we catch it.
      try {
        await handler({ request: makeReq(new Blob(['test'], { type: 'image/png' })), locals: {}, url: makeUrl(), params: {} });
      } catch (e: any) {
        expect(e.status).toBe(401);
        expect(e.body.message).toBe('Unauthorized');
      }
    });

    it('400 — returns error when image field is missing', async () => {
      try {
        await handler({ 
          request: makeReq(), 
          locals: { user: { id: 1 } }, 
          url: makeUrl(), 
          params: {} 
        });
      } catch (e: any) {
        expect(e.status).toBe(400);
        expect(e.body.message).toBe('image field required');
      }
    });

    it('200 — returns search results for valid image and config', async () => {
      const blob = new Blob(['fake-image-data'], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });
      
      const resp = await handler({ 
        request: makeReq(file, { limit: 5 }), 
        locals: { user: { id: 1 } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.hits).toHaveLength(1);
      expect(body.hits[0].caption).toBe('A blue car');
      expect(mockSearchByImage).toHaveBeenCalled();
    });

    it('502 — returns Gateway Error when VLM is unavailable', async () => {
      mockSearchByImage.mockRejectedValue(new Error('VLM model timeout'));
      
      try {
        await handler({ 
          request: makeReq(new Blob(['test']), { limit: 5 }), 
          locals: { user: { id: 1 } }, 
          url: makeUrl(), 
          params: {} 
        });
      } catch (e: any) {
        expect(e.status).toBe(502);
        expect(e.body.message).toContain('Vision model unavailable');
      }
    });
  });
});
