// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Inline the helpers under test (mirrors trace-mcp-server.ts exactly)
function clampNumber(value: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeJsonFilter(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([k, v]) => k.length < 64 && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

describe('clampNumber', () => {
  it('clamps som_x/som_y within 0-255', () => {
    expect(clampNumber(-10, 0, 255)).toBe(0);
    expect(clampNumber(300, 0, 255)).toBe(255);
    expect(clampNumber(128, 0, 255)).toBe(128);
  });

  it('clamps semantic_z/grpo_w within -1 to 1', () => {
    expect(clampNumber(2.5, -1, 1, 0.5)).toBe(1);
    expect(clampNumber(-3, -1, 1, 0.5)).toBe(-1);
    expect(clampNumber(0.7, -1, 1, 0.5)).toBeCloseTo(0.7);
  });

  it('returns fallback for non-finite inputs', () => {
    expect(clampNumber(NaN,      0, 255, 0)).toBe(0);
    expect(clampNumber(Infinity, 0, 255, 0)).toBe(0);   // Infinity → fallback (not-finite)
    expect(clampNumber('bad',    0, 255, 99)).toBe(99);
    expect(clampNumber(undefined, 0, 255, 42)).toBe(42);
    // null coerces to 0 (finite) → clamped to min=0
    expect(clampNumber(null, 0, 255, 7)).toBe(0);
  });

  it('clamps limit within 1-50', () => {
    expect(clampNumber(0, 1, 50, 10)).toBe(1);
    expect(clampNumber(100, 1, 50, 10)).toBe(50);
    expect(clampNumber(20, 1, 50, 10)).toBe(20);
  });
});

describe('normalizeJsonFilter', () => {
  it('returns undefined for non-object inputs', () => {
    expect(normalizeJsonFilter(null)).toBeUndefined();
    expect(normalizeJsonFilter(undefined)).toBeUndefined();
    expect(normalizeJsonFilter('string')).toBeUndefined();
    expect(normalizeJsonFilter([])).toBeUndefined();
    expect(normalizeJsonFilter(42)).toBeUndefined();
  });

  it('returns undefined for empty filter', () => {
    expect(normalizeJsonFilter({})).toBeUndefined();
  });

  it('allows scalar string/number/boolean values', () => {
    const result = normalizeJsonFilter({ topo_class: 'server', limit: 5, active: true });
    expect(result).toEqual({ topo_class: 'server', limit: 5, active: true });
  });

  it('strips nested objects and arrays', () => {
    const result = normalizeJsonFilter({
      valid: 'yes',
      nested: { x: 1 },
      arr: [1, 2, 3],
      num: 42,
    });
    expect(result).toEqual({ valid: 'yes', num: 42 });
  });

  it('strips keys longer than 63 characters', () => {
    const longKey = 'a'.repeat(64);
    const result = normalizeJsonFilter({ [longKey]: 'value', short: 'ok' });
    expect(result).toEqual({ short: 'ok' });
  });

  it('returns undefined when all entries are stripped', () => {
    const result = normalizeJsonFilter({ nested: { x: 1 }, arr: [1] });
    expect(result).toBeUndefined();
  });
});

describe('topology.search_4d input shapes', () => {
  it('builds safe body with clamped coords', () => {
    const som_x = clampNumber(300, 0, 255);
    const som_y = clampNumber(-5, 0, 255);
    const semantic_z = clampNumber(2.0, -1, 1, 0.5);
    const grpo_w = clampNumber(-2.0, -1, 1, 0.5);
    const limit = clampNumber(200, 1, 50, 10);
    expect(som_x).toBe(255);
    expect(som_y).toBe(0);
    expect(semantic_z).toBe(1);
    expect(grpo_w).toBe(-1);
    expect(limit).toBe(50);
  });
});

describe('search.go_hybrid input shapes', () => {
  it('clamps limit and normalizes filters', () => {
    expect(clampNumber(100, 1, 50, 10)).toBe(50);
    expect(clampNumber(0, 1, 50, 10)).toBe(1);
    const filters = normalizeJsonFilter({ collection: 'legal', nested: { bad: true } });
    expect(filters).toEqual({ collection: 'legal' });
  });

  it('handles missing filters gracefully', () => {
    expect(normalizeJsonFilter(undefined)).toBeUndefined();
    expect(normalizeJsonFilter(null)).toBeUndefined();
  });
});
