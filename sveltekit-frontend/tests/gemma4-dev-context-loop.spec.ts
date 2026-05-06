// @vitest-environment node
/**
 * gemma4-dev-context-loop.spec.ts
 *
 * Unit tests for the Step 5B dev context planning loop.
 * All external I/O (MCP dispatch, KV packet builder, trace recorder) is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted so vi.mock factories can reference them) ───────────────────

const mocks = vi.hoisted(() => ({
  dispatchToolCall:      vi.fn(),
  buildKvContextPacket:  vi.fn(),
  getStablePrefixHash:   vi.fn(() => 'stable-hash-xyz'),
  recordAgentAction:     vi.fn(),
}));

vi.mock('$lib/server/ai/gemma4-tool-controller.js', () => ({
  dispatchToolCall:    mocks.dispatchToolCall,
  validateToolName:    (name: string) => ({ valid: true }),
  ALLOWED_MCP_TOOLS:   new Set([
    'search.dev_context', 'trace.explain_retrieval',
    'context.build_kv_packet', 'workspace.timeline',
  ]),
}));

vi.mock('$lib/server/ai/kv-context-controller.js', () => ({
  buildKvContextPacket: mocks.buildKvContextPacket,
  getStablePrefixHash:  mocks.getStablePrefixHash,
}));

vi.mock('$lib/server/trace/trace-collector.js', () => ({
  recordAgentAction: mocks.recordAgentAction,
}));

vi.mock('$lib/server/db/client', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  db:   {},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDevCtxResult(hits: Array<{
  stable_key?: string;
  file_path?:  string;
  content?:    string;
  score?:      number;
  topo_class?: string;
}>) {
  return {
    result: {
      tool: 'search.dev_context',
      success: true,
      data: hits,
      meta: { durationMs: 10 },
    },
    fromServer: false,
  };
}

function makeExplainResult(data: Record<string, unknown> | null) {
  return {
    result: {
      tool: 'trace.explain_retrieval',
      success: data !== null,
      data,
      meta: { durationMs: 5 },
    },
    fromServer: false,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dev-context-planner — isCodingPrompt', () => {
  it('classifies coding/debugging queries correctly', async () => {
    const { isCodingPrompt } = await import('$lib/server/ai/dev-context-planner.js');
    expect(isCodingPrompt('how do I fix the TypeScript error in my component?')).toBe(true);
    expect(isCodingPrompt('implement a new route endpoint for auth')).toBe(true);
    expect(isCodingPrompt('what is the capital of France?')).toBe(false);
    expect(isCodingPrompt('tell me about the legal system')).toBe(false);
  });
});

describe('dev-context-planner — extractDevContextHits', () => {
  it('extracts stableKeys, filePaths, hitCount, and sourceTypes from result data', async () => {
    const { extractDevContextHits } = await import('$lib/server/ai/dev-context-planner.js');
    const result = {
      tool: 'search.dev_context', success: true,
      data: [
        { stable_key: 'sk:a', file_path: 'src/a.ts', score: 0.9, topo_class: 'server' },
        { stable_key: 'sk:b', file_path: 'src/b.ts', score: 0.8, topo_class: 'server' },
        { stable_key: 'sk:c', file_path: 'src/b.ts', score: 0.3, topo_class: 'route'  },
      ],
    };
    const hits = extractDevContextHits(result);
    expect(hits.stableKeys).toEqual(['sk:a', 'sk:b', 'sk:c']);
    expect(hits.filePaths).toEqual(['src/a.ts', 'src/b.ts']); // deduplicated
    expect(hits.hitCount).toBe(3);
    expect(hits.confidence).toBe('high');           // 2 hits with score > 0.7
    expect(hits.sourceTypes).toContain('server');
  });

  it('returns low confidence and empty arrays for failed result', async () => {
    const { extractDevContextHits } = await import('$lib/server/ai/dev-context-planner.js');
    const hits = extractDevContextHits({ tool: 'search.dev_context', success: false, data: null });
    expect(hits.hitCount).toBe(0);
    expect(hits.confidence).toBe('low');
    expect(hits.stableKeys).toHaveLength(0);
  });
});

describe('dev-context-planner — needsExplanation', () => {
  it('returns true when hitCount > 5', async () => {
    const { needsExplanation } = await import('$lib/server/ai/dev-context-planner.js');
    expect(needsExplanation({
      stableKeys: [], filePaths: [], hitCount: 6,
      confidence: 'medium', hasExplanation: false, sourceTypes: ['server'],
    })).toBe(true);
  });

  it('returns true when confidence is low', async () => {
    const { needsExplanation } = await import('$lib/server/ai/dev-context-planner.js');
    expect(needsExplanation({
      stableKeys: [], filePaths: [], hitCount: 1,
      confidence: 'low', hasExplanation: false, sourceTypes: [],
    })).toBe(true);
  });

  it('returns true when more than 2 source types (mixed sources)', async () => {
    const { needsExplanation } = await import('$lib/server/ai/dev-context-planner.js');
    expect(needsExplanation({
      stableKeys: [], filePaths: [], hitCount: 3,
      confidence: 'medium', hasExplanation: false, sourceTypes: ['server', 'route', 'store'],
    })).toBe(true);
  });

  it('returns false for clean unambiguous results', async () => {
    const { needsExplanation } = await import('$lib/server/ai/dev-context-planner.js');
    expect(needsExplanation({
      stableKeys: ['sk:a', 'sk:b'], filePaths: ['a.ts', 'b.ts'], hitCount: 2,
      confidence: 'high', hasExplanation: false, sourceTypes: ['server'],
    })).toBe(false);
  });
});

describe('dev-context-planner — buildDevContextPlan', () => {
  beforeEach(() => {
    mocks.dispatchToolCall.mockReset();
    mocks.buildKvContextPacket.mockReset();
    mocks.recordAgentAction.mockReset();
    mocks.getStablePrefixHash.mockReturnValue('stable-hash-xyz');
  });

  it('calls search.dev_context first and returns plan with selectedStableKeys', async () => {
    mocks.dispatchToolCall.mockResolvedValue(makeDevCtxResult([
      { stable_key: 'sk:auth', file_path: 'src/auth.ts', score: 0.85 },
      { stable_key: 'sk:session', file_path: 'src/session.ts', score: 0.8 },
    ]));
    mocks.buildKvContextPacket.mockResolvedValue({
      taskId: 'dev-abc123', stablePrefixHash: 'stable-hash-xyz',
    });

    const { buildDevContextPlan } = await import('$lib/server/ai/dev-context-planner.js');
    const plan = await buildDevContextPlan('fix the authentication error in the component');

    expect(mocks.dispatchToolCall).toHaveBeenCalledWith('search.dev_context', expect.objectContaining({ query: expect.stringContaining('authentication') }));
    expect(plan.selectedStableKeys).toContain('sk:auth');
    expect(plan.selectedFiles).toContain('src/auth.ts');
    expect(plan.contextHitCount).toBe(2);
    expect(plan.toolsUsed[0]).toBe('search.dev_context');
  });

  it('calls trace.explain_retrieval when hitCount > 5', async () => {
    mocks.dispatchToolCall
      .mockResolvedValueOnce(makeDevCtxResult(
        Array.from({ length: 7 }, (_, i) => ({
          stable_key: `sk:${i}`, file_path: `src/file${i}.ts`, score: 0.5,
        })),
      ))
      .mockResolvedValueOnce(makeExplainResult({ query: 'auth fix', sources: ['qdrant', 'postgres'] }));

    const { buildDevContextPlan } = await import('$lib/server/ai/dev-context-planner.js');
    const plan = await buildDevContextPlan('debug the module import error');

    expect(plan.explainRetrievalCalled).toBe(true);
    expect(plan.toolsUsed).toContain('trace.explain_retrieval');
  });

  it('does NOT call trace.explain_retrieval for high-confidence low-count results', async () => {
    mocks.dispatchToolCall.mockResolvedValue(makeDevCtxResult([
      { stable_key: 'sk:x', file_path: 'src/x.ts', score: 0.95, topo_class: 'server' },
    ]));
    mocks.buildKvContextPacket.mockResolvedValue({ taskId: 'dev-1', stablePrefixHash: 'h' });

    const { buildDevContextPlan } = await import('$lib/server/ai/dev-context-planner.js');
    const plan = await buildDevContextPlan('fix the TypeScript error');

    expect(plan.explainRetrievalCalled).toBe(false);
    expect(mocks.dispatchToolCall).toHaveBeenCalledTimes(1); // only search.dev_context
  });

  it('raw content in contextSummary is truncated (≤150 chars per hit line)', async () => {
    const longContent = 'x'.repeat(2000);
    mocks.dispatchToolCall.mockResolvedValue(makeDevCtxResult([
      { stable_key: 'sk:big', file_path: 'src/big.ts', content: longContent, score: 0.9 },
    ]));
    mocks.buildKvContextPacket.mockResolvedValue({ taskId: 'dev-2', stablePrefixHash: 'h2' });

    const { buildDevContextPlan } = await import('$lib/server/ai/dev-context-planner.js');
    const plan = await buildDevContextPlan('implement a new API route');

    // contextSummary must not contain the 2000-char raw content
    expect(plan.contextSummary.length).toBeLessThan(1500);
    expect(plan.contextSummary).not.toContain(longContent);
  });

  it('returns a timelineEvent with correct shape', async () => {
    mocks.dispatchToolCall.mockResolvedValue(makeDevCtxResult([
      { stable_key: 'sk:z', file_path: 'src/z.ts', score: 0.8 },
    ]));
    mocks.buildKvContextPacket.mockResolvedValue({ taskId: 'dev-3', stablePrefixHash: 'h3' });

    const { buildDevContextPlan } = await import('$lib/server/ai/dev-context-planner.js');
    const plan = await buildDevContextPlan('debug the server route', { priorAnswerKey: 'query:abc' });

    expect(plan.timelineEvent.query).toContain('debug');
    expect(plan.timelineEvent.toolsUsed).toContain('search.dev_context');
    expect(plan.timelineEvent.priorAnswerKeyUsed).toBe(true);
    expect(plan.timelineEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('write tools are not callable (validateToolName blocks them)', async () => {
    // This tests the allowlist enforced by dispatchToolCall; here we verify
    // buildDevContextPlan never attempts to dispatch a write tool name.
    mocks.dispatchToolCall.mockResolvedValue(makeDevCtxResult([]));

    const { buildDevContextPlan } = await import('$lib/server/ai/dev-context-planner.js');
    await buildDevContextPlan('implement an auth module');

    const calledTools = mocks.dispatchToolCall.mock.calls.map(([name]: [string]) => name);
    const WRITE_PATTERNS = ['upsert', 'write', 'delete', 'set', 'migration', 'patch'];
    for (const tool of calledTools) {
      expect(WRITE_PATTERNS.some(p => tool.toLowerCase().includes(p))).toBe(false);
    }
  });
});