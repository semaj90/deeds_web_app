import { describe, expect, it } from 'vitest';
import {
  buildBm42ChallengerProjectionV1,
  buildQdrantSemanticProjectionV1,
  canonicalSemanticId,
  type AtlasQdrantSemanticPayloadV1,
} from './qdrant-semantic-projection';

function payload(): AtlasQdrantSemanticPayloadV1 {
  return {
    schema_version: 'atlas-qdrant-semantic-projection-v1',
    canonical_id: canonicalSemanticId('snapshot-339', 'packet-1'),
    packet_key: 'packet-1',
    symbol_version_id: 'symbol-v1',
    tree_node_id: 'tree-1',
    snapshot_id: 'snapshot-339',
    workspace_revision: '742',
    source_revision: '17',
    representation_id: 'semantic_768',
    representation_revision: 109,
    projection_revision: 'qdrant-semantic-339',
    source_ref: 'src/lib/example.ts',
    language: 'typescript',
    node_type: 'function_declaration',
    module: 'src/lib/example.ts',
    domain: 'parent-atlas',
    graph_component: 'component-7',
    community: 'community-12',
  };
}

describe('Qdrant semantic projection', () => {
  it('keeps packet identity and snapshot identity explicit', () => {
    const projection = buildQdrantSemanticProjectionV1(payload(), 'cold');
    expect(projection.collection).toBe('codebase_chunks_768_v2');
    expect(projection.vectorName).toBe('content');
    expect(projection.dimension).toBe(768);
    expect(projection.payload.packet_key).toBe('packet-1');
    expect(projection.payload.canonical_id).toBe('snapshot-339:packet-1');
    expect(projection.vectorStorage).toBe('on-disk');
  });

  it('rejects a projection that fabricates a different canonical id', () => {
    const bad = { ...payload(), canonical_id: 'wrong-id' };
    expect(() => buildQdrantSemanticProjectionV1(bad)).toThrow(/CANONICAL_ID_MISMATCH/);
  });

  it('keeps BM42 explicitly non-authoritative', () => {
    const challenger = buildBm42ChallengerProjectionV1('packet-1', '17');
    expect(challenger.role).toBe('experimental-challenger');
    expect(challenger.evidenceAuthority).toBe(false);
    expect(challenger.collection).toBe('codebase_chunks_384_hybrid');
  });
});
