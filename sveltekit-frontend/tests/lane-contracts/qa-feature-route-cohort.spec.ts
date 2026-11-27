import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import plan from '../../../.okf/pipelines/all-routes-qa-feature-review-v1.json';
import { groupIssuesWithAudit } from '../../scripts/qa/error-fingerprint.mjs';
import { GET as getModelStatus } from '../../src/routes/api/llm/runtime-status/+server.js';
import { GET as getAceStatus } from '../../src/routes/api/ace/status/+server.js';
import { GET as getVlmStatus } from '../../src/routes/api/vlm/status/+server.js';
import { GET as getRecommendations } from '../../src/routes/api/recommendations/+server.js';
import { GET as getPersons } from '../../src/routes/api/persons-of-interest/+server.js';
import { GET as getReports } from '../../src/routes/api/reports/+server.js';
import { GET as getSearch } from '../../src/routes/api/search/+server.js';
import { GET as getErrorSummary } from '../../src/routes/api/errors/summary/+server.js';

const mocks = vi.hoisted(() => ({
  select: vi.fn(), execute: vi.fn(), model: vi.fn(), aceJob: vi.fn(), vlm: vi.fn(), system: vi.fn(),
  redis: vi.fn(), cacheGet: vi.fn(), cachePut: vi.fn(), analytics: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({ db: { select: mocks.select, execute: mocks.execute }, pool: {} }));
vi.mock('$lib/server/db/schema-postgres.js', async () => {
  const { pgTable, integer, text } = await import('drizzle-orm/pg-core');
  return { cases: {}, legalDocuments: {}, personsOfInterest: pgTable('persons_of_interest', {
    id: integer('id'), createdBy: integer('created_by'), name: text('name'), status: text('status'),
    description: text('description'), updatedAt: text('updated_at'),
  }) };
});
vi.mock('$lib/server/db/schema', async () => {
  const { pgTable, integer, text } = await import('drizzle-orm/pg-core');
  return { reports: pgTable('reports', { id: integer('id'), createdBy: integer('created_by'), createdAt: text('created_at') }) };
});
vi.mock('$lib/server/db/schema/kag-dag.js', () => ({ qdrantCentroidClusters: {} }));
vi.mock('$lib/server/ai/llama-server-model-resolver.js', () => ({ resolveLoadedLlamaModel: mocks.model }));
vi.mock('$lib/server/llm/runtime-contract.js', () => ({ LLM_BASE_URL: 'https://fixture.invalid', LLM_MODEL_ID: 'fixture-model' }));
vi.mock('$lib/server/ace-ingest-progress.js', () => ({ getAceIngestJob: mocks.aceJob }));
vi.mock('$lib/server/inference/vlm-lifecycle.js', () => ({ getVlmState: mocks.vlm }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { LLAMA_SERVER_URL: 'https://fixture.invalid' } }));
vi.mock('node:child_process', () => ({ execSync: mocks.system }));
vi.mock('$lib/server/ml/multi-modal-ranker.js', () => ({}));
vi.mock('$lib/server/ml/user-history.js', () => ({}));
vi.mock('$lib/server/auth-helpers.js', () => ({}));
vi.mock('$lib/server/evidence-case-admission-v1.js', () => ({}));
vi.mock('$lib/server/ml/recommendation-metrics.js', () => ({}));
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({}));
vi.mock('$lib/server/atlas/recommendations/bounded-research-pipeline.js', () => ({}));
vi.mock('$lib/server/graph/graph-centrality.js', () => ({}));
vi.mock('$lib/server/redis.js', () => ({ getRedis: mocks.redis }));
vi.mock('$lib/server/reports/audit', () => ({}));
vi.mock('$lib/server/cache/invalidation.js', () => ({}));
vi.mock('$lib/server/legal/citation-service.js', () => ({}));
vi.mock('$lib/server/kag/operator-router.js', () => ({}));
vi.mock('$lib/server/vector/agentic-search.js', () => ({}));
vi.mock('$lib/server/search/semantic-cache.js', () => ({ getSemanticCacheHit: mocks.cacheGet, setSemanticCache: mocks.cachePut }));
vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({}));
vi.mock('$lib/server/retrieval/gpu-reranker.js', () => ({}));
vi.mock('$lib/server/analytics/search-analytics.js', () => ({ recordSearchQuery: mocks.analytics }));

type Handler = (event: never) => Response | Promise<Response>;
const handlers: Record<string, Handler> = {
  '/api/llm/runtime-status': getModelStatus,
  '/api/ace/status': getAceStatus,
  '/api/vlm/status': getVlmStatus,
  '/api/recommendations': getRecommendations,
  '/api/persons-of-interest': getPersons,
  '/api/reports': getReports,
  '/api/search': getSearch,
  '/api/errors/summary': getErrorSummary,
};

function call(route: string, { user = true, query = '' } = {}) {
  const url = new URL(`${route}${query}`, 'https://fixture.invalid');
  return handlers[route]({ url, request: new Request(url), locals: user ? { user: { id: '42' } } : {} } as never);
}

function readQuery(rows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(), offset: vi.fn().mockReturnThis(),
    $withCache: vi.fn().mockResolvedValue(rows),
    then: (resolve: (result: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return query;
}

function whereSql(query: ReturnType<typeof readQuery>) {
  return new PgDialect().sqlToQuery(query.where.mock.calls[0][0] as SQL);
}

describe('QA-FULLSWEEP-01 fixture cohort', () => {
  const unexpectedFetch = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    unexpectedFetch.mockRejectedValue(new Error('Unexpected fixture network call'));
    vi.stubGlobal('fetch', unexpectedFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });

  it('matches the eight planned GET paths', () => {
    expect(plan.fixtureCohort.map(({ method, route }) => `${method} ${route}`).sort())
      .toEqual(Object.keys(handlers).map((route) => `GET ${route}`).sort());
  });

  it.each(plan.fixtureCohort)('@feature:$label $method $route refuses a missing session', async ({ route }) => {
    const response = await call(route, { user: false });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });

  it('@feature:ai.chat reports the loaded model from the stub resolver', async () => {
    mocks.model.mockResolvedValue({ resolvedModel: 'fixture-loaded', source: 'llama-server-loaded' });
    const response = await call('/api/llm/runtime-status');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, model: 'fixture-loaded' });
    expect(mocks.model).toHaveBeenCalledOnce();
  });

  it('@feature:ai.contextual rejects missing and other-owner jobs', async () => {
    expect((await call('/api/ace/status')).status).toBe(400);
    expect(mocks.aceJob).not.toHaveBeenCalled();
    mocks.aceJob.mockReturnValue({ jobId: 'fixture-job', userId: '43' });
    const response = await call('/api/ace/status', { query: '?jobId=fixture-job' });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'Job not found' });
  });

  it('@feature:ai.analysis reports fixture sidecar and process status', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    mocks.vlm.mockResolvedValue('fixture-vlm');
    mocks.system.mockReturnValue('tcp fixture LISTENING 4242');
    const response = await call('/api/vlm/status');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: 'fixture-vlm', turboQuant: { healthy: true, pid: 4242 } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('@feature:ai.recommendations reads a caller-scoped fixture cache', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify({ topicPreferences: ['fixture'] }));
    mocks.redis.mockReturnValue({ get });
    const response = await call('/api/recommendations');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { topicPreferences: ['fixture'] }, metadata: { cache: 'hit' } });
    expect(get).toHaveBeenCalledWith('user:rec:42');
  });

  it('@feature:poi.directory scopes both list and count to the caller or shared rows', async () => {
    const list = readQuery([{ id: 1, name: 'Fixture person' }]);
    const count = readQuery([{ count: 1 }]);
    mocks.select.mockReturnValueOnce(list).mockReturnValueOnce(count);
    const response = await call('/api/persons-of-interest');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ persons: [{ id: 1 }], total: 1, page: 1 });
    expect(whereSql(list)).toEqual(whereSql(count));
    expect(whereSql(list).sql).toMatch(/"created_by" = \$1.*"created_by" is null/i);
    expect(whereSql(list).params).toEqual([42]);
  });

  it('@feature:reports.builder scopes the list to the caller', async () => {
    const query = readQuery([{ id: 1, title: 'Fixture report' }]);
    mocks.select.mockReturnValueOnce(query);
    const response = await call('/api/reports');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [{ id: 1, title: 'Fixture report' }] });
    expect(whereSql(query).sql).toMatch(/"created_by" = \$1/);
    expect(whereSql(query).params).toEqual([42]);
  });

  it('@feature:search.hybrid returns a fixture hit and captures analytics through a stub', async () => {
    mocks.cacheGet.mockResolvedValue({ results: [{ id: 'fixture-hit', entityType: 'document' }], timings: { cacheAge: 2 } });
    const response = await call('/api/search', { query: '?q=fixture' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ query: 'fixture', totalResults: 1, timing: { semanticCacheHit: true } });
    expect(mocks.analytics).toHaveBeenCalledWith({ query: 'fixture', pipeline: 'rag', cacheHit: true, userId: '42' });
    expect(mocks.cachePut).not.toHaveBeenCalled();
  });

  it('@feature:admin.error_brain aggregates the fixture error rows by route', async () => {
    mocks.execute.mockResolvedValue([{ file_path: '/api/reports', count: '2' }, { file_path: '/api/reports', count: '3' }]);
    const response = await call('/api/errors/summary');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ total: 5, byRoute: { '/api/reports': 5 } });
  });

  it('@feature:ai.chat replays HTTP_INTERNAL_ERROR from a controlled 503 runtime failure', async () => {
    async function replay(runId: string) {
      mocks.model.mockRejectedValueOnce(new Error('fixture runtime failure'));
      const route = '/api/llm/runtime-status';
      const response = await call(route);
      const refusal = await call(route, { user: false });
      expect(response.status).toBe(503);
      expect(refusal.status).toBe(401);
      return groupIssuesWithAudit([
        { source: 'http', run_id: runId, feature_label: 'ai.chat', route, status: response.status },
        { source: 'http', run_id: runId, feature_label: 'ai.chat', route, status: refusal.status, expected_status: 401 },
      ]);
    }
    const first = await replay('fixture-run-1');
    const second = await replay('fixture-run-2');
    expect(first.issues).toHaveLength(1);
    expect(second.issues).toHaveLength(1);
    expect(first.issues[0]).toMatchObject({ feature_label: 'ai.chat', error_code: 'HTTP_INTERNAL_ERROR', severity: 'P1', occurrences: 1 });
    expect(second.issues[0].fingerprint).toBe(first.issues[0].fingerprint);
    expect(first.suppressedEvents).toHaveLength(1);
    expect(second.suppressedEvents).toHaveLength(1);
  });
});
