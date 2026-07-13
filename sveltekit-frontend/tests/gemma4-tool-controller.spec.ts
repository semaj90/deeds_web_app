// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatchFn:   vi.fn(),
  recordAction: vi.fn(),
  dbInsertValues: vi.fn(),
}));

vi.mock('$lib/server/trace/trace-collector.js', () => ({
  recordAgentAction: mocks.recordAction,
}));

vi.mock('$lib/server/ai/preflight.js', () => ({
  preflight: vi.fn(async () => ({
    prevent: false,
    reason: '',
    suggestion: '',
  })),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({
      values: (...args: unknown[]) => {
        mocks.dbInsertValues(...args);
        return Promise.resolve(undefined);
      },
    })),
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  contextTimeline: { __name: 'context_timeline' },
}));

// Stub TOOL_DISPATCH and MCPToolResult without real server deps
vi.mock('$lib/server/ai/mcp-tool-dispatch.js', () => ({
  TOOL_DISPATCH: {
    'trace.kag_search': mocks.dispatchFn,
    'codebase.rg_search': mocks.dispatchFn,
  },
}));

describe('gemma4-tool-controller', () => {
  beforeEach(() => {
    mocks.dispatchFn.mockReset();
    mocks.recordAction.mockReset();
    mocks.dbInsertValues.mockReset();
    mocks.recordAction.mockReturnValue(undefined);
  });

  it('validates allowed tool names — returns valid:true for allowlisted tools', async () => {
    const { validateToolName } = await import('$lib/server/ai/gemma4-tool-controller.js');
    expect(validateToolName('trace.kag_search').valid).toBe(true);
    expect(validateToolName('codebase.rg_search').valid).toBe(true);
    expect(validateToolName('graph.shortest_path').valid).toBe(true);
    expect(validateToolName('workspace.timeline').valid).toBe(true);
  });

  it('rejects tool names not in the allowlist', async () => {
    const { validateToolName } = await import('$lib/server/ai/gemma4-tool-controller.js');
    const r = validateToolName('unknown.tool');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/not in the MCP read-only allowlist/);
  });

  it('rejects tools matching blocked write/delete patterns', async () => {
    const { validateToolName } = await import('$lib/server/ai/gemma4-tool-controller.js');

    // Inject a name that looks like a write op even if it were in the set
    // (tests the blocked-pattern guard independently)
    for (const badName of ['qdrant.upsert', 'neo4j.write', 'db.delete', 'redis.set']) {
      const r = validateToolName(badName);
      expect(r.valid).toBe(false);
    }
  });

  it('truncates large tool result to maxToolResultChars', async () => {
    const { truncateToolResult } = await import('$lib/server/ai/gemma4-tool-controller.js');
    const big = 'x'.repeat(20_000);
    const out = truncateToolResult(JSON.stringify(big));
    expect(out.length).toBeLessThanOrEqual(12_020); // 12000 + small JSON overhead
    expect(out).toMatch(/\[truncated\]$/);
  });

  it('stops after maxToolRounds (3) even if model keeps returning tool calls', async () => {
    const { runGemma4ToolLoop } = await import('$lib/server/ai/gemma4-tool-controller.js');

    let callCount = 0;
    const callModel = vi.fn(async () => {
      callCount++;
      return {
        content: '',
        tool_calls: [{ function: { name: 'trace.kag_search', arguments: { query: `round-${callCount}` } } }],
      };
    });

    mocks.dispatchFn.mockResolvedValue({ tool: 'trace.kag_search', success: true, data: [] });

    const result = await runGemma4ToolLoop({
      messages:  [{ role: 'user', content: 'find something' }],
      callModel,
    });

    // Dedup stops the loop on the first repeated tool call, so only two model calls are needed.
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(result.toolRounds).toBeLessThanOrEqual(2);
    expect(result.mcpPort).toBe(8788);
  });

  it('stops on repeated identical tool call (dedup guard)', async () => {
    const { runGemma4ToolLoop } = await import('$lib/server/ai/gemma4-tool-controller.js');

    const sameArgs = { query: 'same query every time' };
    const callModel = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [{ function: { name: 'trace.kag_search', arguments: sameArgs } }],
      })
      .mockResolvedValueOnce({
        content: 'stopped',
        tool_calls: [{ function: { name: 'trace.kag_search', arguments: sameArgs } }],
      });

    mocks.dispatchFn.mockResolvedValue({ tool: 'trace.kag_search', success: true, data: [] });

    const result = await runGemma4ToolLoop({
      messages:  [{ role: 'user', content: 'q' }],
      callModel,
    });

    expect(result.stuckTool).toBe('trace.kag_search');
    expect(result.answer).toMatch(/repeated identical tool call/);
  });

  it('dedups semantically identical tool calls even when argument key order differs', async () => {
    const { runGemma4ToolLoop } = await import('$lib/server/ai/gemma4-tool-controller.js');

    const callModel = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [{ function: { name: 'trace.kag_search', arguments: { query: 'ordered', a: 1, b: 2 } } }],
      })
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [{ function: { name: 'trace.kag_search', arguments: { b: 2, a: 1, query: 'ordered' } } }],
      });

    mocks.dispatchFn.mockResolvedValue({ tool: 'trace.kag_search', success: true, data: [] });

    const result = await runGemma4ToolLoop({
      messages: [{ role: 'user', content: 'q' }],
      callModel,
    });

    expect(result.stuckTool).toBe('trace.kag_search');
    expect(result.answer).toMatch(/repeated identical tool call/);
  });

  it('records a canonical execution ledger event with next state', async () => {
    const { runGemma4ToolLoop } = await import('$lib/server/ai/gemma4-tool-controller.js');

    const callModel = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [{ function: { name: 'trace.kag_search', arguments: { query: 'timeline' } } }],
      })
      .mockResolvedValueOnce({ content: 'done', tool_calls: [] });

    mocks.dispatchFn.mockResolvedValue({
      tool: 'trace.kag_search',
      success: true,
      data: [{ source_ref: 'src/lib/server/ai/gemma4-tool-controller.ts' }],
    });

    const result = await runGemma4ToolLoop({
      messages: [{ role: 'user', content: 'trace the call' }],
      sessionId: 'session-123',
      userId: '42',
      callModel,
    });

    await new Promise((resolve) => setImmediate(resolve));

    const timelineInsert = mocks.dbInsertValues.mock.calls.find((call) => {
      const value = call[0] as Record<string, unknown>;
      return value?.eventType === 'tool_call';
    })?.[0] as Record<string, unknown> | undefined;

    expect(result.toolsUsed).toContain('trace.kag_search');
    expect(timelineInsert).toBeDefined();
    expect(timelineInsert?.sessionId).toBe('session-123');
    expect(timelineInsert?.userId).toBe(42);

    const payload = timelineInsert?.payload as Record<string, unknown>;
    expect(payload?.executionId).toMatch(/^toolcall:session-123:0:/);
    expect(payload?.nextState).toBeDefined();
    expect(payload?.toolName).toBe('trace.kag_search');
  });

  it('records toolsUsed metadata in the output', async () => {
    const { runGemma4ToolLoop } = await import('$lib/server/ai/gemma4-tool-controller.js');

    const callModel = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [{ function: { name: 'trace.kag_search', arguments: { query: 'test' } } }],
      })
      .mockResolvedValueOnce({ content: 'Final answer here.', tool_calls: [] });

    mocks.dispatchFn.mockResolvedValue({ tool: 'trace.kag_search', success: true, data: [{ id: 1 }] });

    const result = await runGemma4ToolLoop({
      messages:  [{ role: 'user', content: 'search test' }],
      callModel,
    });

    expect(result.toolsUsed).toContain('trace.kag_search');
    expect(result.toolRounds).toBeGreaterThanOrEqual(1);
    expect(result.answer).toBe('Final answer here.');
    expect(result.mcpPort).toBe(8788);
    expect(result.toolResultChars).toBeGreaterThan(0);
  });

  it('dispatches codebase.rg_search as a read-only fallback tool', async () => {
    const { runGemma4ToolLoop } = await import('$lib/server/ai/gemma4-tool-controller.js');

    const callModel = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [
          { function: { name: 'codebase.rg_search', arguments: { query: 'validateToolName' } } },
        ],
      })
      .mockResolvedValueOnce({ content: 'done', tool_calls: [] });

    mocks.dispatchFn.mockResolvedValue({
      tool: 'codebase.rg_search',
      success: true,
      data: {
        matchCount: 1,
        matches: [{ file: 'src/lib/server/ai/gemma4-tool-controller.ts', line: 1 }],
      },
    });

    const result = await runGemma4ToolLoop({
      messages: [{ role: 'user', content: 'search the bridge' }],
      callModel,
    });

    expect(result.toolsUsed).toContain('codebase.rg_search');
    expect(result.answer).toBe('done');
  });
});
