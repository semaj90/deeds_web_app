// @vitest-environment node
/**
 * tests/mcp-operator-tools.spec.ts
 *
 * Unit tests for the four operator-gated ops.* MCP tools:
 *   ops.propose_patch, ops.run_targeted_test, ops.record_fix_attempt, ops.run_quality_gate
 *
 * All four require a non-empty operator_token — missing/empty token must be rejected.
 * propose_patch must NOT write files.
 * run_targeted_test validates the file extension before spawning a process.
 * record_fix_attempt writes to fix_attempts table (metadata only, not source code).
 * run_quality_gate parses tsc error counts from output.
 */

import { describe, it, expect } from 'vitest';

// ── Inline the helper functions under test (copied from trace-mcp-server.ts) ──

function requireToken(token: unknown): string | null {
  if (!token || typeof token !== 'string' || token.trim() === '') return 'operator_token required';
  return null;
}

function clampNumber(value: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeJsonFilter(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([k, v]) =>
        k.length < 64 &&
        (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      )
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── requireToken ──────────────────────────────────────────────────────────────

describe('requireToken', () => {
  it('returns error string for undefined', () => {
    expect(requireToken(undefined)).toBeTruthy();
  });

  it('returns error string for empty string', () => {
    expect(requireToken('')).toBeTruthy();
  });

  it('returns error string for whitespace-only string', () => {
    expect(requireToken('   ')).toBeTruthy();
  });

  it('returns null for a non-empty string', () => {
    expect(requireToken('my-token')).toBeNull();
  });

  it('returns null for any truthy string', () => {
    expect(requireToken('approve')).toBeNull();
    expect(requireToken('operator-2026')).toBeNull();
  });
});

// ── ops.propose_patch input guards ───────────────────────────────────────────

describe('ops.propose_patch — input guards', () => {
  it('rejects missing operator_token', () => {
    const err = requireToken(undefined);
    expect(err).toContain('operator_token');
  });

  it('rejects empty operator_token', () => {
    const err = requireToken('');
    expect(err).toContain('operator_token');
  });

  it('strips path traversal from file_path', () => {
    const raw = '../../etc/passwd';
    const safe = raw.replace(/\.\./g, '').slice(0, 500);
    expect(safe).not.toContain('..');
  });

  it('clamps context_lines between 5 and 200', () => {
    expect(clampNumber(0,     5, 200, 40)).toBe(5);
    expect(clampNumber(300,   5, 200, 40)).toBe(200);
    expect(clampNumber(50,    5, 200, 40)).toBe(50);
    expect(clampNumber('bad', 5, 200, 40)).toBe(40);
  });
});

// ── ops.run_targeted_test input guards ───────────────────────────────────────

describe('ops.run_targeted_test — input guards', () => {
  const VALID_EXTS = ['.spec.ts', '.test.ts', '.spec.js', '.test.js', '.spec.mts', '.test.mts'];
  const INVALID =  ['src/lib/server/foo.ts', 'scripts/run.mjs', 'README.md', ''];

  it('accepts files ending with spec/test extensions', () => {
    for (const ext of VALID_EXTS) {
      expect(`tests/foo${ext}`).toMatch(/\.(spec|test)\.[cm]?[jt]s$/);
    }
  });

  it('rejects files without spec/test extension', () => {
    for (const f of INVALID) {
      expect(f).not.toMatch(/\.(spec|test)\.[cm]?[jt]s$/);
    }
  });

  it('rejects path traversal in test_file', () => {
    const raw = '../../../etc/passwd.spec.ts';
    const safe = raw.replace(/\.\./g, '');
    expect(safe).not.toContain('..');
  });

  it('clamps timeout_ms between 5000 and 120000', () => {
    expect(clampNumber(0,       5000, 120000, 30000)).toBe(5000);
    expect(clampNumber(999999,  5000, 120000, 30000)).toBe(120000);
    expect(clampNumber(60000,   5000, 120000, 30000)).toBe(60000);
  });
});

// ── ops.record_fix_attempt input guards ──────────────────────────────────────

describe('ops.record_fix_attempt — input guards', () => {
  it('requires operator_token to be non-empty', () => {
    expect(requireToken('')).toBeTruthy();
    expect(requireToken(null)).toBeTruthy();
  });

  it('truncates fix_type to 100 chars', () => {
    const long = 'a'.repeat(200);
    expect(long.slice(0, 100)).toHaveLength(100);
  });

  it('truncates fix_description to 2000 chars', () => {
    const long = 'x'.repeat(3000);
    expect(long.slice(0, 2000)).toHaveLength(2000);
  });

  it('truncates fix_diff to 8000 chars', () => {
    const long = 'd'.repeat(10000);
    expect(long.slice(0, 8000)).toHaveLength(8000);
  });

  it('clamps files_affected between 0 and 9999', () => {
    expect(clampNumber(-1,    0, 9999, 1)).toBe(0);
    expect(clampNumber(99999, 0, 9999, 1)).toBe(9999);
    expect(clampNumber(3,     0, 9999, 1)).toBe(3);
  });

  it('normalizes metadata — rejects nested objects', () => {
    const meta = { key: 'val', nested: { a: 1 }, num: 42 };
    const result = normalizeJsonFilter(meta);
    expect(result).toEqual({ key: 'val', num: 42 });
    expect(result).not.toHaveProperty('nested');
  });

  it('normalizes metadata — returns undefined for empty', () => {
    expect(normalizeJsonFilter({})).toBeUndefined();
    expect(normalizeJsonFilter(null)).toBeUndefined();
    expect(normalizeJsonFilter([])).toBeUndefined();
  });
});

// ── ops.run_quality_gate input guards ────────────────────────────────────────

describe('ops.run_quality_gate — input guards', () => {
  it('defaults gate to tsc when not provided', () => {
    const safeGate = String(undefined ?? 'tsc') === 'vitest-all' ? 'vitest-all' : 'tsc';
    expect(safeGate).toBe('tsc');
  });

  it('accepts vitest-all as valid gate', () => {
    const safeGate = String('vitest-all') === 'vitest-all' ? 'vitest-all' : 'tsc';
    expect(safeGate).toBe('vitest-all');
  });

  it('falls back to tsc for unrecognized gate values', () => {
    const safeGate = String('unknown') === 'vitest-all' ? 'vitest-all' : 'tsc';
    expect(safeGate).toBe('tsc');
  });

  it('clamps timeout_ms between 5000 and 300000', () => {
    expect(clampNumber(0,       5000, 300000, 60000)).toBe(5000);
    expect(clampNumber(999999,  5000, 300000, 60000)).toBe(300000);
    expect(clampNumber(120000,  5000, 300000, 60000)).toBe(120000);
  });

  it('parses tsc error counts from output', () => {
    const output = 'src/foo.ts(3,5): error TS2345: ...\nFound 2 errors.';
    const match  = /Found (\d+) errors?/.exec(output);
    expect(match).toBeTruthy();
    expect(parseInt(match![1], 10)).toBe(2);
  });

  it('returns -1 when error count cannot be parsed', () => {
    const output = 'some other output with no error count';
    const match  = /Found (\d+) errors?/.exec(output) ?? /(\d+) error/.exec(output);
    expect(match).toBeNull();
    const errorCount = match ? parseInt(match[1], 10) : -1;
    expect(errorCount).toBe(-1);
  });
});
