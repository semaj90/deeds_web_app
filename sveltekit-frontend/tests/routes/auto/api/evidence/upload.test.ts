// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/evidence/upload/+server.ts
 * Handlers: POST
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/evidence/upload
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { databaseMethods, externalMethods } = vi.hoisted(() => ({
  databaseMethods: {
    execute: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  externalMethods: {
    createUploadedFile: vi.fn(),
    invalidateEvidenceCache: vi.fn(),
    invalidateCaseCache: vi.fn(),
    invalidateACEChunksCache: vi.fn(),
    getRedis: vi.fn(),
    deleteSeaweedFile: vi.fn(),
  },
}));

vi.mock('$lib/server/db/client', () => ({ db: databaseMethods }));
vi.mock('$lib/server/files/upload-file-service.js', () => ({ createUploadedFile: externalMethods.createUploadedFile }));
vi.mock('$lib/server/cache/invalidation.js', () => ({
  invalidateEvidenceCache: externalMethods.invalidateEvidenceCache,
  invalidateCaseCache: externalMethods.invalidateCaseCache,
  invalidateACEChunksCache: externalMethods.invalidateACEChunksCache,
}));
vi.mock('$lib/server/redis.js', () => ({ getRedis: externalMethods.getRedis }));
vi.mock('$lib/server/seaweed-client.js', () => ({
  deleteSeaweedFile: externalMethods.deleteSeaweedFile,
  uploadSeaweedFile: vi.fn(),
}));
vi.mock('$lib/server/graph/pg-neo4j-sync.js', () => ({ syncCaseToGraph: vi.fn() }));
vi.mock('$lib/server/features/evidence/audit/evidence-audit.js', () => ({ logEvidenceAction: vi.fn() }));

describe('src/routes/api/evidence/upload/+server.ts', () => {
  describe('POST /api/evidence/upload', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      Object.values(databaseMethods).forEach((method) => method.mockReset());
      Object.values(externalMethods).forEach((method) => method.mockReset());
      databaseMethods.execute.mockResolvedValue({ rows: [{ id: '22222222-2222-4222-8222-222222222222' }] });
      databaseMethods.insert.mockReturnValue({
        values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111' }]) })),
      });
      databaseMethods.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
      externalMethods.createUploadedFile.mockResolvedValue({ file: { id: '33333333-3333-4333-8333-333333333333' } });
      externalMethods.deleteSeaweedFile.mockResolvedValue(true);
      externalMethods.invalidateEvidenceCache.mockResolvedValue(undefined);
      externalMethods.invalidateCaseCache.mockResolvedValue(undefined);
      externalMethods.invalidateACEChunksCache.mockResolvedValue(undefined);
      externalMethods.getRedis.mockReturnValue({ get: vi.fn().mockResolvedValue(null) });
      const mod = await import('../../../../../src/routes/api/evidence/upload/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/evidence/upload', body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    }
    function makeMultipartReq(form: FormData) {
      return new Request('http://localhost/api/evidence/upload', { method: 'POST', body: form });
    }
    function makeUrl() { return new URL('http://localhost/api/evidence/upload'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      // Some routes throw error(4xx) instead of returning a Response — catch HttpError too.
      let status: number;
      try {
        const resp = await handler({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
        status = resp.status;
      } catch (e: unknown) {
        // SvelteKit HttpError thrown by throw error(401) etc.
        status = (e as { status?: number }).status ?? 500;
      }
      expect([401, 403]).toContain(status);
      for (const method of Object.values(databaseMethods)) expect(method).not.toHaveBeenCalled();
    });

    it('400 — malformed multipart input returns a stable JSON error without writes', async () => {
      const response = await handler({
        request: makeReq({ description: 'missing multipart body' }),
        locals: { user: { id: 42 } },
        url: makeUrl(),
        params: {},
      });

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to parse multipart form data'),
      });
      for (const method of Object.values(databaseMethods)) expect(method).not.toHaveBeenCalled();
    });

    it('400 — missing file returns a JSON error without database access', async () => {
      const form = new FormData();
      form.set('description', 'valid description');
      const request = new Request('http://localhost/api/evidence/upload', { method: 'POST', body: form });
      const response = await handler({
        request,
        locals: { user: { id: 42 } },
        url: makeUrl(),
        params: {},
      });

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
      await expect(response.json()).resolves.toEqual({ success: false, error: 'No file provided' });
      for (const method of Object.values(databaseMethods)) expect(method).not.toHaveBeenCalled();
    });

    it('201 — accepts an authenticated multipart upload and returns the queued-processing envelope', async () => {
      const form = new FormData();
      form.set('caseId', '22222222-2222-4222-8222-222222222222');
      form.set('description', 'fixture upload');
      form.set('evidenceType', 'document');
      form.set('enableAiAnalysis', 'false');
      form.set('enableOcr', 'false');
      form.set('enableEmbeddings', 'false');
      form.set('enableSummarization', 'false');
      form.set('file', new File([], 'empty.txt', { type: 'text/plain' }));

      const response = await handler({
        request: makeMultipartReq(form),
        locals: { user: { id: 42 } },
        url: makeUrl(),
        params: {},
      });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        success: true,
        id: '11111111-1111-4111-8111-111111111111',
        evidenceId: '11111111-1111-4111-8111-111111111111',
        fileId: '33333333-3333-4333-8333-333333333333',
        caseId: '22222222-2222-4222-8222-222222222222',
        status: 'uploaded',
        data: { status: 'uploaded' },
      });
      expect(databaseMethods.execute).toHaveBeenCalled();
      expect(databaseMethods.insert).toHaveBeenCalled();
      expect(externalMethods.createUploadedFile).toHaveBeenCalledOnce();
    });

    it('500 — storage failure removes the staged object and inserted evidence row', async () => {
      externalMethods.createUploadedFile.mockRejectedValue(new Error('storage unavailable'));
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      const form = new FormData();
      form.set('caseId', '22222222-2222-4222-8222-222222222222');
      form.set('description', 'fixture upload');
      form.set('evidenceType', 'document');
      form.set('file', new File(['fixture'], 'fixture.txt', { type: 'text/plain' }));

      const response = await handler({
        request: makeMultipartReq(form),
        locals: { user: { id: 42 } },
        url: makeUrl(),
        params: {},
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({ success: false, error: 'Evidence upload processing failed', data: null });
      expect(typeof body.jobId).toBe('string');
      expect(databaseMethods.delete).toHaveBeenCalledOnce();
      expect(externalMethods.deleteSeaweedFile).toHaveBeenCalledOnce();
      errorLog.mockRestore();
    });
  });

});
