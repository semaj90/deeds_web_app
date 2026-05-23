import { describe, it, expect, vi } from 'vitest';
import { injectSummary } from '../src/lib/server/ai/opencode-skill.js';
import { InjectSummaryArgsSchema } from '../src/lib/server/ai/source-ref-schema.js';
import { tool_opencode_inject_summary } from '../src/lib/server/ai/mcp-tool-dispatch.js';
import * as searchLogic from '../src/lib/server/kb/search-logic.js';

// Mock DB insert and searchLogic
vi.mock('../src/lib/server/db/client', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
  },
}));

vi.mock('../src/lib/server/kb/search-logic.js', () => ({
  getNotecardBySourcePath: vi.fn(),
}));

describe('OpenCode Skill Schema & Logic', () => {
  it('should validate basic schema', () => {
    const valid = InjectSummaryArgsSchema.parse({
      summary: 'This is a valid twenty char summary.',
      sourceRefs: ['local:file1.md#sha256:abcd'],
      furtherResearch: false,
      trustTier: 'local_verified'
    });
    expect(valid.sourceRefs).toEqual(['local:file1.md#sha256:abcd']);
  });

  it('should fail validation on missing sourceRefs', () => {
    expect(() => InjectSummaryArgsSchema.parse({
      summary: 'Valid summary here for twenty chars',
      sourceRefs: [],
    })).toThrow();
  });
});

describe('opencode.inject_summary MCP Tool', () => {
  it('should fail if sourceRefs are not valid local refs', async () => {
    
    const res = await tool_opencode_inject_summary({
      summary: 'Valid summary here for twenty chars or more.',
      sourceRefs: ['invalid/path.md'],
    });

    expect(res.success).toBe(true);
    const data = res.data as any;
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/Invalid sourceRefs/);
  });
});
