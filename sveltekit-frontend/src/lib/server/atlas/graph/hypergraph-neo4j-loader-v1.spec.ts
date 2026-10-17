import { describe, expect, it } from 'vitest';
import {
  HYPERGRAPH_LOAD_CYPHER,
  hyperedgeLimitForNodes,
  loadHypergraphRowsV1,
  type HypergraphSessionLikeV1,
} from './hypergraph-neo4j-loader-v1.js';
import { readGraphViewV1 } from './graph-view-service-v1.js';

const REV = `sha256:${'b'.repeat(64)}`;
const neoInt = (n: number) => ({ toNumber: () => n }); // neo4j-driver Integer stand-in

const record = (over: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = {
    key: 'he_v1_abc',
    relationKind: 'EVENT_DISPATCH',
    arity: neoInt(3),
    sourceRef: 'a/A.svelte',
    sourceRevision: REV,
    members: [
      { memberId: 'a/A.svelte', role: 'CONTAINER_FILE', ordinal: neoInt(0) },
      { memberId: 'svelte-span:a/A.svelte#handler@1-9', role: 'SYNTAX_NODE', ordinal: neoInt(1) },
      { memberId: 'event:click', role: 'HANDLER_TARGET', ordinal: neoInt(2) },
    ],
    ...over,
  };
  return { get: (k: string) => data[k] };
};

function fakeSession(records: Array<ReturnType<typeof record>>, fail?: Error) {
  const calls: Array<{ cypher: string; params: Record<string, unknown> }> = [];
  const state = { closed: 0, opened: 0 };
  const open = (): HypergraphSessionLikeV1 => {
    state.opened += 1;
    return {
      async run(cypher, params) {
        calls.push({ cypher, params });
        if (fail) throw fail;
        return { records };
      },
      async close() {
        state.closed += 1;
      },
    };
  };
  return { open, calls, state };
}

describe('loadHypergraphRowsV1', () => {
  it('maps Neo4j rows (including Integer values) to bounded hyperedge rows and closes the session', async () => {
    const s = fakeSession([record()]);
    const rows = await loadHypergraphRowsV1({ limit: 100 }, s.open);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'he_v1_abc', arity: 3, sourceRevision: REV });
    expect(rows[0]!.members.map((m) => m.ordinal)).toEqual([0, 1, 2]);
    expect(s.state).toEqual({ opened: 1, closed: 1 });
  });

  it('passes a bounded LIMIT and a null filter when q is absent or empty', async () => {
    const s = fakeSession([]);
    await loadHypergraphRowsV1({ limit: 200 }, s.open);
    await loadHypergraphRowsV1({ limit: 3, q: '' }, s.open);
    expect(s.calls[0]!.params).toEqual({ q: null, lim: 50 });
    expect(s.calls[1]!.params).toEqual({ q: null, lim: 1 });
    expect(hyperedgeLimitForNodes(1)).toBe(1);
  });

  it('only ever sends a read-only query that stays parameterized', () => {
    expect(HYPERGRAPH_LOAD_CYPHER).not.toMatch(/\b(CREATE|MERGE|DELETE|SET|REMOVE|DROP|CALL)\b/i);
    expect(HYPERGRAPH_LOAD_CYPHER).toContain('LIMIT toInteger($lim)');
    expect(HYPERGRAPH_LOAD_CYPHER).toContain('$q');
  });

  it('returns an empty list for an empty hypergraph', async () => {
    const s = fakeSession([]);
    await expect(loadHypergraphRowsV1({ limit: 40, q: 'event:click' }, s.open)).resolves.toEqual([]);
    expect(s.calls[0]!.params.q).toBe('event:click');
  });

  it('closes the session when Neo4j fails and rethrows', async () => {
    const s = fakeSession([], new Error('NEO4J_DOWN'));
    await expect(loadHypergraphRowsV1({ limit: 40 }, s.open)).rejects.toThrow('NEO4J_DOWN');
    expect(s.state.closed).toBe(1);
  });
});

describe('HYPERGRAPH through readGraphViewV1 with the Neo4j loader', () => {
  it('returns a PROPOSED, neo4j-executed packet for loader rows', async () => {
    const s = fakeSession([record()]);
    const { status, body } = await readGraphViewV1(
      { view: 'HYPERGRAPH', limit: 40 },
      { hypergraph: (req) => loadHypergraphRowsV1(req, s.open) },
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, view: 'HYPERGRAPH', degraded: false, reason: null });
    expect(body.packet?.executor).toBe('neo4j');
    expect(body.packet?.nodes.every((n) => n.qualification === 'PROPOSED')).toBe(true);
    // Member ids are provisional span ids, never presented as tn_v1_ identities.
    expect(body.packet?.nodes.some((n) => n.id.includes('tn_v1_'))).toBe(false);
  });

  it('degrades with the uniform envelope when Neo4j is unavailable', async () => {
    const s = fakeSession([], new Error('NEO4J_DOWN'));
    const { status, body } = await readGraphViewV1(
      { view: 'HYPERGRAPH' },
      { hypergraph: (req) => loadHypergraphRowsV1(req, s.open) },
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: false, view: 'HYPERGRAPH', packet: null, rejected: [], degraded: true, reason: 'NEO4J_DOWN' });
  });

  it('returns an empty but valid packet for an empty hypergraph', async () => {
    const s = fakeSession([]);
    const { body } = await readGraphViewV1({ view: 'HYPERGRAPH' }, { hypergraph: (req) => loadHypergraphRowsV1(req, s.open) });
    expect(body.ok).toBe(true);
    expect(body.packet).toMatchObject({ nodes: [], edges: [], truncated: false });
  });

  it('rejects unknown and over-limit parameters before any Neo4j access', async () => {
    const s = fakeSession([record()]);
    const loaders = { hypergraph: (req: Parameters<typeof loadHypergraphRowsV1>[0]) => loadHypergraphRowsV1(req, s.open) };
    const tooBig = await readGraphViewV1({ view: 'HYPERGRAPH', limit: 5000 }, loaders);
    const extra = await readGraphViewV1({ view: 'HYPERGRAPH', cypher: 'MATCH (n) DETACH DELETE n' }, loaders);
    expect(tooBig.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(tooBig.body.reason).toMatch(/^INVALID_REQUEST/);
    expect(s.state.opened).toBe(0);
  });

  it('drops a hyperedge whose participants did not all resolve instead of inventing members', async () => {
    const partial = record({ arity: neoInt(3), members: [{ memberId: 'a/A.svelte', role: 'CONTAINER_FILE', ordinal: neoInt(0) }] });
    const s = fakeSession([partial]);
    const { body } = await readGraphViewV1({ view: 'HYPERGRAPH' }, { hypergraph: (req) => loadHypergraphRowsV1(req, s.open) });
    expect(body.ok).toBe(true);
    expect(body.packet?.nodes).toHaveLength(0);
  });
});
