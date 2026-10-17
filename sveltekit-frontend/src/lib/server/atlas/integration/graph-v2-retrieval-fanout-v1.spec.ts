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
    }]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'VALIDATED'");
    expect(sql).toContain('atlas_graph_relation_participants_v2');
    expect(sql).toContain('p.source_revision = n.source_revision');
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
    }] });
    const result = await readGraphV2RetrievalFanoutStrictV1({
      seeds: [{ packetKey: 'packet:seed', sourceRef: 'src/seed.ts', sourceRevision }],
      workspaceRevision,
      graphRevision,
    });
    expect(result).toEqual([]);
  });
});
