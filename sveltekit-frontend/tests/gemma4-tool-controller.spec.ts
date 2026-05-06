// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatchFn:   vi.fn(),
  recordAction: vi.fn(),
}));

vi.mock('$lib/server/trace/trace-collector.js', () => ({
  recordAgentAction: mocks.recordAction,
}));

// Stub TOOL_DISPATCH and MCPToolResult without real server deps
vi.mock('$lib/server/ai/mcp-tool-dispatch.js', () => ({
  TOOL_DISPATCH: {
    'trace.kag_search': mocks.dispatchFn,
  },
}));

describe('gemma4-tool-controller', () => {
  beforeEach(() => {
    mocks.dispatchFn.mockReset();
    mocks.recordAction.mockReset();
    mocks.recordAction.mockReturnValue(undefined);
  });

  it('validates allowed tool names — returns valid:true for allowlisted tools', async () => {
    const { validateToolName } = await import('$lib/server/ai/gemma4-tool-controller.js');
    expect(validateToolName('trace.kag_search').valid).toBe(true);
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

    // callModel invoked at most maxToolRounds + 1 times (last call for final answer)
    expect(callModel).toHaveBeenCalledTimes(4); // 3 tool rounds + 1 final answer call
    expect(result.toolRounds).toBe(3);
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
});
