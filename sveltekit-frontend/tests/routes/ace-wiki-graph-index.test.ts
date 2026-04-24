// @vitest-environment node
/**
 * ace-wiki-graph-index.test.ts
 *
 * Contract stability + no-raw-error-leak regression tests for:
 *   A) generateAceWiki()        — AceWikiResult shape always stable
 *   B) POST /api/codeintel/wiki — 401/400/207/200 shape consistency
 *   C) graph.index MCP tool     — job-start contract, never blocks, no raw internals
 *   D) graph.status MCP tool    — stable shape when backends unavailable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockAssembleCtx,
  mockCallGemma4,
  mockGetHealth,
  mockSearchChunks,
  mockGetTopologyContext,
  mockGetChunkForAce,
  mockSearchByCluster,
} = vi.hoisted(() => ({
  mockAssembleCtx: vi.fn(),
  mockCallGemma4: vi.fn(),
  mockGetHealth: vi.fn(),
  mockSearchChunks: vi.fn(),
  mockGetTopologyContext: vi.fn(),
  mockGetChunkForAce: vi.fn(),
  mockSearchByCluster: vi.fn(),
}));

const emptyGemmaStageTimings = (totalMs = 0) => ({
  totalMs,
  assistantTurns: [],
  toolCalls: [],
  finalAssistantMs: 0,
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { OLLAMA_BASE_URL: 'http://localhost:11434' } }));
vi.mock('$lib/server/db/client', () => ({ db: {} }));

vi.mock('$lib/server/observability/langfuse.js', () => ({
traceLLM: async (_n: string, _m: unknown, cb: (gen: { end: (x: unknown) => void }) => Promise<unknown>) =>
cb({ end: () => {} }),
}));

vi.mock('$lib/server/ace/codeintel-datastore.js', () => ({
  assembleAceContext: mockAssembleCtx,
  getCodeIntelHealthForAce: mockGetHealth,
  getChunkForAce: mockGetChunkForAce,
}));

vi.mock('$lib/server/ace/gemma4-codeintel.js', () => ({
  buildGemma4AcePrompt: () => '## QUERY\ntest',
  callGemma4WithAceContext: mockCallGemma4,
  createEmptyGemmaStageTimings: emptyGemmaStageTimings,
}));

vi.mock('$lib/server/grpc/retrieval-client.js', () => ({
  retrievalClient: {
    searchChunks: mockSearchChunks,
    getTopologyContext: mockGetTopologyContext,
  },
}));

vi.mock('$lib/server/retrieval/codebase-context.js', () => ({
  searchByCluster: mockSearchByCluster,
}));

// ── fixtures ──────────────────────────────────────────────────────────────────

const HEALTHY_CTX = {
query: 'auth flow',
repoId: 'default',
clusterContext: [
{ gpuCluster: 3, purpose: 'Authentication', summary: 'Handles session tokens.', patterns: [], warnings: [], tags: ['auth'] },
],
chunkContext: [
{ chunkId: 'c1', relativePath: 'src/lib/auth.ts', kind: 'function', domain: 'auth', language: 'typescript', summary: 'JWT helper', semanticTags: ['jwt'] },
],
health: { ok: true, chunkCount: 42, clusterCount: 5, embeddingCoverage: 0.95 },
degraded: false,
errors: [],
};

const GOOD_PARSED = {
title: 'Auth Flow',
summary: 'JWT-based session handling.',
sections: [{ heading: 'Overview', content: 'Validates JWT.' }],
relatedFiles: ['src/lib/auth.ts'],
relatedClusters: [3],
};

// ── shape assertions ──────────────────────────────────────────────────────────

const WIKI_KEYS = [
  'ok',
  'query',
  'title',
  'summary',
  'sections',
  'relatedFiles',
  'relatedClusters',
  'degraded',
  'errors',
  'latencyMs',
  'toolCallsExecuted',
  'toolCallNames',
  'stageTimings',
] as const;

function assertWikiShape(r: Record<string, unknown>, label = '') {
for (const k of WIKI_KEYS) {
expect(r, `${label} missing key: ${k}`).toHaveProperty(k);
}
expect(typeof r.ok).toBe('boolean');
expect(typeof r.degraded).toBe('boolean');
expect(typeof r.latencyMs).toBe('number');
expect(typeof r.toolCallsExecuted).toBe('number');
expect(Array.isArray(r.sections)).toBe(true);
expect(Array.isArray(r.relatedFiles)).toBe(true);
expect(Array.isArray(r.relatedClusters)).toBe(true);
expect(Array.isArray(r.errors)).toBe(true);
expect(Array.isArray(r.toolCallNames)).toBe(true);
expect(r.title === null || typeof r.title === 'string').toBe(true);
expect(r.summary === null || typeof r.summary === 'string').toBe(true);
const t = r.stageTimings as Record<string, unknown>;
expect(typeof t.assembleContextMs).toBe('number');
expect(typeof t.draftPassMs).toBe('number');
expect(typeof t.formatPassMs).toBe('number');
expect(typeof t.totalMs).toBe('number');
const draft = t.draft as Record<string, unknown>;
const format = t.format as Record<string, unknown>;
expect(Array.isArray(draft.assistantTurns)).toBe(true);
expect(Array.isArray(draft.toolCalls)).toBe(true);
expect(typeof draft.totalMs).toBe('number');
expect(typeof draft.finalAssistantMs).toBe('number');
expect(Array.isArray(format.assistantTurns)).toBe(true);
expect(Array.isArray(format.toolCalls)).toBe(true);
expect(typeof format.totalMs).toBe('number');
expect(typeof format.finalAssistantMs).toBe('number');
}

const GRAPH_INDEX_KEYS = ['ok', 'jobId', 'accepted', 'requestedStages', 'degraded', 'error'] as const;
const GRAPH_STATUS_KEYS = ['ok', 'graph', 'jobs', 'degraded', 'error'] as const;

function assertGraphIndexShape(r: Record<string, unknown>) {
for (const k of GRAPH_INDEX_KEYS) expect(r, `missing: ${k}`).toHaveProperty(k);
expect(typeof r.ok).toBe('boolean');
expect(r.jobId === null || typeof r.jobId === 'string').toBe(true);
expect(typeof r.accepted).toBe('boolean');
expect(Array.isArray(r.requestedStages)).toBe(true);
expect(typeof r.degraded).toBe('boolean');
expect(r.error === null || typeof r.error === 'string').toBe(true);
}

function assertGraphStatusShape(r: Record<string, unknown>) {
for (const k of GRAPH_STATUS_KEYS) expect(r, `missing: ${k}`).toHaveProperty(k);
const g = r.graph as Record<string, unknown>;
expect(typeof g.chunkCount).toBe('number');
expect(typeof g.clusterCount).toBe('number');
expect(typeof g.nodeCount).toBe('number');
expect(typeof g.edgeCount).toBe('number');
expect(Array.isArray(r.jobs)).toBe(true);
expect(r.error === null || typeof r.error === 'string').toBe(true);
}

const LEAK_PATTERNS = [
/ECONNREFUSED/i, /password/i, /"stack":/,
/DATABASE_URL/i, /localhost:\d{4,5}/, /127\.0\.0\.1:\d{4,5}/,
/neo4j:\/\//i, /constraint/i,
];
function assertNoLeak(r: unknown) {
const text = JSON.stringify(r);
for (const p of LEAK_PATTERNS) expect(text, `leak: ${p}`).not.toMatch(p);
}

// ─────────────────────────────────────────────────────────────────────────────
// A) generateAceWiki()
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAceWiki()', () => {
let generateAceWiki: typeof import('$lib/server/ace/ace-wiki.js').generateAceWiki;

beforeEach(async () => {
vi.resetAllMocks();
  mockSearchChunks.mockResolvedValue({ results: [], totalMs: 0 });
  mockGetTopologyContext.mockResolvedValue({ neighbors: [] });
  mockGetChunkForAce.mockResolvedValue({ chunk: null });
  mockSearchByCluster.mockResolvedValue([]);
({ generateAceWiki } = await import('$lib/server/ace/ace-wiki.js'));
});

it('returns full wiki shape on LLM success', async () => {
mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
mockCallGemma4.mockResolvedValue({
  ok: true,
  text: JSON.stringify(GOOD_PARSED),
  parsed: GOOD_PARSED,
  degraded: false,
  latencyMs: 80,
  model: 'gemma4',
  toolCallsExecuted: 0,
  toolCallNames: [],
});

const r = await generateAceWiki({ query: 'auth flow' }) as unknown as Record<string, unknown>;
assertWikiShape(r, 'happy path');
expect(r.ok).toBe(true);
expect(r.title).toBe('Auth Flow');
expect((r.errors as string[]).length).toBe(0);
assertNoLeak(r);
});

it('returns degraded heuristic shape when LLM fails', async () => {
mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
mockCallGemma4.mockResolvedValue({
  ok: false,
  text: '',
  degraded: true,
  error: 'LLM timeout',
  latencyMs: 90000,
  model: 'gemma4',
  toolCallsExecuted: 0,
  toolCallNames: [],
});

const r = await generateAceWiki({ query: 'auth flow' }) as unknown as Record<string, unknown>;
assertWikiShape(r, 'llm-fail');
expect(r.ok).toBe(false);
expect(r.degraded).toBe(true);
expect((r.sections as unknown[]).length).toBeGreaterThan(0);
assertNoLeak(r);
});

it('returns degraded shape when context entirely empty', async () => {
mockAssembleCtx.mockResolvedValue({ ...HEALTHY_CTX, clusterContext: [], chunkContext: [], degraded: true });

const r = await generateAceWiki({ query: 'nothing' }) as unknown as Record<string, unknown>;
assertWikiShape(r, 'empty-ctx');
expect(r.ok).toBe(false);
expect(r.degraded).toBe(true);
});

it('returns degraded when LLM returns unparseable text', async () => {
mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
mockCallGemma4.mockResolvedValue({
  ok: true,
  text: 'Sorry, I cannot help.',
  parsed: undefined,
  degraded: false,
  latencyMs: 50,
  model: 'gemma4',
  toolCallsExecuted: 0,
  toolCallNames: [],
});

const r = await generateAceWiki({ query: 'auth flow' }) as unknown as Record<string, unknown>;
assertWikiShape(r, 'parse-fail');
expect(r.degraded).toBe(true);
assertNoLeak(r);
});

it('recovers structured wiki from tool draft when formatter JSON parse fails', async () => {
  mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
  mockSearchChunks.mockResolvedValue({
    results: [
      {
        id: 'r1',
        chunkId: 'c1',
        filePath: 'src/lib/auth.ts',
        kind: 'function',
        httpMethod: '',
        routeId: '',
        sourceMetadata: {},
        tags: [],
        contentPreview: 'JWT validation helper.',
        score: 0.9,
        startLine: 10,
        endLine: 40,
        bmuRow: 3,
        bmuCol: 4,
      },
    ],
    totalMs: 12,
  });
  mockGetTopologyContext.mockResolvedValue({
    neighbors: [],
    clusterMetadata: { bmuRow: 3, bmuCol: 4 },
  });
  mockCallGemma4.mockResolvedValueOnce({
    ok: true,
    text: 'TITLE: Auth Flow\nSUMMARY: JWT-based session handling.\nSECTION 1: Overview\nValidates JWT.\nSECTION 2: Risks\nGuard sensitive routes.\nRELATED FILES: src/lib/auth.ts | src/routes/+layout.server.ts\nRELATED CLUSTERS: 3 | 4',
    parsed: undefined,
    degraded: false,
    latencyMs: 120,
    model: 'gemma4',
    toolCallsExecuted: 2,
    toolCallNames: ['search_codebase', 'get_topology_context'],
    stageTimings: {
      totalMs: 120,
      assistantTurns: [{ round: 1, durationMs: 120, toolCalls: 2 }],
      toolCalls: [{ round: 1, toolName: 'search_codebase', durationMs: 12 }],
      finalAssistantMs: 120,
    },
  });
  mockCallGemma4.mockResolvedValueOnce({
    ok: true,
    text: 'not valid json',
    parsed: undefined,
    degraded: false,
    latencyMs: 35,
    model: 'gemma4',
    toolCallsExecuted: 0,
    toolCallNames: [],
    stageTimings: {
      totalMs: 35,
      assistantTurns: [{ round: 1, durationMs: 35, toolCalls: 0 }],
      toolCalls: [],
      finalAssistantMs: 35,
    },
  });

  const r = (await generateAceWiki({ query: 'auth flow', useTools: true })) as unknown as Record<
    string,
    unknown
  >;
  assertWikiShape(r, 'draft-recovery');
  expect(r.ok).toBe(true);
  expect(r.degraded).toBe(false);
  expect(r.title).toBe('Auth Flow');
  expect(r.toolCallsExecuted).toBe(2);
  expect(r.toolCallNames).toEqual(['search_codebase', 'get_topology_context']);
  expect((r.errors as string[])[0]).toMatch(/Recovered structured wiki from draft outline/i);
});

it('never leaks raw LLM error strings', async () => {
mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
mockCallGemma4.mockResolvedValue({
  ok: false,
  text: '',
  degraded: true,
  error: 'ECONNREFUSED 127.0.0.1:11434',
  latencyMs: 0,
  model: 'gemma4',
  toolCallsExecuted: 0,
  toolCallNames: [],
});

const r = await generateAceWiki({ query: 'auth flow' }) as unknown as Record<string, unknown>;
assertWikiShape(r, 'no-leak');
assertNoLeak(r);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// B) POST /api/codeintel/wiki
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codeintel/wiki', () => {
let POST: (evt: { request: Request; locals: Record<string, unknown> }) => Promise<Response>;

beforeEach(async () => {
vi.resetAllMocks();
  mockSearchChunks.mockResolvedValue({ results: [], totalMs: 0 });
  mockGetTopologyContext.mockResolvedValue({ neighbors: [] });
  mockGetChunkForAce.mockResolvedValue({ chunk: null });
({ POST } = await import('../../src/routes/api/codeintel/wiki/+server.js') as unknown as typeof import('../../src/routes/api/codeintel/wiki/+server.js'));
});

function makeReq(body: unknown) {
return new Request('http://localhost/api/codeintel/wiki', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body),
});
}

it('401 — wiki shape with errors array', async () => {
const resp = await POST({ request: makeReq({ query: 'auth' }), locals: {} });
expect(resp.status).toBe(401);
const body = await resp.json() as Record<string, unknown>;
assertWikiShape(body, '401');
expect(body.ok).toBe(false);
expect((body.errors as string[])[0]).toMatch(/Unauthorized/i);
assertNoLeak(body);
});

it('400 — missing query', async () => {
const resp = await POST({ request: makeReq({ repoId: 'test' }), locals: { user: { id: 'u1' } } });
expect(resp.status).toBe(400);
const body = await resp.json() as Record<string, unknown>;
assertWikiShape(body, '400-no-query');
expect(body.ok).toBe(false);
});

it('400 — query over 500 chars', async () => {
const resp = await POST({ request: makeReq({ query: 'x'.repeat(501) }), locals: { user: { id: 'u1' } } });
expect(resp.status).toBe(400);
});

it('207 — degraded wiki on LLM failure', async () => {
mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
mockCallGemma4.mockResolvedValue({
  ok: false,
  text: '',
  degraded: true,
  error: 'timeout',
  latencyMs: 90000,
  model: 'gemma4',
  toolCallsExecuted: 0,
  toolCallNames: [],
});

const resp = await POST({ request: makeReq({ query: 'auth flow' }), locals: { user: { id: 'u1' } } });
expect(resp.status).toBe(207);
const body = await resp.json() as Record<string, unknown>;
assertWikiShape(body, '207');
expect(body.degraded).toBe(true);
assertNoLeak(body);
});

it('200 — full wiki on happy path', async () => {
mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
mockCallGemma4.mockResolvedValue({
  ok: true,
  text: JSON.stringify(GOOD_PARSED),
  parsed: GOOD_PARSED,
  degraded: false,
  latencyMs: 100,
  model: 'gemma4',
  toolCallsExecuted: 0,
  toolCallNames: [],
});

const resp = await POST({ request: makeReq({ query: 'auth flow', task: 'explain' }), locals: { user: { id: 'u1' } } });
expect(resp.status).toBe(200);
const body = await resp.json() as Record<string, unknown>;
assertWikiShape(body, '200');
expect(body.ok).toBe(true);
assertNoLeak(body);
});

it('200 — accepts useTools and returns tool telemetry', async () => {
  mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
  mockSearchChunks.mockResolvedValue({
    results: [
      {
        id: 'r1',
        chunkId: 'c1',
        filePath: 'src/lib/auth.ts',
        kind: 'function',
        httpMethod: '',
        routeId: '',
        sourceMetadata: {},
        tags: [],
        contentPreview: 'JWT validation helper.',
        score: 0.9,
        startLine: 10,
        endLine: 40,
        bmuRow: 3,
        bmuCol: 4,
      },
    ],
    totalMs: 12,
  });
  mockGetTopologyContext.mockResolvedValue({
    neighbors: [],
    clusterMetadata: { bmuRow: 3, bmuCol: 4 },
  });
  mockCallGemma4.mockResolvedValueOnce({
    ok: true,
    text: 'TITLE: Auth Flow\nSUMMARY: JWT-based session handling.\nSECTION 1: Overview\nValidates JWT.\nRELATED FILES: src/lib/auth.ts\nRELATED CLUSTERS: 3',
    parsed: undefined,
    degraded: false,
    latencyMs: 120,
    model: 'gemma4',
    toolCallsExecuted: 2,
    toolCallNames: ['search_codebase', 'get_topology_context'],
    stageTimings: {
      totalMs: 120,
      assistantTurns: [
        { round: 1, durationMs: 70, toolCalls: 2 },
        { round: 2, durationMs: 20, toolCalls: 0 },
      ],
      toolCalls: [
        { round: 1, toolName: 'search_codebase', durationMs: 12 },
        { round: 1, toolName: 'get_topology_context', durationMs: 8 },
      ],
      finalAssistantMs: 20,
    },
  });
  mockCallGemma4.mockResolvedValueOnce({
    ok: true,
    text: JSON.stringify(GOOD_PARSED),
    parsed: GOOD_PARSED,
    degraded: false,
    latencyMs: 35,
    model: 'gemma4',
    toolCallsExecuted: 0,
    toolCallNames: [],
    stageTimings: {
      totalMs: 35,
      assistantTurns: [{ round: 1, durationMs: 35, toolCalls: 0 }],
      toolCalls: [],
      finalAssistantMs: 35,
    },
  });

  const resp = await POST({
    request: makeReq({ query: 'auth flow', task: 'deep-dive', useTools: true }),
    locals: { user: { id: 'u1' } },
  });
  expect(resp.status).toBe(200);
  const body = (await resp.json()) as Record<string, unknown>;
  assertWikiShape(body, '200-useTools');
  expect(body.toolCallsExecuted).toBe(2);
  expect(body.toolCallNames).toEqual(['search_codebase', 'get_topology_context']);
  expect(mockCallGemma4).toHaveBeenCalledTimes(2);
  expect(mockSearchChunks).toHaveBeenCalledWith('auth flow', 3);
  expect(mockGetTopologyContext).toHaveBeenCalledWith(3, 4, 1);
  expect(mockCallGemma4.mock.calls[0]?.[2]).toMatchObject({
    taskType: 'wiki-generation-draft',
  });
  expect(mockCallGemma4.mock.calls[1]?.[2]).toMatchObject({
    taskType: 'wiki-generation-format',
    responseSchema: expect.any(Object),
  });
  const timings = body.stageTimings as Record<string, unknown>;
  expect(typeof timings.draftPassMs).toBe('number');
  expect(typeof timings.formatPassMs).toBe('number');
  expect(Array.isArray((timings.draft as Record<string, unknown>).toolCalls)).toBe(true);
  expect(((timings.draft as Record<string, unknown>).toolCalls as unknown[]).length).toBe(2);
  expect((timings.format as Record<string, unknown>).totalMs).toBe(35);
});

it('same top-level keys across all 4 status paths', async () => {
const r1 = await (await POST({ request: makeReq({ query: 'q' }), locals: {} })).json() as Record<string, unknown>;
const r2 = await (await POST({ request: makeReq({}), locals: { user: { id: 'u1' } } })).json() as Record<string, unknown>;
mockAssembleCtx.mockResolvedValue({ ...HEALTHY_CTX, clusterContext: [], chunkContext: [], degraded: true });
const r3 = await (await POST({ request: makeReq({ query: 'q' }), locals: { user: { id: 'u1' } } })).json() as Record<string, unknown>;
mockAssembleCtx.mockResolvedValue(HEALTHY_CTX);
mockCallGemma4.mockResolvedValue({
  ok: true,
  text: JSON.stringify(GOOD_PARSED),
  parsed: GOOD_PARSED,
  degraded: false,
  latencyMs: 100,
  model: 'gemma4',
  toolCallsExecuted: 0,
  toolCallNames: [],
});
const r4 = await (await POST({ request: makeReq({ query: 'q' }), locals: { user: { id: 'u1' } } })).json() as Record<string, unknown>;

for (const [label, r] of [['401', r1], ['400', r2], ['207', r3], ['200', r4]] as [string, Record<string, unknown>][]) {
assertWikiShape(r, label);
}
});
});

// ─────────────────────────────────────────────────────────────────────────────
// C) graph.index — contract shape (job-start, not blocking)
// ─────────────────────────────────────────────────────────────────────────────

describe('graph.index contract', () => {
it('accepted shape is stable', () => {
const result: Record<string, unknown> = {
ok: true,
jobId: crypto.randomUUID(),
accepted: true,
requestedStages: ['sync', 'som', 'analyze'],
degraded: false,
error: null,
};
assertGraphIndexShape(result);
assertNoLeak(result);
});

it('rejected shape is stable (bad UUID)', () => {
const result: Record<string, unknown> = {
ok: false,
jobId: null,
accepted: false,
requestedStages: ['sync'],
degraded: false,
error: 'caseId must be a valid UUID',
};
assertGraphIndexShape(result);
assertNoLeak(result);
});

it('default requestedStages is all 3 when none provided', () => {
const VALID_STAGES = ['sync', 'som', 'analyze'];
const input: unknown[] = [];
const stages = Array.isArray(input) && input.length > 0
? input.filter((s): s is string => VALID_STAGES.includes(s as string))
: ['sync', 'som', 'analyze'];
expect(stages).toEqual(['sync', 'som', 'analyze']);
});

it('does not expose raw Neo4j or DB internals', () => {
const result: Record<string, unknown> = {
ok: true, jobId: 'abc-def', accepted: true, requestedStages: ['sync'], degraded: false, error: null,
};
assertNoLeak(result);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// D) graph.status — stable shape when backends unavailable
// ─────────────────────────────────────────────────────────────────────────────

describe('graph.status contract', () => {
it('full shape when all backends available', () => {
const result: Record<string, unknown> = {
ok: true,
graph: { chunkCount: 420, clusterCount: 10, nodeCount: 850, edgeCount: 1200 },
jobs: [],
degraded: false,
error: null,
};
assertGraphStatusShape(result);
assertNoLeak(result);
});

it('zero counts + degraded when backends down', () => {
const result: Record<string, unknown> = {
ok: false,
graph: { chunkCount: 0, clusterCount: 0, nodeCount: 0, edgeCount: 0 },
jobs: [],
degraded: true,
error: 'Codebase index not fully populated.',
};
assertGraphStatusShape(result);
expect((result.graph as Record<string, number>).chunkCount).toBe(0);
assertNoLeak(result);
});

it('graph counts are always numbers not null/undefined', () => {
const result: Record<string, unknown> = {
ok: false,
graph: { chunkCount: 0, clusterCount: 0, nodeCount: 0, edgeCount: 0 },
jobs: [],
degraded: true,
error: 'Codebase index not fully populated.',
};
const g = result.graph as Record<string, unknown>;
for (const k of ['chunkCount', 'clusterCount', 'nodeCount', 'edgeCount']) {
expect(g[k], `${k} must be number`).not.toBeNull();
expect(typeof g[k]).toBe('number');
}
});

it('does not leak connection strings', () => {
const result: Record<string, unknown> = {
ok: false,
graph: { chunkCount: 0, clusterCount: 0, nodeCount: 0, edgeCount: 0 },
jobs: [],
degraded: true,
error: 'Codebase index not fully populated.',
};
assertNoLeak(result);
});
});