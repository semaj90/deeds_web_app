// @vitest-environment node

import { describe, expect, it } from 'vitest';

describe('tool-call-parser', () => {
  it('parses tagged Gemma-style tool calls', async () => {
    const { hasToolCalls, parseToolCalls } = await import('./tool-call-parser.js');

    const parsed = parseToolCalls(
      [
        '<reasoning>Use trace.kag_search before any raw read.</reasoning>',
        '<tool_call>{"name":"trace.kag_search","arguments":{"query":"vector routing","limit":5}}</tool_call>',
      ].join('\n')
    );

    expect(hasToolCalls(parsed.responseText || '')).toBe(false);
    expect(parsed.reasoningText).toContain('trace.kag_search');
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]?.function.name).toBe('trace.kag_search');
    expect(JSON.parse(parsed.toolCalls[0]?.function.arguments ?? '{}')).toEqual({
      query: 'vector routing',
      limit: 5,
    });
  });

  it('parses OpenAI-compatible JSON tool calls with simdjson fallback', async () => {
    const { hasToolCalls, parseToolCalls } = await import('./tool-call-parser.js');

    const raw = JSON.stringify({
      choices: [
        {
          message: {
            content: 'Routing to atlas query.',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'trace.kag_search',
                  arguments: '{"query":"ace kag dag hypergraphrag"}',
                },
              },
            ],
          },
        },
      ],
    });

    const parsed = parseToolCalls(raw);

    expect(hasToolCalls(raw)).toBe(true);
    expect(parsed.responseText).toBe('Routing to atlas query.');
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]?.function.name).toBe('trace.kag_search');
    expect(JSON.parse(parsed.toolCalls[0]?.function.arguments ?? '{}')).toEqual({
      query: 'ace kag dag hypergraphrag',
    });
  });
});
