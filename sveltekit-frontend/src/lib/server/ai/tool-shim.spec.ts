// @vitest-environment node

import { describe, expect, it } from 'vitest';

describe('tool shim', () => {
  it('parses Hermes-style pseudo tool calls into terminal commands', async () => {
    const { parseToolCall, parseToolCalls } = await import('./tool-shim.js');

    expect(parseToolCall('<execute_bash>pwd</execute_bash>')).toEqual({
      tool: 'terminal',
      args: { command: 'pwd' },
    });

    expect(parseToolCall('<tool_code>Write-Output hello</tool_code>')).toEqual({
      tool: 'terminal',
      args: { command: 'Write-Output hello' },
    });

    expect(parseToolCall('<|tool_call|>call:terminal{"command":"pwd"}<tool_call|>')).toEqual({
      tool: 'terminal',
      args: { command: 'pwd' },
    });

    expect(parseToolCall('call:terminal(shell="pwd")')).toEqual({
      tool: 'terminal',
      args: { command: 'pwd' },
    });

    expect(parseToolCalls('<execute_bash>pwd</execute_bash>\n<tool_code>Write-Output hi</tool_code>')).toEqual([
      { tool: 'terminal', args: { command: 'pwd' } },
      { tool: 'terminal', args: { command: 'Write-Output hi' } },
    ]);
  });

  it('executes a terminal command through the terminal branch', async () => {
    const { executeTool } = await import('./tool-shim.js');

    const result = await executeTool({
      tool: 'terminal',
      args: { command: 'Write-Output hermes-tool-shim' },
    });

    expect(result).toMatchObject({
      ok: true,
      tool: 'terminal',
    });

    expect(String((result as any).stdout ?? '')).toContain('hermes-tool-shim');
  });
});
