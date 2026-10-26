import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { buildGraphRevisionSnapshotV1 } from '../lineage/graph-revision-snapshot-v1.js';
import { loadCanonicalGraphSnapshotInputFromPostgres, materializeCanonicalGraphSnapshotFromPostgres, type QueryLike } from './graph-snapshot-postgres.js';
import type { GraphifyStructuralProjectionPipelineV1 } from '../indexing/graphify-structural-projection-pipeline-v1.js';

vi.mock('../identity/packet-identity-resolver.js', () => ({
  resolvePacketKeyResolutionV2: async (key: string) => ({ canonicalPacketKey: key, storagePacketKey: key })
}));

const snapshotId = '55555555-5555-4555-8555-555555555555';

const treeRows = [
  {
    nodeId: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    rootId: '11111111-1111-4111-8111-111111111111',
    pageIndexPath: 'doc:root',
    nodeType: 'document',
    treeDepth: 0,
    sourceRef: 'src/root.md',
    filePath: 'src/root.md',
    packetKey: null,
    featureId: null,
    title: 'Root',
    summary: 'Root node',
    contentPreview: 'Root preview',
    domain: 'docs',
    somCluster: 1,
    communityId: 1,
    metadata: { lane: 'root', source: 'atlas_packets' },
    ledgerType: 'canonical',
    lineageVersion: 'tree-v1'
  },
  {
    nodeId: '22222222-2222-4222-8222-222222222222',
    parentId: '11111111-1111-4111-8111-111111111111',
    rootId: '11111111-1111-4111-8111-111111111111',
    pageIndexPath: 'doc:root/page:1',
    nodeType: 'page',
    treeDepth: 1,
    sourceRef: 'src/root.md',
    filePath: 'src/root.md',
    packetKey: 'packet:alpha',
    featureId: 'feature:alpha',
    title: 'Page',
    summary: 'Page node',
    contentPreview: 'Page preview',
    domain: 'docs',
    somCluster: 2,
    communityId: 1,
    metadata: { lane: 'page', source: 'atlas_packets' },
    ledgerType: 'canonical',
    lineageVersion: 'tree-v1'
  }
] as const;

const packetRows = [
  {
    packetKey: 'packet:alpha',
    sourceRef: 'src/root.md',
    canonicalSourceRef: 'src/root.md',
    directoryPath: 'src',
    filePath: 'src/root.md',
    functionSymbol: null,
    featureId: 'feature:alpha',
    featureLabel: 'Alpha',
    titleId: null,
    communityId: 7,
    clusterId: 3,
    sha256: 'sha-alpha',
    sourceRevision: 'sha256:source-alpha',
    byteStart: 0,
    byteEnd: 128,
    sourceKind: 'codebase',
    sourcePath: 'src/root.md',
    topology: { lane: 'alpha' },
    vectors: {},
    metadata: { summary: 'Alpha packet' },
    domainClass: 'code',
    tags: ['alpha'],
    lineageVersion: 'packet-v1',
    ledgerType: 'canonical',
    canonical: true,
    treeNodeId: '22222222-2222-4222-8222-222222222222',
    qdrantCollection: 'codebase_chunks_384_hybrid',
    qdrantVectorDim: 384
  }
] as const;

const snakeCasePacketRows = [
  {
    packet_key: 'packet:alpha',
    source_ref: 'src/root.md',
    canonical_source_ref: 'src/root.md',
    directory_path: 'src',
    file_path: 'src/root.md',
    function_symbol: null,
    feature_id: 'feature:alpha',
    feature_label: 'Alpha',
    title_id: null,
    community_id: 7,
    cluster_id: 3,
    sha256: 'sha-alpha',
    source_revision: 'sha256:source-alpha',
    byte_start: 0,
    byte_end: 128,
    source_kind: 'codebase',
    source_path: 'src/root.md',
    topology: { lane: 'alpha' },
    vectors: {},
    metadata: { summary: 'Alpha packet' },
    domain_class: 'code',
    tags: ['alpha'],
    lineage_version: 'packet-v1',
    ledger_type: 'canonical',
    canonical: true,
    tree_node_id: '22222222-2222-4222-8222-222222222222',
    qdrant_collection: 'codebase_chunks_384_hybrid',
    qdrant_vector_dim: 384
  }
] as const;

function makePool(): QueryLike {
  const query = vi.fn(async (text: string) => {
    if (text.includes('FROM atlas_packets')) return { rows: packetRows as unknown[] };
    if (text.includes('FROM atlas_tree_nodes')) return { rows: treeRows as unknown[] };
    throw new Error(`Unexpected query: ${text}`);
  });
  return { query };
}

describe('canonical graph snapshot postgres loader', () => {
  it('loads canonical packet/tree identities and materializes an immutable snapshot', async () => {
    const pool = makePool();
    const loaded = await loadCanonicalGraphSnapshotInputFromPostgres(pool, {
      snapshotId,
      workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
      executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
      repositoryId: 'repo:root',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    });

    expect(loaded.snapshotId).toBe(snapshotId);
    expect(loaded.treeNodes).toHaveLength(2);
    expect(loaded.packets).toHaveLength(1);
    expect(loaded.packets[0].packetKey).toBe('packet:alpha');
    expect(loaded.packets[0].sourceRevision).toBe('sha256:source-alpha');
    expect(loaded.packets[0]).toMatchObject({ byteStart: 0, byteEnd: 128 });
    expect(loaded.workspaceRevision).toBe('sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc');
    expect(loaded.treeNodes[1].packetKey).toBe('packet:alpha');

    const materialized = await materializeCanonicalGraphSnapshotFromPostgres(pool, {
      snapshotId,
      workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
      executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
      repositoryId: 'repo:root',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    });

    expect(materialized.graphSnapshot.snapshotId).toBe(snapshotId);
    expect(materialized.graphSnapshotManifest.status).toBe('MATERIALIZED');
    expect(materialized.graphSnapshotManifest.workspaceRevision).toBe('sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc');
    expect(materialized.graphSnapshotNodes.find((node) => node.nodeType === 'packet')?.properties).toMatchObject({
      sourceRevision: 'sha256:source-alpha',
      workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'
    });
    const treeNodeProperties = materialized.graphSnapshotNodes
      .filter((node) => node.treeNodeId)
      .map((node) => node.properties);
    expect(treeNodeProperties).toHaveLength(2);
    for (const properties of treeNodeProperties) {
      expect(properties).toMatchObject({
        sourceRevision: 'sha256:source-alpha',
        workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'
      });
    }
    expect(materialized.graphSnapshotNodes.map((node) => node.nodeKey)).toEqual([
      // NOT 'packet:packet:alpha' -- packets[0].packetKey ('packet:alpha',
      // asserted at line 135 above) already carries the canonical prefix.
      'packet:alpha',
      'tree:11111111-1111-4111-8111-111111111111',
      'tree:22222222-2222-4222-8222-222222222222'
    ]);
    expect(materialized.graphSnapshotEdges.map((edge) => edge.edgeType)).toEqual(['CONTAINS', 'DERIVED_FROM']);
    expect(materialized.graphSnapshotProof.replayMatches).toBe(true);
  });

  it('normalizes live snake_case postgres rows into the canonical graph snapshot', async () => {
    const pool = {
      query: vi.fn(async (text: string) => {
        if (text.includes('FROM atlas_packets')) {
          return { rows: snakeCasePacketRows as unknown[] };
        }
        if (text.includes('FROM atlas_tree_nodes')) {
          return { rows: treeRows as unknown[] };
        }
        throw new Error(`Unexpected query: ${text}`);
      })
    } satisfies QueryLike;

    const loaded = await loadCanonicalGraphSnapshotInputFromPostgres(pool, {
      snapshotId,
      workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
      executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
      repositoryId: 'repo:root',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    });

    expect(loaded.packets).toHaveLength(1);
    expect(loaded.packets[0].packetKey).toBe('packet:alpha');
    expect(loaded.packets[0].sourceRevision).toBe('sha256:source-alpha');
    expect(loaded.treeNodes).toHaveLength(2);
  });

  it('routes replay-admitted Graphify edges through packet resolution into snapshot materialization', async () => {
    const sourceBytes = Buffer.from('function caller() { helper(); }\n', 'utf8');
    const targetSourceBytes = Buffer.from('export function helper() {}\n', 'utf8');
    const workspaceRevision = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
    const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
    const targetSourceRevision = `sha256:${createHash('sha256').update(targetSourceBytes).digest('hex')}`;
    const helperTreeNodeId = '44444444-4444-4444-8444-444444444444';
    const packets = [
      { ...packetRows[0], sourceRef: 'src/root.md', canonicalSourceRef: 'src/root.md', filePath: 'src/root.md', sourcePath: 'src/root.md', sourceRevision, byteStart: 0, byteEnd: sourceBytes.byteLength },
      { ...packetRows[0], packetKey: 'packet:beta', sourceRef: 'src/helper.ts', canonicalSourceRef: 'src/helper.ts', filePath: 'src/helper.ts', sourcePath: 'src/helper.ts', sourceRevision: targetSourceRevision, sha256: targetSourceRevision, byteStart: 0, byteEnd: targetSourceBytes.byteLength, treeNodeId: helperTreeNodeId },
    ];
    const helperTreeNode = { ...treeRows[1], nodeId: helperTreeNodeId, pageIndexPath: 'doc:root/page:helper', sourceRef: 'src/helper.ts', filePath: 'src/helper.ts', packetKey: 'packet:beta' };
    const query = vi.fn(async <T = Record<string, unknown>>(text: string) => {
      if (text.includes('graphify_symbols AS symbol')) return { rows: [
        { stable_symbol_key: 'symbol:caller', workspace_revision: workspaceRevision, code_source_revision: sourceRevision, packet_key: 'packet:alpha', source_ref: 'src/root.md', source_revision: sourceRevision, workspace_revision_key: workspaceRevision },
        { stable_symbol_key: 'symbol:helper', workspace_revision: workspaceRevision, code_source_revision: targetSourceRevision, packet_key: 'packet:beta', source_ref: 'src/helper.ts', source_revision: targetSourceRevision, workspace_revision_key: workspaceRevision },
      ] as T[] };
      if (text.includes('FROM atlas_packets WHERE packet_key = ANY')) return { rows: packets.map((packet) => ({ packet_key: packet.packetKey, source_ref: packet.sourceRef, source_revision: packet.sourceRevision, workspace_revision_key: workspaceRevision })) as T[] };
      if (text.includes('FROM atlas_packets p')) return { rows: packets as T[] };
      if (text.includes('FROM atlas_tree_nodes')) return { rows: [...treeRows, helperTreeNode] as T[] };
      throw new Error(`Unexpected query: ${text}`);
    });
    const graphRevisionSnapshot = buildGraphRevisionSnapshotV1({
      workspaceRevisionKey: workspaceRevision,
      graphRevision: `sha256:${'c'.repeat(64)}`,
      producerId: 'graphify-snapshot',
      producerRevision: 'graphify-snapshot:v1',
      sourceRevisionCoverage: { qualified: 2, total: 2 }
    });
    const makeSymbol = (stableSymbolKey: string, sourceRef: string, revision: string, bytes: Buffer, fileId: string) => {
      const endByte = bytes.indexOf(0x0a);
      return {
        schema: 'atlas.graphify-symbol-projection-candidate.v1' as const,
        fileId,
        workspaceRevision,
        sourceRef,
        sourceRevision: revision,
        stableSymbolKey,
        symbolKind: 'function',
        qualifiedName: stableSymbolKey,
        parentStableSymbolKey: null,
        startByte: 0,
        endByte,
        startRow: 0,
        endRow: 0,
        signatureText: null,
        sourceTextHash: createHash('sha256').update(bytes.slice(0, endByte)).digest('hex'),
        astFingerprint: 'a'.repeat(64),
        upstreamNodeId: stableSymbolKey,
        upstreamSymbolId: null,
        upstreamChunkId: `chunk:${stableSymbolKey}`,
        extractorRevision: 'extractor:v1'
      };
    };
    const edge = {
      schema: 'atlas.graphify-edge-projection-candidate.v1' as const,
      workspaceId: '99999999-9999-4999-8999-999999999999',
      workspaceRevision,
      sourceRef: 'src/root.md',
      sourceRevision,
      subjectStableSymbolKey: 'symbol:caller',
      predicate: 'CALLS',
      objectStableSymbolKey: 'symbol:helper',
      objectSourceRef: 'src/helper.ts',
      objectSourceRevision: targetSourceRevision,
      unresolvedTarget: null,
      evidenceKind: 'tree_sitter_reference',
      evidenceSpan: { startByte: sourceBytes.indexOf('helper()'), endByte: sourceBytes.indexOf('helper()') + Buffer.byteLength('helper()'), startRow: 0, endRow: 0 },
      confidence: 1,
      evidenceRefs: ['receipt:call-site'],
      referenceId: 'reference:caller-helper'
    };
    const callerSymbol = makeSymbol('symbol:caller', 'src/root.md', sourceRevision, sourceBytes, '77777777-7777-4777-8777-777777777777');
    const helperSymbol = makeSymbol('symbol:helper', 'src/helper.ts', targetSourceRevision, targetSourceBytes, '88888888-8888-4888-8888-888888888888');
    const pipeline = (sourceRef: string, revision: string, symbols: typeof callerSymbol[], edges: typeof edge[]) => ({
      schema: 'atlas.graphify-structural-projection-pipeline.v1',
      status: 'MAPPED',
      sourceRef,
      sourceRevision: revision,
      workspaceRevision,
      compilation: null,
      batch: { sourceRef, sourceRevision: revision, workspaceRevision, symbols, edges },
      diagnostics: [],
      canonicalAuthority: false,
      writesPerformed: false,
      checksum: 'f'.repeat(64)
    }) as unknown as GraphifyStructuralProjectionPipelineV1;
    const projectionBatchBody = {
      schema: 'atlas.graphify-structural-projection-batch.v1' as const,
      status: 'MAPPED' as const,
      workspaceRevision,
      importContextChecksum: 'd'.repeat(64),
      pipelines: [
        pipeline('src/root.md', sourceRevision, [callerSymbol], [edge]),
        pipeline('src/helper.ts', targetSourceRevision, [helperSymbol], [])
      ],
      diagnostics: [],
      canonicalAuthority: false as const,
      writesPerformed: false as const
    };
    const projectionBatch = {
      ...projectionBatchBody,
      checksum: createHash('sha256').update(JSON.stringify(projectionBatchBody), 'utf8').digest('hex')
    };
    const result = await materializeCanonicalGraphSnapshotFromPostgres({ query } as QueryLike, {
      snapshotId,
      workspaceRevision,
      executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
      repositoryId: 'repo:root',
      sourceInventorySnapshotId: 'inventory:graphify-fixture',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-10-17T00:00:00.000Z',
      graphifyEdgeBatch: {
        snapshot: graphRevisionSnapshot,
        replayContext: {
          workspaceRevisionKey: workspaceRevision,
          graphRevision: graphRevisionSnapshot.graphRevision,
          producerRevision: 'graphify-edge-replay:v1',
          targetSourceRevisionOf: (key) => key === 'symbol:helper' ? targetSourceRevision : null
        },
        structuralProjectionBatch: projectionBatch,
        sourceBytesBySourceRef: new Map([['src/root.md', sourceBytes], ['src/helper.ts', targetSourceBytes]])
      }
    });

    expect(result.graphSnapshotEdges).toContainEqual(expect.objectContaining({
      edgeType: 'CALLS',
      sourceNodeKey: 'packet:alpha',
      targetNodeKey: 'packet:beta',
      provenance: 'graphify_structural_reference'
    }));
    expect(result.graphSnapshotNodes.filter((node) => node.nodeType === 'symbol')).toHaveLength(2);
    expect(result.graphSnapshotRelationEvents).toHaveLength(1);
    expect(result.graphSnapshotRelationParticipants.map((participant) => participant.role)).toEqual([
      'CALLER_PACKET', 'CALLER_AST_SYMBOL', 'CALLEE_AST_SYMBOL', 'CALLEE_PACKET'
    ]);
    expect(result.graphSnapshotProof.replayMatches).toBe(true);
    expect(result.graphifyReplayProof).toMatchObject({
      candidateCount: 1,
      structuralBatchChecksum: projectionBatch.checksum,
      rejectedReferences: [],
      canonicalAuthority: false,
      writesPerformed: false
    });
    expect(result.graphifyReplayProof?.batchAssemblyChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.graphifyReplayProof?.replayPlanChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(query.mock.calls.every(([sql]) => !String(sql).includes('INSERT'))).toBe(true);
  });

  it('rejects packets without canonical packet_key instead of fabricating an identity', async () => {
    const pool = {
      query: vi.fn(async (text: string) => {
        if (text.includes('FROM atlas_packets')) {
          return {
            rows: [
              {
                ...packetRows[0],
                packetKey: null
              }
            ]
          };
        }
        return { rows: [] };
      })
    } satisfies QueryLike;

    await expect(loadCanonicalGraphSnapshotInputFromPostgres(pool, {
      snapshotId,
      workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
      executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
      repositoryId: 'repo:root',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    })).rejects.toThrow(/packet_key/);
  });
});
