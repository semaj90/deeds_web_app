// @vitest-environment node
/**
 * Route: src/routes/api/research/deep/+server.ts
 * Handlers: POST
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('src/routes/api/research/deep/+server.ts', () => {
  describe('POST /api/research/deep', () => {
    let handler: (evt: {
      request: Request;
      locals: Record<string, unknown>;
      url: URL;
      params: Record<string, string>;
    }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = (await import(
        '../../../../../src/routes/api/research/deep/+server.js'
      )) as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request(
        'http://localhost/api/research/deep',
        body !== undefined
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            },
      );
    }
    function makeUrl() {
      return new URL('http://localhost/api/research/deep');
    }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      const resp = await handler({
        request: makeReq({ query: 'test query' }),
        locals: {},
        url: makeUrl(),
        params: {},
      });
      expect(resp.status).toBe(401);
      const data = await resp.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('400 — bad input shape returns 400 with validation issues', async () => {
      const resp = await handler({
        request: makeReq({ query: 'x' }), // min 3 chars
        locals: { user: { id: 'usr-test' } },
        url: makeUrl(),
        params: {},
      });
      expect(resp.status).toBe(400);
      const data = await resp.json();
      expect(data.error).toBe('Invalid input');
      expect(Array.isArray(data.issues)).toBe(true);
    });

    it('200 — happy path returns expected schema with missionId, plan, answer', async () => {
      const resp = await handler({
        request: makeReq({
          query: 'autonomous tort corporate liability precedent',
          top_k: 3,
          writeToObsidian: true,
        }),
        locals: { user: { id: 'usr-test' } },
        url: makeUrl(),
        params: {},
      });
      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(typeof data.missionId).toBe('string');
      expect(data.missionId.length).toBeGreaterThan(0);
      expect(data.query).toBe('autonomous tort corporate liability precedent');
      expect(Array.isArray(data.ranked)).toBe(true);
      expect(Array.isArray(data.plan.steps)).toBe(true);
      expect(data.plan.steps.length).toBe(4);
      expect(typeof data.answer).toBe('string');
      expect(data.artifacts.obsidianPath).toBe(
        `vault/research/mission-${data.missionId.slice(0, 8)}.md`,
      );
    });

    it('200 — gracefully fallbacks to deterministic synthesis when LLM is unavailable', async () => {
      const resp = await handler({
        request: makeReq({
          query: 'doctrine of promissory estoppel',
          top_k: 2,
        }),
        locals: { user: { id: 'usr-test' } },
        url: makeUrl(),
        params: {},
      });
      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.answer).toBeDefined();
      expect(data.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
