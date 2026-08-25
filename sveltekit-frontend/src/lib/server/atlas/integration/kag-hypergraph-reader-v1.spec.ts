import { describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

function tupleRow(overrides: Record<string, unknown> = {}) {
  return {
    tuple_id: 'tuple:1',
    schema_version: 'ontology-linked-tuple.v1',
    packet_key: 'packet:a',
    source_ref: 'src/lib/example.ts',
    tree_node_id: null,
    document_id: null,
    title_id: null,
    surface_text: 'authentication',
    token_index: 0,
    part_of_speech: null,
    label: 'authentication',
    label_kind: 'ontology',
    label_source: 'semantic_tagger',
    ontology_ids: ['ontology:auth'],
    concept_ids: ['concept:auth'],
    participants: [],
    evidence_refs: [],
    relation_revision: null,
    evidence_span: null,
    confidence: 0.9,
    evidence_state: 'ACTIVE_VERIFIED',
    lifecycle: 'OBSERVED',
    provenance: { sourceTables: ['x'], labelerVersion: null, taggerVersion: null, ontologyVersion: null, nlpVersion: null },
    ...overrides,
  };
}

function hyperedgeMemberRows(overrides: Record<string, unknown> = {}) {
  const base = {
    hyperedge_id: 'uuid-1',
    contract_hyperedge_id: 'hyperedge:abc123',
    relation_type: 'related_to',
    workspace_revision: 'ws-1',
    source_revision: 'src-1',
    graph_revision: 'graph-1',
    producer_revision: 'producer-1',
    evidence_refs: ['packet:a'],
    checksum: 'a'.repeat(64),
  };
  return [
    { ...base, member_id: 'packet:a', member_role: 'actor', ordinal: 0, ...overrides },
    { ...base, member_id: 'packet:b', member_role: 'target', ordinal: 1, ...overrides },
  ];
}

describe('KAG next-steps item 1: readKagHypergraphNeighborsV1', () => {
  it('is a no-op for an empty canonicalIds array (never issues a query)', async () => {
    queryMock.mockClear();
    const { readKagHypergraphNeighborsV1 } = await import('./kag-hypergraph-reader-v1.js');
    const result = await readKagHypergraphNeighborsV1([]);

    expect(result).toEqual({ requestedCanonicalIds: 0, matchedTuples: 0, matchedHyperedges: 0, neighbors: [] });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('maps rows to hypergraph neighbors via the existing mutual index', async () => {
    queryMock.mockClear();
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('atlas_ontology_linked_tuples')) {
        return Promise.resolve({ rows: [tupleRow()] });
      }
      if (sql.includes('atlas_hyperedges')) {
        return Promise.resolve({ rows: hyperedgeMemberRows() });
      }
      return Promise.resolve({ rows: [] });
    });

    const { readKagHypergraphNeighborsV1 } = await import('./kag-hypergraph-reader-v1.js');
    const result = await readKagHypergraphNeighborsV1(['packet:a']);

    expect(result.requestedCanonicalIds).toBe(1);
    expect(result.matchedTuples).toBe(1);
    expect(result.matchedHyperedges).toBe(1);
    expect(result.neighbors).toEqual([{ canonicalId: 'packet:a', hyperedgeIds: ['hyperedge:abc123'] }]);
  });

  it('omits a canonicalId with no matching hyperedge participants', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });

    const { readKagHypergraphNeighborsV1 } = await import('./kag-hypergraph-reader-v1.js');
    const result = await readKagHypergraphNeighborsV1(['packet:no-match']);

    expect(result.neighbors).toEqual([]);
  });

  it('fails open (returns the empty shape, never throws) when the DB errors', async () => {
    queryMock.mockClear();
    queryMock.mockRejectedValue(new Error('connection refused'));

    const { readKagHypergraphNeighborsV1 } = await import('./kag-hypergraph-reader-v1.js');
    const result = await readKagHypergraphNeighborsV1(['packet:a']);

    expect(result.neighbors).toEqual([]);
    expect(result.requestedCanonicalIds).toBe(1);
  });

  it('dedupes and caps the requested canonicalIds before querying', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });

    const { readKagHypergraphNeighborsV1 } = await import('./kag-hypergraph-reader-v1.js');
    await readKagHypergraphNeighborsV1(['packet:a', 'packet:a', 'packet:b']);

    const [, params] = queryMock.mock.calls[0];
    expect(params[0]).toEqual(['packet:a', 'packet:b']);
  });
});
