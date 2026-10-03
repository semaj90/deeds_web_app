import { describe, expect, it } from 'vitest';
import {
  CanonicalPacketRegistryIdentityV1Schema,
  PacketRegistryEntryV1Schema,
  SemanticAstPacketV1Schema,
  isPromotionEligibleRegistryEntryV1,
} from './rpc-packet-registry-v1.js';

const identity = {
  schema: 'atlas.rpc-packet-registry.v1' as const,
  workspaceId: 'workspace-1',
  workspaceRevision: 'sha256:' + 'a'.repeat(64),
  packetKey: 'packet:src/example.ts:fn',
  packetRevision: 'packet-rev-1',
  sourceRef: 'src/example.ts',
  sourceRevision: 'sha256:' + 'b'.repeat(64),
  contentHash: 'c'.repeat(64),
};

describe('rpc packet registry v1', () => {
  it('requires the canonical identity tuple', () => {
    expect(CanonicalPacketRegistryIdentityV1Schema.parse(identity)).toEqual(identity);
    expect(CanonicalPacketRegistryIdentityV1Schema.safeParse({ ...identity, packetRevision: '' }).success).toBe(false);
  });

  it('rejects inverted AST spans', () => {
    expect(SemanticAstPacketV1Schema.safeParse({
      ...identity,
      chunkId: null,
      treeNodeId: 'tree-1',
      nodeKind: 'function_declaration',
      qualifiedSymbol: 'example',
      parentTreeNodeId: null,
      byteStart: 20,
      byteEnd: 10,
      parserName: 'tree-sitter',
      parserRevision: 'tree-sitter-1',
      grammarRevision: 'typescript-1',
      astContentHash: 'd'.repeat(64),
    }).success).toBe(false);
  });

  it('does not treat canonical-gated lanes as promotion-ready', () => {
    const entry = PacketRegistryEntryV1Schema.parse({
      ...identity,
      registryRevision: 'registry-1',
      lanes: [{
        laneId: 'pgvector:semantic_768',
        kind: 'pgvector',
        owner: 'postgresql-18',
        status: 'READY',
        representationId: 'semantic_768',
        representationRevision: 'embeddinggemma-v1',
        modelRevision: 'embeddinggemma-300m-v1',
        collection: null,
        vectorName: null,
        tags: [],
        indexAlgorithm: 'IVFFLAT',
        indexRevision: 'pg-index-v1',
        projectionChecksum: null,
        writePolicy: 'CANONICAL_GATED',
      }],
    });
    expect(isPromotionEligibleRegistryEntryV1(entry)).toBe(false);
  });
});
