// @vitest-environment node
/**
 * Unit tests for llama-tool-definitions.ts
 * Verifies OpenAI-format tool definitions and name mapping for TurboQuant :8090.
 */

import { describe, it, expect } from 'vitest';

const mod = await import('../src/lib/server/ai/llama-tool-definitions.js');
const { LLAMA_TOOL_DEFINITIONS, LLAMA_TO_MCP_NAME, parseLlamaToolCall } = mod;

describe('LLAMA_TOOL_DEFINITIONS', () => {
  it('every tool has type === "function"', () => {
    for (const tool of LLAMA_TOOL_DEFINITIONS) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
      expect(typeof tool.function.description).toBe('string');
    }
  });

  it('includes search__dev_context as first tool', () => {
    expect(LLAMA_TOOL_DEFINITIONS[0].function.name).toBe('search__dev_context');
  });

  it('includes codebase__rg_search', () => {
    const names = LLAMA_TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toContain('codebase__rg_search');
  });

  it('includes trace__kag_search', () => {
    const names = LLAMA_TOOL_DEFINITIONS.map(t => t.function.name);
    expect(names).toContain('trace__kag_search');
  });

  it('includes context__build_kv_packet', () => {
    const names = LLAMA_TOOL_DEFINITIONS.map(t => t.function.name);
    expect(names).toContain('context__build_kv_packet');
  });
});

describe('LLAMA_TO_MCP_NAME', () => {
  it('maps search__dev_context → search.dev_context', () => {
    expect(LLAMA_TO_MCP_NAME['search__dev_context']).toBe('search.dev_context');
  });

  it('maps codebase__rg_search → codebase.rg_search', () => {
    expect(LLAMA_TO_MCP_NAME['codebase__rg_search']).toBe('codebase.rg_search');
  });

  it('maps trace__kag_search → trace.kag_search', () => {
    expect(LLAMA_TO_MCP_NAME['trace__kag_search']).toBe('trace.kag_search');
  });

  it('maps context__build_kv_packet → context.build_kv_packet', () => {
    expect(LLAMA_TO_MCP_NAME['context__build_kv_packet']).toBe('context.build_kv_packet');
  });

  it('every LLAMA_TOOL_DEFINITIONS name has a mapping entry', () => {
    for (const tool of LLAMA_TOOL_DEFINITIONS) {
      expect(LLAMA_TO_MCP_NAME[tool.function.name]).toBeDefined();
    }
  });
});

describe('parseLlamaToolCall', () => {
  it('maps search__dev_context to search.dev_context', () => {
    const result = parseLlamaToolCall({
      id: '1', type: 'function',
      function: { name: 'search__dev_context', arguments: '{"query":"fetchCodebaseContext"}' },
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('search.dev_context');
    expect(result!.args.query).toBe('fetchCodebaseContext');
  });

  it('maps codebase__rg_search to codebase.rg_search', () => {
    const result = parseLlamaToolCall({
      id: '1b',
      type: 'function',
      function: { name: 'codebase__rg_search', arguments: '{"query":"toolName"}' },
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('codebase.rg_search');
    expect(result!.args.query).toBe('toolName');
  });

  it('maps trace__kag_search to trace.kag_search', () => {
    const result = parseLlamaToolCall({
      id: '2', type: 'function',
      function: { name: 'trace__kag_search', arguments: '{"query":"searchCodeLexical","limit":5}' },
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('trace.kag_search');
    expect(result!.args.limit).toBe(5);
  });

  it('maps context__build_kv_packet to context.build_kv_packet', () => {
    const result = parseLlamaToolCall({
      id: '3', type: 'function',
      function: { name: 'context__build_kv_packet', arguments: '{"taskId":"t1","query":"auth flow"}' },
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('context.build_kv_packet');
  });

  it('returns null for unknown tool name', () => {
    expect(parseLlamaToolCall({
      id: '4', type: 'function',
      function: { name: 'unknown__tool', arguments: '{}' },
    })).toBeNull();
  });

  it('returns null for invalid JSON arguments', () => {
    expect(parseLlamaToolCall({
      id: '5', type: 'function',
      function: { name: 'trace__kag_search', arguments: '{not valid json' },
    })).toBeNull();
  });

  it('converts hotFiles string to array', () => {
    const result = parseLlamaToolCall({
      id: '6', type: 'function',
      function: {
        name: 'context__build_kv_packet',
        arguments: '{"taskId":"t1","query":"q","hotFiles":"a.ts,b.ts, c.ts"}',
      },
    });
    expect(Array.isArray(result!.args.hotFiles)).toBe(true);
    expect(result!.args.hotFiles).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('converts hotSymbols string to array', () => {
    const result = parseLlamaToolCall({
      id: '7', type: 'function',
      function: {
        name: 'context__build_kv_packet',
        arguments: '{"taskId":"t1","query":"q","hotSymbols":"fetchCodebaseContext, searchCodeLexical"}',
      },
    });
    expect(Array.isArray(result!.args.hotSymbols)).toBe(true);
    expect((result!.args.hotSymbols as string[])[0]).toBe('fetchCodebaseContext');
  });
});
