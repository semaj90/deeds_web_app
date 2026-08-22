import { describe, expect, it } from 'vitest';
import { evaluateGraphQdrantFanoutAlignment } from './graph-qdrant-fanout-alignment.js';

const base = {
  packetKey: 'packet:graphify',
  canonicalId: 'canonical:graphify',
  symbolVersionId: 'symbol-version:graphify',
  sourceRef: 'src/lib/graphify.ts',
  treeNodeId: 'tree:graphify',
  sourceRevision: `sha256:${'1'.repeat(64)}`,
  workspaceWorldRevision: `sha256:${'2'.repeat(64)}`,
  graphRevision: '3'.repeat(64),
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
    workspace_world_revision: base.workspaceWorldRevision,
    repository_revision: 'a'.repeat(40),
    workspace_revision: 41,
    workspace_cache_revision: 41,
    graph_revision: base.graphRevision,
    representation_id: 'semantic_768',
    representation_revision: base.representationRevision,
    embedding_dimension: 768,
  };
}

describe('Graphify to Qdrant fanout alignment', () => {
  it('accepts matching strong identity and logical workspace/source/graph/representation lineage', () => {
    const result = evaluateGraphQdrantFanoutAlignment({ ...base, qdrantPayload: alignedPayload() });
    expect(result.status).toBe('ALIGNED');
    expect(result.strongIdentityEvidence).toBe('CANONICAL_ID');
    expect(result.workspaceWorldRevisionAligned).toBe(true);
    expect(result.sourceRevisionAligned).toBe(true);
    expect(result.graphRevisionAligned).toBe(true);
    expect(result.representationRevisionAligned).toBe(true);
    expect(result.repositoryRevisionObserved).toBe('a'.repeat(40));
    expect(result.legacyWorkspaceCacheRevisionObserved).toBe('41');
  });

  it('does not let Git provenance or the integer cache epoch satisfy logical workspace lineage', () => {
    const payload = alignedPayload();
    delete payload.workspace_world_revision;
    const result = evaluateGraphQdrantFanoutAlignment({ ...base, qdrantPayload: payload });
    expect(result.status).toBe('LINEAGE_GAP');
    expect(result.workspaceWorldRevisionAligned).toBe(false);
    expect(result.repositoryRevisionObserved).toBe('a'.repeat(40));
    expect(result.legacyWorkspaceCacheRevisionObserved).toBe('41');
  });

  it('does not allow source_ref or tree_node_id alone to mint canonical identity', () => {
    const result = evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: {
        source_ref: base.sourceRef,
        tree_node_id: base.treeNodeId,
        source_revision: base.sourceRevision,
        workspace_world_revision: base.workspaceWorldRevision,
        graph_revision: base.graphRevision,
        representation_id: 'semantic_768',
        representation_revision: base.representationRevision,
        embedding_dimension: 768,
      },
    });
    expect(result.status).toBe('IDENTITY_MISMATCH');
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
        workspace_world_revision: base.workspaceWorldRevision,
        graph_revision: base.graphRevision,
        representation_id: 'semantic_768',
        representation_revision: base.representationRevision,
        embedding_dimension: 768,
      },
    });
    expect(result.status).toBe('ALIGNED');
    expect(result.strongIdentityEvidence).toBe('PACKET_KEY');
  });

  it('rejects contradictory evidence even when a strong identity coordinate matches', () => {
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { ...alignedPayload(), source_ref: 'src/lib/other.ts' },
    }).status).toBe('IDENTITY_MISMATCH');
  });

  it('rejects source, graph, and representation drift as lineage gaps', () => {
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { ...alignedPayload(), source_revision: `sha256:${'9'.repeat(64)}` },
    }).status).toBe('LINEAGE_GAP');
    expect(evaluateGraphQdrantFanoutAlignment({
      ...base,
      qdrantPayload: { ...alignedPayload(), graph_revision: '8'.repeat(64) },
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
