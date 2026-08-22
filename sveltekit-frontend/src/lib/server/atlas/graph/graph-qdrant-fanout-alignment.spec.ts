import { describe, expect, it } from 'vitest';
import { evaluateGraphQdrantFanoutAlignment } from './graph-qdrant-fanout-alignment.js';

const base = {
  packetKey: 'packet:graphify',
  canonicalId: 'canonical:graphify',
  symbolVersionId: 'symbol-version:graphify',
  sourceRef: 'src/lib/graphify.ts',
  treeNodeId: 'tree:graphify',
  sourceRevision: 'sha256:source-revision',
  workspaceRevision: 'workspace:42',
  graphRevision: 'graph:42',
  representationRevision: 7,
};

function alignedPayload() {
  return {
    canonical_id: base.canonicalId,
    symbol_version_id: base.symbolVersionId,
    packet_key: base.packetKey,
    source_ref: base.sourceRef,
    tree_node_id: base.treeNodeId,
    source_revision: base.sourceRevision,
    workspace_revision: base.workspaceRevision,
    graph_revision: base.graphRevision,
    representation_id: 'semantic_768',
    representation_revision: base.representationRevision,
    embedding_dimension: 768,
  };
}

describe('Graphify to Qdrant fanout alignment', () => {
  it('accepts matching strong identity, revisions, and semantic representation', () => {
    const result = evaluateGraphQdrantFanoutAlignment({ ...base, qdrantPayload: alignedPayload() });
    expect(result.status).toBe('ALIGNED');
    expect(result.strongIdentityEvidence).toBe('CANONICAL_ID');
    expect(result.sourceRevisionAligned).toBe(true);
    expect(result.representationRevisionAligned).toBe(true);
  });

  it('does not allow source_ref or tree_node_id alone to mint canonical identity', () => {
    const result = evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: {
        source_ref: base.sourceRef,
        tree_node_id: base.treeNodeId,
        source_revision: base.sourceRevision,
        workspace_revision: base.workspaceRevision,
        graph_revision: base.graphRevision,
        representation_id: 'semantic_768',
        representation_revision: base.representationRevision,
        embedding_dimension: 768,
      },
    });
    expect(result.status).toBe('IDENTITY_MISMATCH');
    expect(result.canonicalIdentityMatch).toBe(false);
    expect(result.strongIdentityEvidence).toBeNull();
  });

  it('accepts packet_key as strong identity when stronger coordinates are unavailable', () => {
    const result = evaluateGraphQdrantFanoutAlignment({
      ...base,
      canonicalId: null,
      symbolVersionId: null,
      qdrantPayload: {
        packet_key: base.packetKey,
        source_ref: base.sourceRef,
        tree_node_id: base.treeNodeId,
        source_revision: base.sourceRevision,
        workspace_revision: base.workspaceRevision,
        graph_revision: base.graphRevision,
        representation_id: 'semantic_768',
        representation_revision: base.representationRevision,
        embedding_dimension: 768,
      },
    });
    expect(result.status).toBe('ALIGNED');
    expect(result.strongIdentityEvidence).toBe('PACKET_KEY');
  });

  it('rejects contradictory evidence even when packet identity matches', () => {
    const result = evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { ...alignedPayload(), source_ref: 'src/lib/other.ts' },
    });
    expect(result.status).toBe('IDENTITY_MISMATCH');
  });

  it('rejects source and representation revision drift as lineage gaps', () => {
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { ...alignedPayload(), source_revision: 'sha256:other' },
    }).status).toBe('LINEAGE_GAP');
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { ...alignedPayload(), representation_revision: 8 },
    }).status).toBe('LINEAGE_GAP');
  });

  it('does not treat a missing projection as a degraded aligned result', () => {
    expect(evaluateGraphQdrantFanoutAlignment({ ...base, qdrantPayload: null }).status)
      .toBe('MISSING_PROJECTION');
  });
});
