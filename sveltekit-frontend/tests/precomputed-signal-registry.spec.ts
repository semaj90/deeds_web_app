import { describe, expect, it } from 'vitest';
import { resolvePrecomputedSignal } from '../src/lib/server/atlas/runtime/precomputed-signal-registry.js';

const signal = {
  signal: 'pagerank_global' as const,
  value: 0.72,
  packetKey: 'P1',
  sourceRef: 'src/a.ts',
  revisions: { workspaceRevision: '742', graphRevision: '338' },
  executor: 'networkx',
};

describe('resolvePrecomputedSignal', () => {
  it('reuses a revision-matching precomputed signal', () => {
    const result = resolvePrecomputedSignal({
      signal: 'pagerank_global',
      packetKey: 'P1',
      sourceRef: 'src/a.ts',
      revisions: { workspaceRevision: '742', graphRevision: '338' },
    }, [signal]);
    expect(result.status).toBe('REUSE');
  });

  it('marks graph-revision mismatches stale rather than recomputing or zeroing', () => {
    const result = resolvePrecomputedSignal({
      signal: 'pagerank_global',
      packetKey: 'P1',
      sourceRef: 'src/a.ts',
      revisions: { workspaceRevision: '742', graphRevision: '339' },
    }, [signal]);
    expect(result.status).toBe('STALE');
  });
});
