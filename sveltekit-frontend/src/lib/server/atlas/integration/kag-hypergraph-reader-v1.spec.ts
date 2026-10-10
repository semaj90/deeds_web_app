import { describe, expect, it, vi } from 'vitest';
import { buildPacketIncidenceLineageV1 } from '../lineage/packet-incidence-lineage-v1.js';

const queryMock = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock('../identity/packet-identity-resolver.js', () => ({
  resolvePacketKeyResolutionV2: async (key: string) => {
    const identities: Record<string, string> = {
      'packet:0123456789ab': 'packet:00000000-0000-5000-8000-000000000001',
      'packet:abcdef012345': 'packet:00000000-0000-5000-8000-000000000002',
    };
    const canonicalPacketKey = identities[key];
    if (!canonicalPacketKey) throw new Error('unresolved');
    return { canonicalPacketKey, storagePacketKey: key, resolutionSource: 'LEGACY_ALIAS', aliasEvidenceVersion: 'PACKET_KEY_V1_STORAGE_TO_V2@1' };
  },
}));

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

function packetIncidenceRows(overrides: Record<string, unknown> = {}) {
  const packet = {
    packetKey: 'packet:0123456789ab',
    canonicalId: 'packet:00000000-0000-5000-8000-000000000001',
    sourceRevision: 'source-a-r1',
  };
  const neighbor = {
    packetKey: 'packet:abcdef012345',
    canonicalId: 'packet:00000000-0000-5000-8000-000000000002',
    sourceRevision: 'source-b-r1',
  };
  const lineage = buildPacketIncidenceLineageV1({
    ...packet,
    neighborPacketKey: neighbor.packetKey,
    neighborCanonicalId: neighbor.canonicalId,
    neighborSourceRevision: neighbor.sourceRevision,
    edgeType: 'IMPORTS',
    workspaceRevision: 'ws-1',
    graphRevision: 'graph-1',
    producerId: 'graphify-packet-incidence-projection-v1',
    producerRevision: 'graphify-packet-incidence-projection-v1@1',
    evidenceRefs: ['source-span:src/a.ts:1-2', 'graph-edge:reference-1'],
  });
  const row = {
    lineage_checksum: lineage.lineageChecksum,
    input_checksum: lineage.inputChecksum,
    packet_key: lineage.packetKey,
    canonical_id: lineage.canonicalId,
    source_revision: lineage.sourceRevision,
    neighbor_packet_key: lineage.neighborPacketKey,
    neighbor_canonical_id: lineage.neighborCanonicalId,
    neighbor_source_revision: lineage.neighborSourceRevision,
    edge_type: lineage.edgeType,
    workspace_revision: lineage.workspaceRevision,
    graph_revision: lineage.graphRevision,
    producer_id: lineage.producerId,
    producer_revision: lineage.producerRevision,
    evidence_refs: lineage.evidenceRefs,
    lineage,
  };
  return {
    lineage,
    row: { ...row, ...overrides },
  };
}

function endpointRows() {
  return { rows: [
    { packet_key: 'packet:0123456789ab', source_ref: 'src/a.ts', source_revision: 'source-a-r1', workspace_revision_key: 'ws-1' },
    { packet_key: 'packet:abcdef012345', source_ref: 'src/b.ts', source_revision: 'source-b-r1', workspace_revision_key: 'ws-1' },
  ] };
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

  it('strict seam propagates database errors for governed DAG receipts', async () => {
    queryMock.mockClear();
    queryMock.mockRejectedValue(new Error('connection refused'));

    const { readKagHypergraphNeighborsStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    await expect(readKagHypergraphNeighborsStrictV1(['packet:00000000-0000-5000-8000-000000000001'], { workspaceRevision: 'ws-1', graphRevision: 'graph-1' })).rejects.toThrow('connection refused');
  });

  it('strict seam requires and binds both traversal revisions', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });

    const { readKagHypergraphNeighborsStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    await readKagHypergraphNeighborsStrictV1(['packet:00000000-0000-5000-8000-000000000001'], { workspaceRevision: 'ws-1', graphRevision: 'graph-1' });
    const incidenceCall = queryMock.mock.calls.find(([sql]) => String(sql).includes('atlas_packet_incidence'));
    expect(incidenceCall?.[0]).toContain('workspace_revision = $2');
    expect(incidenceCall?.[0]).toContain('graph_revision = $3');
    expect(incidenceCall?.[0]).toContain('LIMIT $4');
    expect(incidenceCall?.[1]).toEqual([['packet:00000000-0000-5000-8000-000000000001'], 'ws-1', 'graph-1', 4097]);
    const tupleCall = queryMock.mock.calls.find(([sql]) => String(sql).includes('atlas_ontology_linked_tuples'));
    expect(tupleCall).toBeUndefined();
  });

  it('strict seam rejects an incomplete traversal snapshot before querying', async () => {
    queryMock.mockClear();
    const { readKagHypergraphNeighborsStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    await expect(readKagHypergraphNeighborsStrictV1(['packet:a'], { workspaceRevision: '', graphRevision: 'graph-1' }))
      .rejects.toThrow('KAG_TRAVERSAL_SNAPSHOT_REQUIRED');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('strict hyperedge read returns role-preserving records with revision parameters', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: hyperedgeMemberRows() });
    const { readKagHyperedgesStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    const result = await readKagHyperedgesStrictV1(['packet:a'], { workspaceRevision: 'ws-1', graphRevision: 'graph-1' });
    expect(result[0].participants.map((participant) => participant.role)).toEqual(['actor', 'target']);
    expect(queryMock.mock.calls[0][1]).toEqual([['packet:a'], 'ws-1', 'graph-1', 4097]);
    expect(String(queryMock.mock.calls[0][0])).toContain('LIMIT $4');
  });

  it('strict traversal expands only a checksum-verified directed packet incidence row', async () => {
    queryMock.mockClear();
    const fixture = packetIncidenceRows();
    queryMock.mockImplementation((sql: string) => Promise.resolve(sql.includes('atlas_packet_incidence') ? { rows: [fixture.row] } : endpointRows()));
    const { readKagHypergraphNeighborsStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    const result = await readKagHypergraphNeighborsStrictV1(
      [fixture.lineage.canonicalId],
      { workspaceRevision: 'ws-1', graphRevision: 'graph-1' },
    );

    expect(result.matchedTuples).toBe(0);
    expect(result.matchedHyperedges).toBe(1);
    expect(result.neighbors).toEqual([{
      canonicalId: fixture.lineage.canonicalId,
      hyperedgeIds: [`packet-incidence:${fixture.lineage.lineageChecksum}`],
      neighborCanonicalIds: [fixture.lineage.neighborCanonicalId],
      neighborStoragePacketKeys: [fixture.lineage.neighborPacketKey],
    }]);
  });

  it('strict traversal rejects bad incidence checksums and legacy request identities', async () => {
    queryMock.mockClear();
    const fixture = packetIncidenceRows();
    queryMock.mockImplementation((sql: string) => Promise.resolve(sql.includes('atlas_packet_incidence') ? { rows: [{
      ...fixture.row,
      lineage: { ...fixture.lineage, graphRevision: 'tampered' },
    }] } : endpointRows()));
    const { readKagHypergraphNeighborsStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    await expect(readKagHypergraphNeighborsStrictV1(
      [fixture.lineage.canonicalId],
      { workspaceRevision: 'ws-1', graphRevision: 'graph-1' },
    )).rejects.toThrow();
    await expect(readKagHypergraphNeighborsStrictV1(['packet:0123456789ab'], {
      workspaceRevision: 'ws-1', graphRevision: 'graph-1',
    })).rejects.toThrow('KAG_CANONICAL_PACKET_KEY_V2_REQUIRED');
  });

  it('fails closed when the bounded hyperedge-member read exceeds its result-row cap', async () => {
    queryMock.mockClear();
    const { MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1, readKagHyperedgesStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    const row = hyperedgeMemberRows()[0];
    queryMock.mockResolvedValue({ rows: Array.from({ length: MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1 + 1 }, () => row) });

    await expect(readKagHyperedgesStrictV1(['packet:a'], { workspaceRevision: 'ws-1', graphRevision: 'graph-1' }))
      .rejects.toThrow('KAG_HYPEREDGE_MEMBER_ROW_LIMIT_EXCEEDED');
    expect(queryMock.mock.calls[0][1][3]).toBe(MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1 + 1);
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

describe('strict ontology tuple readback', () => {
  const packetKey = 'packet:00000000-0000-5000-8000-000000000001';
  const sourceRevision = 'sha256:' + 'a'.repeat(64);

  function qualifiedTupleRow(overrides: Record<string, unknown> = {}) {
    return tupleRow({
      packet_key: packetKey,
      source_ref: 'src/lib/example.ts',
      provenance: {
        sourceTables: ['fixture'],
        labelerVersion: null,
        taggerVersion: null,
        ontologyVersion: 'ontology-version:v1',
        ontologyRevision: 'ontology-revision:v1',
        nlpVersion: null,
        sourceRevision,
        workspaceRevision: 'ws-1',
        graphRevision: 'graph-1',
      },
      packet_source_ref: 'src/lib/example.ts',
      packet_source_revision: sourceRevision,
      packet_workspace_revision: 'ws-1',
      ...overrides,
    });
  }

  it('reads only exact packet, source, workspace and graph revision bindings', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [qualifiedTupleRow()] });
    const { readQualifiedOntologyTuplesStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    const result = await readQualifiedOntologyTuplesStrictV1([packetKey], {
      workspaceRevision: 'ws-1', graphRevision: 'graph-1',
    });

    expect(result).toMatchObject({
      requestedPacketKeys: 1,
      matchedTupleCount: 1,
      unmatchedPacketKeys: [],
    });
    expect(result.tuples[0]).toMatchObject({
      packetKey,
      sourceRef: 'src/lib/example.ts',
      provenance: { sourceRevision, workspaceRevision: 'ws-1', graphRevision: 'graph-1', ontologyRevision: 'ontology-revision:v1' },
    });
    expect(String(queryMock.mock.calls[0][0])).toContain('p.source_revision = t.provenance->>\'sourceRevision\'');
    expect(queryMock.mock.calls[0][1]).toEqual([[packetKey], 'ws-1', 'graph-1', 1025]);
  });

  it('rejects tuple rows whose source revision disagrees with the canonical packet row', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [qualifiedTupleRow({ packet_source_revision: 'sha256:' + 'b'.repeat(64) })] });
    const { readQualifiedOntologyTuplesStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    await expect(readQualifiedOntologyTuplesStrictV1([packetKey], {
      workspaceRevision: 'ws-1', graphRevision: 'graph-1',
    })).rejects.toThrow(`KAG_TUPLE_SOURCE_REVISION_READBACK_MISMATCH:tuple:1`);
  });

  it('rejects a tuple joined to another workspace snapshot', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [qualifiedTupleRow({ packet_workspace_revision: 'ws-stale' })] });
    const { readQualifiedOntologyTuplesStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    await expect(readQualifiedOntologyTuplesStrictV1([packetKey], {
      workspaceRevision: 'ws-1', graphRevision: 'graph-1',
    })).rejects.toThrow('KAG_TUPLE_PACKET_BINDING_READBACK_MISMATCH:tuple:1');
  });

  it('rejects non-v2 packet aliases before querying', async () => {
    queryMock.mockClear();
    const { readQualifiedOntologyTuplesStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
    await expect(readQualifiedOntologyTuplesStrictV1(['packet:legacy-alias'], {
      workspaceRevision: 'ws-1', graphRevision: 'graph-1',
    })).rejects.toThrow('KAG_CANONICAL_PACKET_KEY_V2_REQUIRED');
    expect(queryMock).not.toHaveBeenCalled();
  });
});
