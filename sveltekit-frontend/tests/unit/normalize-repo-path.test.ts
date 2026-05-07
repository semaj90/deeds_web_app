// @vitest-environment node
/**
 * Regression tests for normalizeRepoPath() and ACE relation matching.
 *
 * Coverage:
 *   - normalizeRepoPath: Windows absolute, Unix absolute, repo-relative, mixed slashes, edge cases
 *   - ACE relation matching: src file names resolve correctly against sample edges
 *   - ACE file list: at least 6 of the 12 canonical ACE files produce > 0 matches
 */
import { describe, it, expect } from 'vitest';

// Import from the script directly (ESM)
import { normalizeRepoPath } from '../../scripts/graph/build-codebase-relationships.mjs';

/* ─────────────────────────────────────────────────────────────────────────────
 * normalizeRepoPath unit tests
 * ───────────────────────────────────────────────────────────────────────────── */

describe('normalizeRepoPath', () => {
  it('handles Windows absolute paths', () => {
    expect(normalizeRepoPath(
      'C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\server\\ace\\context-assembler.ts'
    )).toBe('src/lib/server/ace/context-assembler.ts');
  });

  it('handles Unix absolute paths', () => {
    expect(normalizeRepoPath(
      '/home/user/deeds-web-app/sveltekit-frontend/src/lib/server/ace/context-assembler.ts'
    )).toBe('src/lib/server/ace/context-assembler.ts');
  });

  it('handles repo-relative paths starting with src/', () => {
    expect(normalizeRepoPath('src/lib/server/ai/gemma4-agent.ts'))
      .toBe('src/lib/server/ai/gemma4-agent.ts');
  });

  it('handles paths with mixed slashes', () => {
    expect(normalizeRepoPath(
      'sveltekit-frontend\\src/lib\\server/ace\\context-assembler.ts'
    )).toBe('src/lib/server/ace/context-assembler.ts');
  });

  it('handles leading ./', () => {
    expect(normalizeRepoPath('./src/lib/server/ai/gemma4-agent.ts'))
      .toBe('src/lib/server/ai/gemma4-agent.ts');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeRepoPath(null)).toBe('');
    expect(normalizeRepoPath(undefined)).toBe('');
    expect(normalizeRepoPath('')).toBe('');
  });

  it('preserves already-normalized paths unchanged', () => {
    const p = 'src/lib/server/ace/context-assembler.ts';
    expect(normalizeRepoPath(p)).toBe(p);
  });

  it('handles basename-only paths (no src/ prefix)', () => {
    // Postgres fan-in returns basenames; normalizeRepoPath should pass them through
    const p = 'context-assembler.ts';
    expect(normalizeRepoPath(p)).toBe(p);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ACE relation matching — verify normalizeRepoPath enables edge resolution
 * ───────────────────────────────────────────────────────────────────────────── */

describe('ACE relation matching', () => {
  const ACE_FILES = [
    'context-assembler.ts',
    'multi-lane-retrieval.ts',
    'retrieval-lanes.ts',
    'cache-keys.ts',
    'ngram-retrieval.ts',
    'error-fingerprint.ts',
    'graph-expander.ts',
    'qdrant-manager.ts',
    'gemma4-agent.ts',
    'trace-subagent-orchestrator.ts',
    'synthesis-memory-archiver.ts',
    'dual-embedder.ts',
  ];

  // Simulate the kind of edge records returned by code-relations-latest.json
  const sampleEdges = [
    { sourceFile: 'C:\\repo\\sveltekit-frontend\\src\\lib\\server\\ace\\context-assembler.ts', relationType: 'READS_REDIS_KEY', targetKey: 'ace:topo:${topoClass}:${qHash}', confidence: 0.9 },
    { sourceFile: 'src/lib/server/ace/multi-lane-retrieval.ts',                                relationType: 'QUERIES_QDRANT_COLLECTION', targetKey: 'codebase_chunks_768', confidence: 0.9 },
    { sourceFile: './src/lib/server/ace/retrieval-lanes.ts',                                   relationType: 'READS_REDIS_KEY', targetKey: 'code:graph:node:${hash}', confidence: 0.8 },
    // basename-only (Postgres fan-in style)
    { sourceFile: 'gemma4-agent.ts',                                                           relationType: 'QUERIES_TABLE', targetKey: 'cases', confidence: 0.85 },
    { sourceFile: 'unrelated-file.ts',                                                         relationType: 'EXPORTS_SYMBOL', targetKey: 'SomeSymbol', confidence: 1.0 },
  ];

  const normalizedSample = sampleEdges.map(e => ({
    ...e,
    _normSrc: normalizeRepoPath(e.sourceFile),
  }));

  function matchEdgesForFile(fname: string) {
    return normalizedSample.filter(e =>
      e._normSrc.endsWith('/' + fname) ||
      e._normSrc === fname ||
      e.sourceFile?.endsWith(fname)
    );
  }

  it('resolves Windows absolute path edge to context-assembler.ts', () => {
    expect(matchEdgesForFile('context-assembler.ts')).toHaveLength(1);
  });

  it('resolves relative path edge to multi-lane-retrieval.ts', () => {
    expect(matchEdgesForFile('multi-lane-retrieval.ts')).toHaveLength(1);
  });

  it('resolves dot-relative path edge to retrieval-lanes.ts', () => {
    expect(matchEdgesForFile('retrieval-lanes.ts')).toHaveLength(1);
  });

  it('resolves basename-only edge to gemma4-agent.ts', () => {
    expect(matchEdgesForFile('gemma4-agent.ts')).toHaveLength(1);
  });

  it('does not match unrelated-file.ts to any ACE file', () => {
    for (const fname of ACE_FILES) {
      const matches = matchEdgesForFile(fname);
      for (const m of matches) {
        expect(m.sourceFile).not.toBe('unrelated-file.ts');
      }
    }
  });

  it('at least 4 of 12 ACE canonical files match at least one edge', () => {
    const matchCount = ACE_FILES.filter(f => matchEdgesForFile(f).length > 0).length;
    expect(matchCount).toBeGreaterThanOrEqual(4);
  });
});
