import { describe, expect, it } from 'vitest';
import { evaluateGraphQdrantFanoutAlignment } from './graph-qdrant-fanout-alignment.js';

const base = {
  packetKey: 'packet:graphify',
  sourceRef: 'src/lib/graphify.ts',
  treeNodeId: 'tree:graphify',
  workspaceRevision: 'workspace:42',
  graphRevision: 'graph:42',
};

describe('Graphify to Qdrant fanout alignment', () => {
  it('accepts matching identity, revisions, and semantic representation', () => {
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: {
        packet_key: base.packetKey,
        source_ref: base.sourceRef,
        tree_node_id: base.treeNodeId,
        workspace_revision: base.workspaceRevision,
        graph_revision: base.graphRevision,
        representation_id: 'semantic_768',
        embedding_dimension: 768,
      },
    }).status).toBe('ALIGNED');
  });

  it('distinguishes identity mismatch from missing lineage', () => {
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { packet_key: 'packet:other' },
    }).status).toBe('IDENTITY_MISMATCH');
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { packet_key: base.packetKey },
    }).status).toBe('LINEAGE_GAP');
  });

  it('rejects contradictory identity fields even when one field matches', () => {
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: {
        packet_key: base.packetKey,
        source_ref: 'src/lib/other.ts',
      },
    }).status).toBe('IDENTITY_MISMATCH');
  });

  it('does not treat a missing projection as a degraded aligned result', () => {
    expect(evaluateGraphQdrantFanoutAlignment({ ...base, qdrantPayload: null }).status)
      .toBe('MISSING_PROJECTION');
  });
});
