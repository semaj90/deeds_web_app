// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseAgentsMd } from '$lib/server/agents-md/parse-agents-md.js';
import {
  candidateAgentsMdPaths,
  nearestAgentsMdForFile,
  bindingsForAgentsMd,
} from '$lib/server/agents-md/resolve-directory-context.js';
import { agentsMdEnvelopeSchema } from '$lib/server/agents-md/schema.js';

describe('agents-md/parse-agents-md', () => {
  it('extracts title, summary, rules, tools, constraints, tags from a structured AGENTS.md', () => {
    const md = [
      '# AI Server Conventions',
      '',
      'Rules and tool policy for local AI agent orchestration.',
      '',
      '## Rules',
      '- Use TypeScript-native MCP tools before Python fallbacks. [typescript, mcp, no-python-fallback]',
      '- Critical: never bypass the auth guard on /api/v1/* routes.',
      '',
      '## Tools',
      '- qdrant_search: allowed (read-only) — semantic chunk lookup',
      '- apply_patch: forbidden (proposal-only) — must go through /api/agent/propose-fix',
      '',
      '## Constraints',
      '- Do not import server-only modules into .svelte components. [ssr-safety]',
      '',
      '## Semantic Tags',
      '- agent-api',
      '- mcp-tools',
      '- openai-facade',
    ].join('\n');

    const env = parseAgentsMd(md, 'src/lib/server/ai/AGENTS.md');

    expect(env.kind).toBe('agents_md');
    expect(env.stable_key).toBe('agents:src/lib/server/ai/AGENTS.md');
    expect(env.directory_path).toBe('src/lib/server/ai');
    expect(env.title).toBe('AI Server Conventions');
    expect(env.summary).toContain('Rules and tool policy');

    expect(env.rules).toHaveLength(2);
    expect(env.rules[0].tags).toEqual(expect.arrayContaining(['typescript', 'mcp']));
    expect(env.rules[1].severity).toBe('high'); // 'Critical' → high

    expect(env.tools).toHaveLength(2);
    expect(env.tools.find((t) => t.tool === 'qdrant_search')?.allowed).toBe(true);
    expect(env.tools.find((t) => t.tool === 'apply_patch')?.allowed).toBe(false);

    expect(env.constraints).toHaveLength(1);
    expect(env.constraints[0].applies_to).toContain('ssr-safety');

    expect(env.semantic_tags).toEqual(expect.arrayContaining(['agent-api', 'mcp-tools', 'openai-facade']));

    // content_hash is deterministic SHA-256 (64 hex chars)
    expect(env.content_hash).toMatch(/^[0-9a-f]{64}$/);

    // Confidence rises with structure
    expect(env.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('returns a valid envelope when AGENTS.md has no structured sections (low-confidence fallback)', () => {
    const env = parseAgentsMd('# Just a title\n\nA paragraph.', 'AGENTS.md');
    expect(env.kind).toBe('agents_md');
    expect(env.directory_path).toBe('.');
    expect(env.rules).toEqual([]);
    expect(env.tools).toEqual([]);
    // Floor at 0.5 for any parsed AGENTS.md
    expect(env.confidence).toBeGreaterThanOrEqual(0.5);

    // Round-trips through Zod
    const reparsed = agentsMdEnvelopeSchema.parse(env);
    expect(reparsed.kind).toBe('agents_md');
  });

  it('parses tools from a markdown table', () => {
    const md = [
      '# Tools',
      '',
      '## Tools',
      '| tool | allowed | scope | reason |',
      '|------|---------|-------|--------|',
      '| qdrant_search | allowed | read-only | semantic search |',
      '| apply_patch | forbidden | proposal-only | safety |',
    ].join('\n');
    const env = parseAgentsMd(md, 'AGENTS.md');
    expect(env.tools).toHaveLength(2);
    expect(env.tools[0].tool).toBe('qdrant_search');
    expect(env.tools[0].allowed).toBe(true);
    expect(env.tools[0].scope).toBe('read-only');
    expect(env.tools[1].allowed).toBe(false);
  });
});

describe('agents-md/resolve-directory-context', () => {
  it('candidateAgentsMdPaths walks UP the tree, nearest-first', () => {
    const candidates = candidateAgentsMdPaths('src/lib/server/ai/foo.ts');
    expect(candidates).toEqual([
      'src/lib/server/ai/AGENTS.md',
      'src/lib/server/AGENTS.md',
      'src/lib/AGENTS.md',
      'src/AGENTS.md',
      'AGENTS.md',
    ]);
  });

  it('nearestAgentsMdForFile resolves via direct path, agents:* prefix, OR agents:dir:* shape', () => {
    // Set form (file path keys)
    const setA = new Set(['src/lib/AGENTS.md']);
    expect(nearestAgentsMdForFile('src/lib/server/ai/foo.ts', setA)).toBe('src/lib/AGENTS.md');

    // agents:<file> prefix
    const setB = new Set(['agents:src/lib/server/AGENTS.md']);
    expect(nearestAgentsMdForFile('src/lib/server/ai/foo.ts', setB)).toBe('src/lib/server/AGENTS.md');

    // agents:dir:<dir> shape (the actual Redis key format from generate-agents-md.mjs)
    const setC = new Set(['agents:dir:src/lib/server/ai']);
    expect(nearestAgentsMdForFile('src/lib/server/ai/foo.ts', setC)).toBe('src/lib/server/ai/AGENTS.md');

    // No match → null
    expect(nearestAgentsMdForFile('src/lib/server/ai/foo.ts', new Set<string>())).toBeNull();
  });

  it('bindingsForAgentsMd creates one exact + one inherited row per descendant directory', () => {
    const bindings = bindingsForAgentsMd({
      agentContextKey: 'agents:src/lib/AGENTS.md',
      agentsMdPath:    'src/lib/AGENTS.md',
      allDirectories:  [
        'src/lib',
        'src/lib/server',
        'src/lib/server/ai',
        'src/components', // unrelated — should NOT bind
      ],
    });

    // 1 exact + 2 inherited (lib/server, lib/server/ai); src/components not under src/lib
    expect(bindings).toHaveLength(3);
    expect(bindings.find((b) => b.directory_path === 'src/lib')?.binding_type).toBe('exact');
    expect(bindings.find((b) => b.directory_path === 'src/lib')?.depth).toBe(0);

    const inherited = bindings.filter((b) => b.binding_type === 'inherited');
    expect(inherited).toHaveLength(2);
    // Depth + confidence decay
    const aiBinding = inherited.find((b) => b.directory_path === 'src/lib/server/ai');
    expect(aiBinding?.depth).toBe(2);
    expect(aiBinding?.confidence).toBeLessThan(1.0);
    expect(aiBinding?.priority).toBeGreaterThan(100); // inherited deeper = lower priority

    // Unrelated dir is excluded
    expect(bindings.find((b) => b.directory_path === 'src/components')).toBeUndefined();
  });

  it('handles repo-root AGENTS.md: governs every dir', () => {
    const bindings = bindingsForAgentsMd({
      agentContextKey: 'agents:AGENTS.md',
      agentsMdPath:    'AGENTS.md',
      allDirectories:  ['src', 'src/lib', 'tests'],
    });
    // Exact for '.' + 3 inherited (src, src/lib, tests)
    expect(bindings.find((b) => b.directory_path === '.' && b.binding_type === 'exact')).toBeDefined();
    expect(bindings.filter((b) => b.binding_type === 'inherited')).toHaveLength(3);
  });
});
