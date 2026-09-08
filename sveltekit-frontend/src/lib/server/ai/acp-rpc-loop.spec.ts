import { describe, expect, it } from 'vitest';
import { executeToolCallsInParallel } from './acp-rpc-loop.js';
import type { ToolCall } from './tool-call-parser.js';

function toolCall(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  } as ToolCall;
}

describe('executeToolCallsInParallel (parent-atlas-ace-bitfrost-cache-correctness T3, MCP tool-call parallelism)', () => {
  it('runs tool calls concurrently, not serially: total time is close to the slowest call, not the sum', async () => {
    const delays = [40, 40, 40];
    const calls = delays.map((_, index) => toolCall(`call-${index}`, `tool-${index}`));

    const start = Date.now();
    await executeToolCallsInParallel(calls, async (name) => {
      const delay = delays[Number(name.split('-')[1])];
      await new Promise((resolve) => setTimeout(resolve, delay));
      return JSON.stringify({ ok: true, name });
    });
    const elapsed = Date.now() - start;

    // Serial execution would take >=120ms (3x40ms). Concurrent execution
    // should finish close to the single slowest call (~40ms). Generous
    // threshold to avoid flakiness on a loaded CI box.
    expect(elapsed).toBeLessThan(100);
  });

  it('returns results in the original tool_calls order even when the slowest call is first', async () => {
    const order: string[] = [];
    const calls = [toolCall('call-a', 'slow'), toolCall('call-b', 'fast')];

    const results = await executeToolCallsInParallel(calls, async (name) => {
      const delay = name === 'slow' ? 30 : 5;
      await new Promise((resolve) => setTimeout(resolve, delay));
      order.push(name); // records actual COMPLETION order
      return JSON.stringify({ name });
    });

    // Completion order is fast-then-slow (proves real concurrency happened)...
    expect(order).toEqual(['fast', 'slow']);
    // ...but the RETURNED array must still match input order (call-a, call-b),
    // which is what tool_call_id correlation in messages.push(...) depends on.
    expect(results.map((r) => r.tool_call_id)).toEqual(['call-a', 'call-b']);
  });

  it('isolates a failing tool call to its own tool_call_id without affecting the others', async () => {
    const calls = [toolCall('call-1', 'ok'), toolCall('call-2', 'boom'), toolCall('call-3', 'ok')];

    const results = await executeToolCallsInParallel(calls, async (name) => {
      if (name === 'boom') throw new Error('tool exploded');
      return JSON.stringify({ ok: true });
    });

    expect(results).toHaveLength(3);
    expect(results[0].content).toBe(JSON.stringify({ ok: true }));
    expect(JSON.parse(results[1].content)).toEqual({ error: 'tool exploded' });
    expect(results[2].content).toBe(JSON.stringify({ ok: true }));
  });

  it('every result carries the role "tool" and the matching tool_call_id', async () => {
    const calls = [toolCall('x1', 'a'), toolCall('x2', 'b')];
    const results = await executeToolCallsInParallel(calls, async () => '{}');
    expect(results.every((r) => r.role === 'tool')).toBe(true);
    expect(results.map((r) => r.tool_call_id)).toEqual(['x1', 'x2']);
  });
});
