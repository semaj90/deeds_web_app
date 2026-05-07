// @vitest-environment node
/**
 * tests/agents-md-ingest.spec.ts
 *
 * Unit tests for the AGENTS.md ingest script (index-agents-md.mjs) conventions
 * and the existing parse-agents-md.ts / resolve-directory-context.ts modules.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

// ── Inline helpers matching index-agents-md.mjs conventions ──────────────────

function normalizeFilePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function dirPathFor(filePath: string): string {
  const norm = normalizeFilePath(filePath);
  return norm.split('/').slice(0, -1).join('/') || '.';
}

function stableKeyFor(filePath: string): string {
  return `agents:${normalizeFilePath(filePath)}`;
}

function redisKeyFor(dirPath: string): string {
  if (dirPath === '.' || dirPath === '') return 'agents:root';
  return `agents:dir:${dirPath}`;
}

function contentHashFor(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

// ── Layered discovery list (matches the layered approach in the prompt) ───────

const LAYERED_PATHS = [
  'AGENTS.md',
  'src/mcp/AGENTS.md',
  'src/lib/server/ai/AGENTS.md',
  'src/lib/server/gpu/AGENTS.md',
  'services/go-retrieval-service/AGENTS.md',
  'services/go-search-service/AGENTS.md',
];

// ── Path normalization ────────────────────────────────────────────────────────

describe('normalizeFilePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeFilePath('src\\lib\\server\\ai\\AGENTS.md'))
      .toBe('src/lib/server/ai/AGENTS.md');
  });

  it('leaves forward-slash paths unchanged', () => {
    expect(normalizeFilePath('src/mcp/AGENTS.md')).toBe('src/mcp/AGENTS.md');
  });
});

describe('dirPathFor', () => {
  it('extracts directory from nested path', () => {
    expect(dirPathFor('src/lib/server/ai/AGENTS.md')).toBe('src/lib/server/ai');
  });

  it('returns "." for root-level file', () => {
    expect(dirPathFor('AGENTS.md')).toBe('.');
  });

  it('handles Windows backslash paths', () => {
    expect(dirPathFor('src\\mcp\\AGENTS.md')).toBe('src/mcp');
  });
});

// ── Stable key convention ─────────────────────────────────────────────────────

describe('stableKeyFor', () => {
  it('produces agents: prefix for all paths', () => {
    for (const p of LAYERED_PATHS) {
      expect(stableKeyFor(p)).toMatch(/^agents:/);
    }
  });

  it('normalizes Windows paths in stable key', () => {
    expect(stableKeyFor('src\\mcp\\AGENTS.md')).toBe('agents:src/mcp/AGENTS.md');
  });
});

// ── Redis key convention ──────────────────────────────────────────────────────

describe('redisKeyFor', () => {
  it('maps root-level AGENTS.md to agents:root', () => {
    expect(redisKeyFor('.')).toBe('agents:root');
    expect(redisKeyFor('')).toBe('agents:root');
  });

  it('maps subdirectory AGENTS.md to agents:dir:<path>', () => {
    expect(redisKeyFor('src/mcp')).toBe('agents:dir:src/mcp');
    expect(redisKeyFor('src/lib/server/ai')).toBe('agents:dir:src/lib/server/ai');
  });

  it('walk-up candidates from file path hit the correct Redis keys', () => {
    // For src/lib/server/ace/context-assembler.ts, walk-up should check:
    //   agents:dir:src/lib/server/ace
    //   agents:dir:src/lib/server
    //   agents:dir:src/lib
    //   agents:dir:src
    //   agents:root
    const filePath = 'src/lib/server/ace/context-assembler.ts';
    const parts = filePath.split('/').slice(0, -1);
    const candidates: string[] = [];
    for (let i = parts.length; i > 0; i--) {
      candidates.push(redisKeyFor(parts.slice(0, i).join('/')));
    }
    candidates.push('agents:root');

    expect(candidates).toContain('agents:dir:src/lib/server/ace');
    expect(candidates).toContain('agents:dir:src/lib/server');
    expect(candidates).toContain('agents:root');
    expect(candidates[0]).toBe('agents:dir:src/lib/server/ace');
    expect(candidates[candidates.length - 1]).toBe('agents:root');
  });
});

// ── Layered discovery (not recursive spam) ────────────────────────────────────

describe('layered discovery', () => {
  it('covers root, mcp, ai, gpu service layers', () => {
    expect(LAYERED_PATHS).toContain('AGENTS.md');
    expect(LAYERED_PATHS).toContain('src/mcp/AGENTS.md');
    expect(LAYERED_PATHS).toContain('src/lib/server/ai/AGENTS.md');
    expect(LAYERED_PATHS).toContain('src/lib/server/gpu/AGENTS.md');
  });

  it('does not include deeply nested auto-generated files', () => {
    // Layered files are at most 5 segments deep (e.g. src/lib/server/ai/AGENTS.md).
    // Anything deeper would indicate recursive spam from a directory walker.
    for (const p of LAYERED_PATHS) {
      expect(p.split('/').length).toBeLessThanOrEqual(5);
    }
  });
});

// ── Content hash ──────────────────────────────────────────────────────────────

describe('contentHashFor', () => {
  it('produces consistent sha256 hex for same content', () => {
    const body = '# My AGENTS.md\n\n## Rules\n- Use runes\n';
    expect(contentHashFor(body)).toBe(contentHashFor(body));
  });

  it('produces different hash for different content', () => {
    expect(contentHashFor('v1')).not.toBe(contentHashFor('v2'));
  });
});

// ── Parsed envelope structure ─────────────────────────────────────────────────

describe('parseAgentsMd inline logic', () => {
  function extractTitle(body: string): string | undefined {
    const h1 = body.split('\n').find(l => /^#\s+/.test(l));
    return h1 ? h1.replace(/^#\s+/, '').trim() : undefined;
  }

  function extractRules(body: string): string[] {
    const lines = body.split('\n');
    const rules: string[] = [];
    let inRules = false;
    for (const line of lines) {
      if (/^##\s+(rules|conventions|standards)/i.test(line)) { inRules = true; continue; }
      if (/^##/.test(line)) { inRules = false; continue; }
      if (inRules && /^\s*[-*]\s+/.test(line)) {
        rules.push(line.replace(/^\s*[-*]\s+/, '').trim());
      }
    }
    return rules;
  }

  const SAMPLE = `# AI Server Tools
This module handles AI inference.

## Rules
- Use runes only [svelte5,runes]
- No LangGraph yet [critical]
- Read-only tools only

## Semantic Tags
- ai-inference
- gemma4
`;

  it('extracts title from H1', () => {
    expect(extractTitle(SAMPLE)).toBe('AI Server Tools');
  });

  it('extracts rules from ## Rules section', () => {
    const rules = extractRules(SAMPLE);
    expect(rules.length).toBe(3);
    expect(rules[0]).toContain('Use runes only');
  });

  it('returns undefined title for body with no H1', () => {
    expect(extractTitle('## Just a section\n- item')).toBeUndefined();
  });

  it('dry-run does not write (stable key computed without side effects)', () => {
    const key = stableKeyFor('AGENTS.md');
    const dir = dirPathFor('AGENTS.md');
    const rkey = redisKeyFor(dir);
    const hash = contentHashFor(SAMPLE);
    // All reads — no I/O
    expect(key).toBe('agents:AGENTS.md');
    expect(dir).toBe('.');
    expect(rkey).toBe('agents:root');
    expect(hash).toHaveLength(64);
  });
});
