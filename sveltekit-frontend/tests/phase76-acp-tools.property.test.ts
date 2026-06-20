import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbExecuteMock, redisGetMock, redisSetMock } = vi.hoisted(() => ({
  dbExecuteMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_CHAT_MODEL: 'gemma4-rotorquant:latest',
    OLLAMA_EMBED_MODEL: 'embeddinggemma:latest',
    OLLAMA_VLM_MODEL: 'gemma4-rotorquant:latest',
    GEMMA4_MODEL: 'gemma4-rotorquant:latest',
    FUNCTION_GEMMA_MODEL: 'gemma4-rotorquant:latest',
    NODE_ENV: 'test',
  },
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    execute: dbExecuteMock,
  },
}));

vi.mock('$lib/server/redis.js', () => ({
  redis: {
    get: redisGetMock,
    set: redisSetMock,
    del: vi.fn(async () => 1),
    keys: vi.fn(async () => []),
  },
}));

import {
  executeACPTool,
  getACPToolRegistry,
  getACPToolSchema,
  getAllTools,
  toolSupportsDryRun,
} from '../src/lib/server/services/knowledge-search/ACPToolRegistry';

describe('Phase 76 ACP tool registry', () => {
  beforeEach(() => {
    dbExecuteMock.mockReset();
    redisGetMock.mockReset();
    redisSetMock.mockReset();

    dbExecuteMock.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });
    redisGetMock.mockResolvedValue('{"cached":true}');
    redisSetMock.mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the current tool surface and not stale legacy names', () => {
    const names = getAllTools().map((tool) => tool.name);
    const registry = getACPToolRegistry();

    expect(names).toContain('db:query');
    expect(names).toContain('cache:get');
    expect(names).toContain('cache:set');
    expect(names).toContain('llm:generate');
    expect(names).toContain('metrics:health');
    expect(names).not.toContain('db:tables');
    expect(names).not.toContain('cache:stats');
    expect(names).not.toContain('minio:list');
    expect(names).not.toContain('system:health');
    expect(registry.byCategory('database').map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['db:query', 'cache:get', 'cache:set'])
    );
    expect(getACPToolSchema('db:query')?.description).toMatch(/SELECT/i);
    expect(toolSupportsDryRun('langextract:batch')).toBe(true);
    expect(toolSupportsDryRun('not:a-tool')).toBe(false);
  });

  it('rejects unknown tools', async () => {
    const result = await executeACPTool('db:tables', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('db:query rejects non-SELECT statements', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE'),
        fc.string({ minLength: 1, maxLength: 24 }).filter((value) => /^[a-z_]+$/i.test(value)),
        async (command, tableName) => {
          const result = await executeACPTool('db:query', {
            query: `${command} ${tableName}`,
          });

          expect(result.success).toBe(false);
          expect(result.error).toMatch(/SELECT|forbidden/i);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('db:query dry-run applies a bounded LIMIT to valid SELECT statements', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('cases', 'evidence', 'citations', 'documents'),
        fc.integer({ min: 1, max: 500 }),
        async (tableName, limit) => {
          const result = await executeACPTool(
            'db:query',
            { query: `SELECT * FROM ${tableName}`, limit },
            { dryRun: true }
          );

          expect(result.success).toBe(true);
          expect(result.kind).toBe('plan');
          expect(result.data.steps[1].detail).toContain(
            `SELECT * FROM ${tableName} LIMIT ${limit}`
          );
        }
      ),
      { numRuns: 20 }
    );
  });

  it('cache:get rejects keys outside the allowed namespaces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter(
            (key) =>
              !['phase72:', 'rag:', 'search:', 'session:', 'embedding:', 'acp:', 'llm:'].some(
                (prefix) => key.startsWith(prefix)
              )
          ),
        async (key) => {
          const result = await executeACPTool('cache:get', { key });

          expect(result.success).toBe(false);
          expect(result.error).toContain('Key must start with one of');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('cache:set accepts allowed keys and clamps TTL to one day', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('phase72:', 'rag:', 'search:', 'session:', 'embedding:', 'acp:', 'llm:'),
        fc.string({ minLength: 1, maxLength: 24 }).filter((value) => !value.includes(':')),
        fc.oneof(
          fc.string({ maxLength: 50 }),
          fc.integer(),
          fc.boolean(),
          fc.record({ ok: fc.boolean(), count: fc.integer({ min: 0, max: 10 }) })
        ),
        fc.integer({ min: 1, max: 200000 }),
        async (prefix, suffix, value, ttl) => {
          const result = await executeACPTool('cache:set', {
            key: `${prefix}${suffix}`,
            value,
            ttl,
          });

          expect(result.success).toBe(true);
          expect(result.data.ttl).toBeLessThanOrEqual(86400);
          expect(redisSetMock).toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('llm:generate dry-run accepts arbitrary prompts without network access', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 300 }),
        fc.constantFrom('gemma4-rotorquant:latest', 'custom-model:latest'),
        async (prompt, model) => {
          const result = await executeACPTool('llm:generate', { prompt, model }, { dryRun: true });

          expect(result.success).toBe(true);
          expect(result.kind).toBe('plan');
          expect(result.data.steps[0].detail).toContain(model);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('cache:get returns an existence flag for allowed keys', async () => {
    const result = await executeACPTool('cache:get', { key: 'rag:search:test-key' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        exists: true,
        value: '{"cached":true}',
      })
    );
  });
});
