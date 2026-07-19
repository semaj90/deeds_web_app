// @vitest-environment node

/**
 * Exact-Search Recall Baseline
 *
 * Frozen query set → expected signal extraction → assertion.
 * No database required — purely tests the deterministic signal-extraction
 * and escaping logic that controls what SQL predicates are produced.
 *
 * If any test here breaks, the exact-search lane recall has regressed
 * (fewer / different tokens → fewer SQL matches → lower recall).
 */

import { describe, it, expect } from 'vitest';
import {
  escapeLike,
  extractQuerySignals,
  type QuerySignals,
} from '../src/lib/server/retrieval/adapters/postgres-exact-retriever.js';

// ---------------------------------------------------------------------------
// escapeLike
// ---------------------------------------------------------------------------

describe('escapeLike', () => {
  it('passes through clean identifiers unchanged', () => {
    expect(escapeLike('validateSession')).toBe('validateSession');
    expect(escapeLike('src/lib/server/auth.ts')).toBe('src/lib/server/auth.ts');
  });

  it('escapes % so it becomes a literal match', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('%prefix')).toBe('\\%prefix');
    expect(escapeLike('mid%dle')).toBe('mid\\%dle');
  });

  it('escapes _ so it becomes a literal match', () => {
    expect(escapeLike('snake_case')).toBe('snake\\_case');
    expect(escapeLike('a_b_c')).toBe('a\\_b\\_c');
  });

  it('escapes \\ so it is doubled', () => {
    expect(escapeLike('C:\\path')).toBe('C:\\\\path');
  });

  it('escapes combined special characters correctly', () => {
    expect(escapeLike('%_\\combo')).toBe('\\%\\_\\\\combo');
  });

  it('returns empty string unchanged', () => {
    expect(escapeLike('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractQuerySignals — frozen recall baseline
//
// Each entry is a real-world query pattern and the minimum tokens we expect
// in the combined signal set. Adding new extraction rules must not drop
// tokens that were previously emitted.
// ---------------------------------------------------------------------------

function allTokens(signals: QuerySignals): string[] {
  return [
    ...signals.identifiers,
    ...signals.paths,
    ...signals.errorCodes,
    ...signals.exactPhrases,
  ];
}

describe('extractQuerySignals — identifier extraction', () => {
  it('extracts snake_case function names', () => {
    const s = extractQuerySignals('how does validate_session work');
    expect(s.identifiers).toContain('validate_session');
  });

  it('extracts camelCase identifiers', () => {
    const s = extractQuerySignals('where is getQdrantManager called');
    expect(s.identifiers).toContain('getQdrantManager');
  });

  it('extracts PascalCase identifiers', () => {
    const s = extractQuerySignals('show me SearchRuntime constructor');
    expect(s.identifiers).toContain('SearchRuntime');
  });

  it('extracts multiple identifiers, capped at 8', () => {
    const s = extractQuerySignals(
      'createSession validateToken refreshToken revokeSession getUserById updatePassword resetPassword verifyEmail deleteAccount'
    );
    expect(s.identifiers.length).toBeLessThanOrEqual(8);
    expect(s.identifiers).toContain('createSession');
    expect(s.identifiers).toContain('validateToken');
  });

  it('filters out very short tokens (≤2 chars)', () => {
    const s = extractQuerySignals('is it ok to do db queries here');
    // 'is', 'it', 'ok', 'to', 'do', 'db' should be excluded (≤2 chars)
    for (const tok of s.identifiers) {
      expect(tok.length).toBeGreaterThan(2);
    }
  });
});

describe('extractQuerySignals — path extraction', () => {
  it('extracts src/ paths', () => {
    const s = extractQuerySignals('find src/lib/server/auth.ts');
    expect(s.paths.some(p => p.includes('src/lib/server/auth.ts') || p.includes('server/auth.ts'))).toBe(true);
  });

  it('extracts nested paths', () => {
    const s = extractQuerySignals('look at src/routes/api/retrieval/search-unified/+server.ts');
    expect(s.paths.length).toBeGreaterThan(0);
    expect(s.paths[0]).toMatch(/retrieval|search-unified|\+server/);
  });

  it('caps paths at 4', () => {
    const s = extractQuerySignals(
      'compare src/a/b.ts with src/c/d.ts and src/e/f.ts and src/g/h.ts and src/i/j.ts'
    );
    expect(s.paths.length).toBeLessThanOrEqual(4);
  });
});

describe('extractQuerySignals — error code extraction', () => {
  it('extracts TS error codes', () => {
    const s = extractQuerySignals('getting TS2345 type error on argument');
    expect(s.errorCodes).toContain('TS2345');
  });

  it('extracts ERR_ node codes', () => {
    const s = extractQuerySignals('ERR_MODULE_NOT_FOUND when importing');
    expect(s.errorCodes).toContain('ERR_MODULE_NOT_FOUND');
  });

  it('extracts short numeric error codes', () => {
    const s = extractQuerySignals('E001 database connection error');
    expect(s.errorCodes).toContain('E001');
  });

  it('caps error codes at 4', () => {
    const s = extractQuerySignals('TS1234 TS2345 TS3456 TS4567 TS5678');
    expect(s.errorCodes.length).toBeLessThanOrEqual(4);
  });
});

describe('extractQuerySignals — exact phrase extraction', () => {
  it('extracts double-quoted phrases and removes them from identifier scan', () => {
    const s = extractQuerySignals('"packet key" lookup in atlas_packets');
    expect(s.exactPhrases).toContain('packet key');
    // The phrase itself should not appear as an identifier token
    expect(s.identifiers).not.toContain('packet');
    expect(s.identifiers).not.toContain('key');
  });

  it('extracts multiple exact phrases', () => {
    const s = extractQuerySignals('"dense retrieval" and "sparse encoding"');
    expect(s.exactPhrases).toContain('dense retrieval');
    expect(s.exactPhrases).toContain('sparse encoding');
  });
});

// ---------------------------------------------------------------------------
// Combined token set — end-to-end recall baseline
//
// These represent the MINIMUM tokens a real query must produce so that the
// SQL ILIKE predicates can match. If allTokens() shrinks below the expected
// count, we've lost recall.
// ---------------------------------------------------------------------------

describe('extractQuerySignals — combined recall baselines', () => {
  it('auth query: extracts at least 2 tokens including validateSession', () => {
    const s = extractQuerySignals('how does validateSession work in auth.ts');
    const tokens = allTokens(s);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens.some(t => t === 'validateSession')).toBe(true);
  });

  it('Qdrant path query: extracts path token', () => {
    const s = extractQuerySignals('show src/lib/server/vector/qdrant-manager.ts');
    const tokens = allTokens(s);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens.some(t => t.includes('qdrant-manager') || t.includes('qdrant'))).toBe(true);
  });

  it('TypeScript error query: TS code appears in errorCodes (may also be in identifiers)', () => {
    const s = extractQuerySignals('TS2554 expected 2 arguments but got 1');
    // Critical: must be captured as an errorCode so the caller knows it's a TS diagnostic.
    // It may also appear in identifiers — the SQL predicate covers both columns either way.
    expect(s.errorCodes).toContain('TS2554');
    // Combined tokens must include it at least once
    expect(allTokens(s)).toContain('TS2554');
  });

  it('natural language query: extracts meaningful identifiers', () => {
    const s = extractQuerySignals('where is the RRF fusion implemented for search');
    const tokens = allTokens(s);
    // At minimum "fusion", "implemented", "search" should survive the filter
    expect(tokens.length).toBeGreaterThanOrEqual(2);
  });

  it('empty query: returns no tokens', () => {
    const s = extractQuerySignals('');
    expect(allTokens(s).length).toBe(0);
  });

  it('whitespace-only query: returns no tokens', () => {
    const s = extractQuerySignals('   ');
    expect(allTokens(s).length).toBe(0);
  });

  it('ACE packet key query: extracts packet key prefix tokens', () => {
    const s = extractQuerySignals('find ace:packet:auth:001 in atlas');
    const tokens = allTokens(s);
    // "atlas" should survive; "ace", "packet", "auth" depend on length filter
    expect(tokens.some(t => t === 'atlas' || t === 'auth' || t === 'packet')).toBe(true);
  });
});
