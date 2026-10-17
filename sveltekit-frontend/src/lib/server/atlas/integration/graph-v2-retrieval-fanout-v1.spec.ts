import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const graphRevision = 'c'.repeat(64);

describe('readGraphV2RetrievalFanoutStrictV1', () => {
  beforeEach(() => query.mockReset());

  it('requires revision-qualified inputs and queries only validated GraphV2 projections', async () => {
    query.mockResolvedValue({ rows: [{
      packet_key: 'packet:neighbor',
      source_ref: 'src/neighbor.ts',
      source_revision: sourceRevision,
      workspace_revision: workspaceRevision,
      graph_revision: graphRevision,
      relation_id: 'edge:1',
      relation_kind: 'CALLS',
      relation_confidence: 0.8,
    }, {
      packet_key: 'packet:contained',
      source_ref: 'src/contained.ts',
      source_revision: sourceRevision,
      workspace_revision: workspaceRevision,
      graph_revision: graphRevision,
      relation_id: 'edge:contains',
      relation_kind: 'CONTAINS',
      relation_confidence: 1,
    }] });
    const { readGraphV2RetrievalFanoutStrictV1 } = await import('./graph-v2-retrieval-fanout-v1.js');
    const result = await readGraphV2RetrievalFanoutStrictV1({
      seeds: [{ packetKey: 'packet:seed', sourceRef: 'src/seed.ts', sourceRevision }],
      workspaceRevision,
      graphRevision,
    });
    expect(result).toEqual([{
      packetKey: 'packet:neighbor',
      sourceRef: 'src/neighbor.ts',
      sourceRevision,
      workspaceRevision,
      graphRevision,
      relationId: 'edge:1',
      relationKind: 'CALLS',
      relationConfidence: 0.8,
    }]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'VALIDATED'");
    expect(sql).toContain("e.edge_type IN ('CALLS', 'IMPORTS', 'REFERENCES', 'DEPENDS_ON', 'IMPLEMENTS', 'USES_CONCEPT')");
    expect(sql).toContain("'API_CONTRACT_OBSERVED'");
    expect(sql).toContain("source_manifest->>'workspaceRevision'");
    expect(sql).toContain('topology_hash AS graph_revision');
    expect(sql).toContain('atlas_graph_relation_participants_v2');
    expect(sql).toContain('qualified_relations AS MATERIALIZED');
    expect(sql).toContain('COUNT(DISTINCT participant.node_key) >= 3');
    expect(sql).toContain('BOOL_OR(participant_node.source_ref = r.source_ref)');
    expect(sql).toContain('r.topology_hash = s.topology_hash');
    expect(sql).not.toContain('r.source_ref = seed.source_ref');
    expect(sql).toContain('FROM atlas_packets participant_packet');
    expect(sql).toContain('participant_packet.source_revision = participant_node.properties->>');
    expect(sql).toContain('participant_packet.workspace_revision_key = s.workspace_revision');
    expect(sql).toContain('(participant_node.packet_key IS NULL OR participant_packet.packet_key = participant_node.packet_key)');
    expect(sql).toContain("n.properties->>'sourceRevision'");
    expect(sql).not.toContain('n.source_revision');
    expect(params).toEqual([workspaceRevision, graphRevision, ['packet:seed'], ['src/seed.ts'], [sourceRevision], 64]);
  });

  it('does not query with malformed revisions and filters malformed readback rows', async () => {
    const { readGraphV2RetrievalFanoutStrictV1 } = await import('./graph-v2-retrieval-fanout-v1.js');
    const invalidInput = await readGraphV2RetrievalFanoutStrictV1({
      seeds: [{ packetKey: 'packet:seed', sourceRef: 'src/seed.ts', sourceRevision: 'unknown' }],
      workspaceRevision,
      graphRevision,
    });
    expect(invalidInput).toEqual([]);
    expect(query).not.toHaveBeenCalled();

    query.mockResolvedValue({ rows: [{
      packet_key: 'packet:neighbor',
      source_ref: 'src/neighbor.ts',
      source_revision: 'unqualified',
      workspace_revision: workspaceRevision,
      graph_revision: graphRevision,
      relation_id: 'edge:1',
      relation_kind: 'CALLS',
      relation_confidence: 0.8,
    }] });
    const result = await readGraphV2RetrievalFanoutStrictV1({
      seeds: [{ packetKey: 'packet:seed', sourceRef: 'src/seed.ts', sourceRevision }],
      workspaceRevision,
      graphRevision,
    });
    expect(result).toEqual([]);
  });
});
