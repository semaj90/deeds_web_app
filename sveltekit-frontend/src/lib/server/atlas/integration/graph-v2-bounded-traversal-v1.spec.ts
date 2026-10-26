import { describe, expect, it, vi } from 'vitest';
import { executeGraphV2BoundedTraversalV1 } from './graph-v2-bounded-traversal-v1.js';
import type { GraphV2FanoutCandidateV1, GraphV2FanoutSeedV1 } from './graph-v2-retrieval-fanout-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const graphRevision = 'c'.repeat(64);
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const seed: GraphV2FanoutSeedV1 = { packetKey: 'packet:seed', sourceRef: 'src/seed.ts', sourceRevision };

function hit(packetKey: string, relationId: string, overrides: Partial<GraphV2FanoutCandidateV1> = {}): GraphV2FanoutCandidateV1 {
  return {
    packetKey,
    sourceRef: `src/${packetKey.slice('packet:'.length)}.ts`,
    sourceRevision,
    workspaceRevision,
    graphRevision,
    relationId,
    relationKind: 'CALLS',
    relationConfidence: 0.8,
    ...overrides,
  };
}

describe('executeGraphV2BoundedTraversalV1', () => {
  it('expands bounded multi-hop paths and preserves each relation in the path', async () => {
    const reader = vi.fn(async ({ seeds }: { seeds: readonly GraphV2FanoutSeedV1[] }) => {
      if (seeds.some((item) => item.packetKey === 'packet:seed')) return [hit('packet:middle', 'edge:1')];
      if (seeds.some((item) => item.packetKey === 'packet:middle')) return [hit('packet:leaf', 'edge:2')];
      return [];
    });
    const result = await executeGraphV2BoundedTraversalV1({ seeds: [seed], workspaceRevision, graphRevision }, { read: reader });
    expect(result).toHaveLength(2);
    expect(result.map((item) => [item.packetKey, item.traversalDepth, item.relationPathIds])).toEqual([
      ['packet:middle', 1, ['edge:1']],
      ['packet:leaf', 2, ['edge:1', 'edge:2']],
    ]);
    expect(result[1]?.relationConfidence).toBeCloseTo(0.64);
    expect(reader).toHaveBeenCalledTimes(3);
    expect(reader.mock.calls.every(([input]) => input.workspaceRevision === workspaceRevision && input.graphRevision === graphRevision)).toBe(true);
  });

  it('rejects stale-revision hits and does not traverse them', async () => {
    const reader = vi.fn(async () => [hit('packet:stale', 'edge:stale', { workspaceRevision: `sha256:${'d'.repeat(64)}` })]);
    const result = await executeGraphV2BoundedTraversalV1({ seeds: [seed], workspaceRevision, graphRevision }, { read: reader });
    expect(result).toEqual([]);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('keeps the strongest deterministic same-depth relation path for a packet', async () => {
    const reader = vi.fn(async ({ seeds }: { seeds: readonly GraphV2FanoutSeedV1[] }) => {
      const packetKey = seeds[0]?.packetKey;
      if (packetKey === 'packet:seed') return [
        hit('packet:left', 'edge:left', { relationConfidence: 0.5 }),
        hit('packet:right', 'edge:right', { relationConfidence: 0.9 }),
      ];
      if (packetKey === 'packet:left') return [hit('packet:target', 'edge:target-left', { relationConfidence: 0.5 })];
      if (packetKey === 'packet:right') return [hit('packet:target', 'edge:target-right', { relationConfidence: 0.9 })];
      return [];
    });

    const result = await executeGraphV2BoundedTraversalV1({ seeds: [seed], workspaceRevision, graphRevision }, { read: reader });
    const target = result.find((candidate) => candidate.packetKey === 'packet:target');
    expect(target?.traversalDepth).toBe(2);
    expect(target?.relationConfidence).toBeCloseTo(0.81);
    expect(target?.relationPathIds).toEqual(['edge:right', 'edge:target-right']);
  });

  it('selects the strongest candidates across the bounded layer before applying the limit', async () => {
    const reader = vi.fn(async () => [
      hit('packet:weak', 'edge:weak', { relationConfidence: 0.1 }),
      hit('packet:strong', 'edge:strong', { relationConfidence: 0.9 }),
      hit('packet:middle', 'edge:middle', { relationConfidence: 0.5 }),
    ]);

    const result = await executeGraphV2BoundedTraversalV1(
      { seeds: [seed], workspaceRevision, graphRevision, limit: 2 },
      { read: reader },
    );
    expect(result.map((candidate) => candidate.packetKey)).toEqual(['packet:strong', 'packet:middle']);
  });

  it('terminates cycles and enforces depth and candidate bounds', async () => {
    const reader = vi.fn(async ({ seeds }: { seeds: readonly GraphV2FanoutSeedV1[] }) =>
      seeds.map((item) => hit(item.packetKey === 'packet:seed' ? 'packet:middle' : 'packet:seed', 'edge:cycle')));
    const result = await executeGraphV2BoundedTraversalV1({
      seeds: [seed], workspaceRevision, graphRevision, maxDepth: 3, limit: 4,
    }, { read: reader });
    expect(result.map((item) => item.packetKey)).toEqual(['packet:middle']);
    expect(reader).toHaveBeenCalledTimes(2);
  });
});
