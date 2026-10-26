import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('$lib/server/llm/runtime-contract.js', () => ({
  resolveLlamaInferenceTarget: vi.fn(),
}));

import { registerBifrostTools } from './bifrost_tools.js';
import { registerCodebaseTools } from './codebase_tools.js';
import { registerResearchTools } from './research_tools.js';
import { registerRgAtlasTools } from './rg_atlas_tools.js';

function registerOptionalTools() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: unknown }>();
  const modes: string[] = [];
  const server = {
    registerTool(name: string, config: Record<string, unknown>, handler: unknown) {
      tools.set(name, { config, handler });
    },
  };
  const middleware = {
    wrap(handler: unknown, _name: string, _session: string, mode: string) {
      modes.push(mode);
      return handler;
    },
  };

  registerCodebaseTools(server as never, middleware as never);
  registerRgAtlasTools(server as never, middleware as never);
  registerResearchTools(server as never, middleware as never);
  registerBifrostTools(server as never, middleware as never);
  return { tools, modes };
}

describe('optional TRACE search tools', () => {
  it('registers the six source tools as read-only executions', () => {
    const { tools, modes } = registerOptionalTools();
    expect([...tools.keys()].sort()).toEqual([
      'codebase.rg_search',
      'kb.rg_atlas_search',
      'research.deep_analyze',
      'research.synthesize',
      'research.web_search',
      'trace.bifrost_dispatch',
    ]);
    expect(modes).toHaveLength(6);
    expect(modes.every((mode) => mode === 'READ_ONLY')).toBe(true);
  });

  it('bounds RG-Atlas scope and rejects repository escapes', () => {
    const { tools } = registerOptionalTools();
    const schema = tools.get('kb.rg_atlas_search')?.config.inputSchema as z.ZodType;
    expect(schema.safeParse({ query: 'symbol', paths: ['src/lib'] }).success).toBe(true);
    expect(schema.safeParse({ query: 'symbol', paths: ['../../outside'] }).success).toBe(false);
    expect(schema.safeParse({ query: 'symbol', persist: true }).success).toBe(false);
  });

  it('bounds research inputs and rejects unknown properties', () => {
    const { tools } = registerOptionalTools();
    const search = tools.get('research.web_search')?.config.inputSchema as Record<string, z.ZodType>;
    const searchSchema = z.object(search);
    expect(searchSchema.safeParse({ query: 'code search', limit: 10 }).success).toBe(true);
    expect(searchSchema.safeParse({ query: 'x'.repeat(513) }).success).toBe(false);
    expect(searchSchema.safeParse({ query: 'legal', debug: true }).success).toBe(false);
  });

  it('rejects oversized Bifrost payloads', () => {
    const { tools } = registerOptionalTools();
    const schema = tools.get('trace.bifrost_dispatch')?.config.inputSchema as z.ZodType;
    expect(schema.safeParse({ tier: 'EMBED', payload: { input: 'small' } }).success).toBe(true);
    expect(schema.safeParse({ tier: 'EMBED', payload: { input: 'x'.repeat(256 * 1024) } }).success).toBe(false);
  });
});
