import { describe, expect, it } from 'vitest';
import retrievalProto from '$lib/generated/proto/retrieval_pb.js';

const retrieval = retrievalProto.yorha.retrieval;
const shared = retrievalProto.yorha.shared;

describe('semantic AST packet RPC protobuf contract', () => {
  it('round-trips caller-owned request identity', () => {
    const request = retrieval.SemanticAstPacketRequest.create({
      atlasContext: shared.AtlasRequestContextV2.create({
        toolCallId: 'tool-1',
        runId: 'run-1',
        workspaceId: 'workspace-1',
        workspaceRevision: 'workspace-rev-1',
        packetKey: 'packet:example',
        packetRevision: 'packet-rev-1',
      }),
      sourceRef: 'src/example.ts',
      packetKey: 'packet:example',
      limit: 10,
    });

    const decoded = retrieval.SemanticAstPacketRequest.decode(retrieval.SemanticAstPacketRequest.encode(request).finish());
    expect(decoded.atlasContext?.workspaceRevision).toBe('workspace-rev-1');
    expect(decoded.atlasContext?.packetRevision).toBe('packet-rev-1');
    expect(decoded.sourceRef).toBe('src/example.ts');
  });

  it('round-trips exact AST span and parser lineage', () => {
    const response = retrieval.SemanticAstPacketResponse.create({
      packets: [retrieval.SemanticAstPacket.create({
        workspaceId: 'workspace-1',
        workspaceRevision: 'workspace-rev-1',
        packetKey: 'packet:example',
        packetRevision: 'packet-rev-1',
        sourceRef: 'src/example.ts',
        sourceRevision: 'source-rev-1',
        contentHash: 'c'.repeat(64),
        treeNodeId: 'tree-1',
        nodeKind: 'function_declaration',
        qualifiedSymbol: 'example',
        byteStart: 12,
        byteEnd: 98,
        parserName: 'tree-sitter',
        parserRevision: 'tree-sitter-1',
        grammarRevision: 'typescript-1',
        astContentHash: 'd'.repeat(64),
      })],
    });

    const decoded = retrieval.SemanticAstPacketResponse.decode(retrieval.SemanticAstPacketResponse.encode(response).finish());
    const packet = decoded.packets[0];
    expect(packet.packetKey).toBe('packet:example');
    expect(Number(packet.byteStart)).toBe(12);
    expect(Number(packet.byteEnd)).toBe(98);
    expect(packet.parserRevision).toBe('tree-sitter-1');
    expect(packet.grammarRevision).toBe('typescript-1');
  });

  it('round-trips packet registry lane metadata without changing identity', () => {
    const response = retrieval.PacketRegistryResponse.create({
      entries: [retrieval.PacketRegistryEntry.create({
        schema: 'atlas.rpc-packet-registry.v1',
        workspaceId: 'workspace-1',
        workspaceRevision: 'workspace-rev-1',
        packetKey: 'packet:example',
        packetRevision: 'packet-rev-1',
        sourceRef: 'src/example.ts',
        sourceRevision: 'source-rev-1',
        contentHash: 'c'.repeat(64),
        registryRevision: 'registry-rev-1',
        lanes: [retrieval.PacketRegistryLane.create({
          laneId: 'qdrant:semantic_768',
          kind: 'qdrant_dense',
          owner: 'qdrant-projection',
          status: 'READY',
          representationId: 'semantic_768',
          representationRevision: 'embeddinggemma-v1',
          collection: 'codebase_chunks_768',
          vectorName: 'content',
          tags: ['canonical-source'],
          indexAlgorithm: 'HNSW',
          indexRevision: 'qdrant-hnsw-v1',
          writePolicy: 'PROJECTION_ONLY',
        })],
      })],
    });

    const decoded = retrieval.PacketRegistryResponse.decode(retrieval.PacketRegistryResponse.encode(response).finish());
    expect(decoded.entries[0].packetKey).toBe('packet:example');
    expect(decoded.entries[0].lanes[0].collection).toBe('codebase_chunks_768');
    expect(decoded.entries[0].lanes[0].indexAlgorithm).toBe('HNSW');
  });
});
