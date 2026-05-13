// @vitest-environment node
/**
 * ENHANCED TEST — verifies Auth, Core Infrastructure Health, and gRPC status.
 *
 * Route: src/routes/api/system/health/+server.ts
 * Handlers: GET
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockOllama, mockEnv, mockQuic } = vi.hoisted(() => ({
  mockDb: {
    execute: vi.fn().mockResolvedValue([])
  },
  mockOllama: {
    ollamaFetch: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
    })
  },
  mockEnv: {
    OLLAMA_BASE_URL: 'http://ollama',
    QDRANT_URL: 'http://qdrant'
  },
  mockQuic: {
    getQuicEmbeddingHealth: vi.fn().mockReturnValue({ status: 'ok' })
  }
}));

vi.mock('$lib/server/db/client', () => ({
  db: mockDb
}));

vi.mock('$lib/server/env.server.ts', () => ({
  ENV: mockEnv
}));

vi.mock('$lib/server/ollama.js', () => ({
  ollamaFetch: mockOllama.ollamaFetch
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  getQuicEmbeddingHealth: mockQuic.getQuicEmbeddingHealth
}));

// Mock fetch globally
const globalFetch = vi.fn();
vi.stubGlobal('fetch', globalFetch);

describe('src/routes/api/system/health/+server.ts', () => {
  let handler: any;
  const mockUser = { id: 1, email: 'admin@deeds.ai' };

  beforeEach(async () => {
    vi.resetAllMocks();
    globalFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ result: { points_count: 100 } }) });
    
    // Re-establish implementations
    mockDb.execute.mockResolvedValue([]);
    mockOllama.ollamaFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
    });
    mockQuic.getQuicEmbeddingHealth.mockReturnValue({ status: 'ok' });

    const mod = await import('../../../../../src/routes/api/system/health/+server.js') as any;
    handler = mod.GET;
  });

  function makeReq() {
    return {
      request: new Request('http://localhost/api/system/health'),
      locals: { user: mockUser },
      url: new URL('http://localhost/api/system/health'),
      params: {}
    };
  }

  it('401 if not logged in', async () => {
    const resp = await handler({ ...makeReq(), locals: {} });
    expect(resp.status).toBe(401);
  });

  it('200 for happy path health report', async () => {
    const resp = await handler(makeReq());
    expect(resp.status).toBe(200);
    
    const body = await resp.json();
    expect(body.status).toBe('ok');
    expect(body.services.database.status).toBe('ok');
    expect(body.services.ollama.detail).toContain('1 models loaded');
    expect(body.system.uptime).toBeTypeOf('number');
  });

  it('returns degraded if core service (database) is down', async () => {
    mockDb.execute.mockRejectedValueOnce(new Error('Connection refused'));
    
    const resp = await handler(makeReq());
    expect(resp.status).toBe(200);
    
    const body = await resp.json();
    expect(body.status).toBe('degraded');
    expect(body.services.database.status).toBe('error');
    expect(body.services.database.detail).toBe('Connection refused');
  });

  it('turboQuant failure does not degrade overall status', async () => {
    // Mock turboQuant fetch failure
    globalFetch.mockImplementation(async (url: string) => {
      if (url.includes('8080')) return { ok: false };
      return { ok: true, json: () => Promise.resolve({ result: { points_count: 100 } }) };
    });

    const resp = await handler(makeReq());
    const body = await resp.json();
    
    expect(body.status).toBe('ok');
    expect(body.services.turboQuant.detail).toBe('optional-offline');
  });
});
