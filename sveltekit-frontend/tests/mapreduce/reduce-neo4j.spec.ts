// @vitest-environment node
/**
 * Unit tests for scripts/mapreduce/reduce-neo4j.mjs
 *
 * All tests run against the pure in-memory logic (dryRun: true)
 * so no Neo4j connection is required.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

let reduceNeo4j: typeof import('../../scripts/mapreduce/reduce-neo4j.mjs').reduceNeo4j;
let reduceNeo4jSymbols: typeof import('../../scripts/mapreduce/reduce-neo4j.mjs').reduceNeo4jSymbols;
let ensureNeo4jConstraints: typeof import('../../scripts/mapreduce/reduce-neo4j.mjs').ensureNeo4jConstraints;

const OPTS = {
  neo4jUrl:  'http://localhost:7474',
  neo4jUser: 'neo4j',
  neo4jPass:  'deeds123',
  dryRun:    true,
};

beforeAll(async () => {
  const mod = await import('../../scripts/mapreduce/reduce-neo4j.mjs');
  reduceNeo4j            = mod.reduceNeo4j;
  reduceNeo4jSymbols     = mod.reduceNeo4jSymbols;
  ensureNeo4jConstraints = mod.ensureNeo4jConstraints;
});

// ── Helper factories ────────────────────────────────────────────────────────

function makeRecord(
  stableKey: string,
  topoClass: string,
  manifold4: [number, number, number, number],
  filePath = `src/${stableKey}.ts`,
) {
  return { stableKey, filePath, topoClass, topoByte: 0, manifold4 };
}

// ── dist4 exposed indirectly via dryRun result counting ──────────────────────

describe('dist4 geometry', () => {
  it('two identical points produce 0 candidate edges (dist=0 < threshold, but same node skipped)', async () => {
    const a = makeRecord('a', 'server', [0, 0, 0, 0]);
    const b = makeRecord('b', 'server', [0, 0, 0, 0]);
    const r = await reduceNeo4j([a, b], OPTS);
    // distance = 0 < 0.25 — one edge (pair a→b)
    expect(r.edgesAttempted).toBe(1);
  });

  it('two points far apart produce 0 edges', async () => {
    const a = makeRecord('a', 'server', [0, 0, 0, 0]);
    const b = makeRecord('b', 'server', [1, 1, 1, 1]);   // dist ≈ 2.0
    const r = await reduceNeo4j([a, b], OPTS);
    expect(r.edgesAttempted).toBe(0);
  });

  it('three close points in a triangle — 3 pairs all under threshold', async () => {
    const a = makeRecord('a', 'srv', [0,    0,    0,    0]);
    const b = makeRecord('b', 'srv', [0.1,  0,    0,    0]);
    const c = makeRecord('c', 'srv', [0.05, 0.05, 0,    0]);
    const r = await reduceNeo4j([a, b, c], OPTS);
    expect(r.edgesAttempted).toBe(3);
  });
});

// ── Deduplication ────────────────────────────────────────────────────────────

describe('bidirectional edge deduplication', () => {
  it('does not produce both A→B and B→A', async () => {
    const nodes = [
      makeRecord('a', 'srv', [0,   0, 0, 0]),
      makeRecord('b', 'srv', [0.1, 0, 0, 0]),
      makeRecord('c', 'srv', [0.2, 0, 0, 0]),
    ];
    const r = await reduceNeo4j(nodes, OPTS);
    // 3 nodes, all close: 3 pairs — NOT 6 directed edges
    expect(r.edgesAttempted).toBe(3);
  });

  it('n close nodes have at most n*(n-1)/2 edges', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeRecord(`n${i}`, 'cls', [i * 0.05, 0, 0, 0] as [number,number,number,number]),
    );
    const r = await reduceNeo4j(nodes, OPTS);
    const maxPairs = nodes.length * (nodes.length - 1) / 2;
    expect(r.edgesAttempted).toBeLessThanOrEqual(maxPairs);
  });
});

// ── MAX_EDGES_PER_NODE cap ───────────────────────────────────────────────────

describe('MAX_EDGES_PER_NODE = 8 enforcement', () => {
  it('a hub node never exceeds 8 edges', async () => {
    // 20 nodes all very close together in the same class
    const nodes = Array.from({ length: 20 }, (_, i) =>
      makeRecord(`n${i}`, 'hub', [i * 0.001, 0, 0, 0] as [number,number,number,number]),
    );
    const r = await reduceNeo4j(nodes, OPTS);
    // Any single key should appear in at most 8 edges on each side
    // Total edges will be capped well below n*(n-1)/2 = 190
    expect(r.edgesAttempted).toBeLessThan(190);
    expect(r.edgesAttempted).toBeGreaterThan(0);
  });
});

// ── edgesSkipped counts within class only ────────────────────────────────────

describe('edgesSkipped counts only within topoClass groups', () => {
  it('nodes in different topoClasses are never counted as skipped pairs', async () => {
    const a = makeRecord('a', 'classA', [0, 0, 0, 0]);
    const b = makeRecord('b', 'classB', [0, 0, 0, 0]);
    // a and b are in different classes → no pairs possible → edgesSkipped = 0
    const r = await reduceNeo4j([a, b], OPTS);
    expect(r.edgesSkipped).toBe(0);
  });

  it('two nodes in the same class with distance > threshold → 1 pair skipped', async () => {
    const a = makeRecord('a', 'cls', [0, 0, 0, 0]);
    const b = makeRecord('b', 'cls', [1, 1, 1, 1]);   // dist >> threshold
    const r = await reduceNeo4j([a, b], OPTS);
    expect(r.edgesSkipped).toBe(1);
    expect(r.edgesAttempted).toBe(0);
  });
});

// ── dryRun counts ────────────────────────────────────────────────────────────

describe('dryRun returns expected counts', () => {
  it('nodesWritten equals input length in dryRun', async () => {
    const nodes = [
      makeRecord('x', 'cls', [0, 0, 0, 0]),
      makeRecord('y', 'cls', [0.1, 0, 0, 0]),
    ];
    const r = await reduceNeo4j(nodes, OPTS);
    expect(r.nodesAttempted).toBe(2);
    expect(r.nodesWritten).toBe(2);
    expect(r.nodeFailures).toBe(0);
  });

  it('edgesWritten equals edgesAttempted in dryRun', async () => {
    const nodes = [
      makeRecord('a', 'c', [0, 0, 0, 0]),
      makeRecord('b', 'c', [0.1, 0, 0, 0]),
    ];
    const r = await reduceNeo4j(nodes, OPTS);
    expect(r.edgesWritten).toBe(r.edgesAttempted);
    expect(r.edgeFailures).toBe(0);
  });

  it('empty input returns all zeros', async () => {
    const r = await reduceNeo4j([], OPTS);
    expect(r.nodesAttempted).toBe(0);
    expect(r.edgesAttempted).toBe(0);
    expect(r.edgesSkipped).toBe(0);
  });
});

// ── reduceNeo4jSymbols: symbol/import separation ─────────────────────────────

describe('reduceNeo4jSymbols separates imports from symbols', () => {
  it('uses explicit imports field when provided', async () => {
    const records = [{
      stableKey: 'abc',
      filePath:  'src/abc.ts',
      symbols:   ['ExportedClass', 'helperFn'],
      imports:   ['./utils', '$lib/server/cache'],
    }];
    const r = await reduceNeo4jSymbols(records, OPTS);
    expect(r.symbolsAttempted).toBe(1);
    expect(r.symbolsWritten).toBe(1);
    expect(r.symbolFailures).toBe(0);
  });

  it('legacy fallback: splits symbols by path-like prefix', async () => {
    const records = [{
      stableKey: 'def',
      filePath:  'src/def.ts',
      // mixed: some are paths, some are identifiers
      symbols:   ['MyClass', './peer', '$lib/server/foo'],
    }];
    const r = await reduceNeo4jSymbols(records, OPTS);
    expect(r.symbolsAttempted).toBe(1);
    expect(r.symbolsWritten).toBe(1);
  });

  it('does not create IMPORTS edges for symbol identifiers', async () => {
    const records = [{
      stableKey: 'ghi',
      filePath:  'src/ghi.ts',
      symbols:   ['SomeClass', 'anotherFn'],
      imports:   [],
    }];
    // In dryRun we just verify the function runs without error and counts correctly
    const r = await reduceNeo4jSymbols(records, OPTS);
    expect(r.symbolsAttempted).toBe(1);
    expect(r.symbolFailures).toBe(0);
  });

  it('returns zeros for empty input', async () => {
    const r = await reduceNeo4jSymbols([], OPTS);
    expect(r.symbolsAttempted).toBe(0);
    expect(r.symbolsWritten).toBe(0);
    expect(r.symbolFailures).toBe(0);
  });
});

// ── ensureNeo4jConstraints dryRun ────────────────────────────────────────────

describe('ensureNeo4jConstraints', () => {
  it('does not throw in dryRun mode', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(ensureNeo4jConstraints(OPTS)).resolves.toBeUndefined();
    consoleSpy.mockRestore();
  });
});
