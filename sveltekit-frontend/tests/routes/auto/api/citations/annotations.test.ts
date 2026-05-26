// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('src/routes/api/citations/annotations/+server.ts', () => {
  describe('GET /api/citations/annotations', () => {
    let handler: (evt: {
      request: Request;
      locals: Record<string, unknown>;
      url: URL;
      params: Record<string, string>;
    }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = (await import('../../../../../src/routes/api/citations/annotations/+server.js')) as Record<
        string,
        unknown
      >;
      handler = mod.GET as typeof handler;
    });

    it('401 when locals.user is missing', async () => {
      const response = await handler({
        request: new Request('http://localhost/api/citations/annotations?citationId=00000000-0000-0000-0000-000000000000'),
        locals: {},
        url: new URL('http://localhost/api/citations/annotations?citationId=00000000-0000-0000-0000-000000000000'),
        params: {},
      });

      expect(response.status).toBe(401);
    });

    it('400 on invalid citationId', async () => {
      const response = await handler({
        request: new Request('http://localhost/api/citations/annotations?citationId=invalid-id'),
        locals: { user: { id: 'test-user' } },
        url: new URL('http://localhost/api/citations/annotations?citationId=invalid-id'),
        params: {},
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { success: boolean };
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/citations/annotations', () => {
    let handler: (evt: {
      request: Request;
      locals: Record<string, unknown>;
      url: URL;
      params: Record<string, string>;
    }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = (await import('../../../../../src/routes/api/citations/annotations/+server.js')) as Record<
        string,
        unknown
      >;
      handler = mod.POST as typeof handler;
    });

    it('401 when locals.user is missing', async () => {
      const response = await handler({
        request: new Request('http://localhost/api/citations/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ citationId: '00000000-0000-0000-0000-000000000000', body: 'note' }),
        }),
        locals: {},
        url: new URL('http://localhost/api/citations/annotations'),
        params: {},
      });

      expect(response.status).toBe(401);
    });

    it('400 on invalid payload', async () => {
      const response = await handler({
        request: new Request('http://localhost/api/citations/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ citationId: 'invalid-id' }),
        }),
        locals: { user: { id: 'test-user' } },
        url: new URL('http://localhost/api/citations/annotations'),
        params: {},
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { success: boolean };
      expect(body.success).toBe(false);
    });
  });
});
