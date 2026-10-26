import { describe, expect, it } from 'vitest';
import { buildHypergraphViewV1, type HyperedgeRowV1 } from './hypergraph-graph-view-v1.js';
import { readGraphViewV1 } from './graph-view-service-v1.js';

const REV = `sha256:${'a'.repeat(64)}`;
const edge = (key: string, file: string, concept: string): HyperedgeRowV1 => ({
  key,
  relationKind: 'EVENT_DISPATCH',
  arity: 3,
  sourceRef: file,
  sourceRevision: REV,
  members: [
    { memberId: file, role: 'CONTAINER_FILE', ordinal: 0 },
    { memberId: `svelte-span:${file}#handler@1-9`, role: 'SYNTAX_NODE', ordinal: 1 },
    { memberId: concept, role: 'HANDLER_TARGET', ordinal: 2 },
  ],
});

describe('buildHypergraphViewV1', () => {
  it('reifies each hyperedge as one node with one participant edge per member', () => {
    const p = buildHypergraphViewV1({ snapshotId: 's', queryId: 'q', hyperedges: [edge('he_1', 'a/A.svelte', 'event:click')] });
    expect(p.view).toBe('HYPERGRAPH');
    expect(p.executor).toBe('neo4j');
    expect(p.nodes.filter((n) => n.type === 'Hyperedge')).toHaveLength(1);
    expect(p.edges).toHaveLength(3);
    expect(p.edges.every((e) => e.type === 'HAS_PARTICIPANT')).toBe(true);
  });

  it('keeps every node and edge PROPOSED (the mirror is not canonical)', () => {
    const p = buildHypergraphViewV1({ snapshotId: 's', queryId: 'q', hyperedges: [edge('he_1', 'a/A.svelte', 'event:click')] });
    expect(p.nodes.every((n) => n.qualification === 'PROPOSED')).toBe(true);
    expect(p.edges.every((e) => e.qualification === 'PROPOSED')).toBe(true);
    expect(p.nodes.find((n) => n.type === 'Hyperedge')?.properties.canonicalAuthority).toBe(false);
  });

  it('shares a member node across hyperedges instead of duplicating it', () => {
    const p = buildHypergraphViewV1({
      snapshotId: 's',
      queryId: 'q',
      hyperedges: [edge('he_1', 'a/A.svelte', 'event:click'), edge('he_2', 'a/B.svelte', 'event:click')],
    });
    expect(p.nodes.filter((n) => n.id === 'member:event:click')).toHaveLength(1);
    expect(p.edges).toHaveLength(6);
  });

  it('drops hyperedges below arity 3 and never admits a partial hyperedge when truncating', () => {
    const binary: HyperedgeRowV1 = { ...edge('he_b', 'a/C.svelte', 'x'), arity: 2, members: edge('he_b', 'a/C.svelte', 'x').members.slice(0, 2) };
    const p = buildHypergraphViewV1({
      snapshotId: 's',
      queryId: 'q',
      maxNodes: 5,
      hyperedges: [binary, edge('he_1', 'a/A.svelte', 'event:click'), edge('he_2', 'a/B.svelte', 'event:keydown')],
    });
    expect(p.truncated).toBe(true);
    expect(p.nodes.length).toBeLessThanOrEqual(5);
    const edgeNodes = p.nodes.filter((n) => n.type === 'Hyperedge');
    expect(edgeNodes).toHaveLength(1);
    expect(p.edges).toHaveLength(3);
  });
});

describe('readGraphViewV1 HYPERGRAPH', () => {
  it('degrades with the uniform envelope when no loader is configured', async () => {
    const { status, body } = await readGraphViewV1({ view: 'HYPERGRAPH' }, {});
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: false, view: 'HYPERGRAPH', packet: null, rejected: [], degraded: true, reason: 'LOADER_NOT_CONFIGURED' });
  });

  it('returns a bounded packet from an injected loader and degrades when the loader throws', async () => {
    const ok = await readGraphViewV1({ view: 'HYPERGRAPH', limit: 50 }, { hypergraph: async () => [edge('he_1', 'a/A.svelte', 'event:click')] });
    expect(ok.body.ok).toBe(true);
    expect(ok.body.packet?.nodes.length).toBe(4);
    const bad = await readGraphViewV1({ view: 'HYPERGRAPH' }, { hypergraph: async () => { throw new Error('NEO4J_DOWN'); } });
    expect(bad.status).toBe(200);
    expect(bad.body).toMatchObject({ ok: false, degraded: true, reason: 'NEO4J_DOWN' });
  });
});
