import { describe, expect, it } from 'vitest';
import { materializeGraphSnapshot } from './graph-snapshot-materializer.js';

const snapshotId = '44444444-4444-4444-8444-444444444444';
const baseInput = {
  snapshotId,
  workspaceId: 'workspace:parent-atlas',
  sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
  identityContractVersion: 'identity-contract-v1',
  parserContractVersion: 'tree-sitter-typescript-v1',
  generatedAt: '2026-07-23T12:00:00.000Z',
  treeNodes: [
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
      metadata: { lane: 'root' },
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
      packetKey: null,
      featureId: 'feature:alpha',
      title: 'Page',
      summary: 'Page node',
      contentPreview: 'Page preview',
      domain: 'docs',
      somCluster: 2,
      communityId: 1,
      metadata: { lane: 'page' },
      ledgerType: 'canonical',
      lineageVersion: 'tree-v1'
    },
    {
      nodeId: '33333333-3333-4333-8333-333333333333',
      parentId: '99999999-9999-4999-8999-999999999999',
      rootId: '11111111-1111-4111-8111-111111111111',
      pageIndexPath: 'doc:root/page:2',
      nodeType: 'page',
      treeDepth: 1,
      sourceRef: 'src/root.md',
      filePath: 'src/root.md',
      packetKey: null,
      featureId: 'feature:orphan',
      title: 'Orphan',
      summary: 'Orphan node',
      contentPreview: 'Orphan preview',
      domain: 'docs',
      somCluster: 3,
      communityId: 1,
      metadata: { lane: 'orphan' },
      ledgerType: 'canonical',
      lineageVersion: 'tree-v1'
    }
  ],
  packets: [
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
    },
    {
      packetKey: 'packet:orphan',
      sourceRef: 'src/root.md',
      canonicalSourceRef: 'src/root.md',
      directoryPath: 'src',
      filePath: 'src/root.md',
      functionSymbol: null,
      featureId: 'feature:orphan',
      featureLabel: 'Orphan',
      titleId: null,
      communityId: 8,
      clusterId: 4,
      sha256: 'sha-orphan',
      sourceKind: 'codebase',
      sourcePath: 'src/root.md',
      topology: { lane: 'orphan' },
      vectors: {},
      metadata: { summary: 'Orphan packet' },
      domainClass: 'code',
      tags: ['orphan'],
      lineageVersion: 'packet-v1',
      ledgerType: 'canonical',
      canonical: true,
      treeNodeId: null,
      qdrantCollection: 'codebase_chunks_384_hybrid',
      qdrantVectorDim: 384
    },
    {
      packetKey: 'packet:missing-tree',
      sourceRef: 'src/root.md',
      canonicalSourceRef: 'src/root.md',
      directoryPath: 'src',
      filePath: 'src/root.md',
      functionSymbol: null,
      featureId: 'feature:missing-tree',
      featureLabel: 'Missing tree',
      titleId: null,
      communityId: 9,
      clusterId: 5,
      sha256: 'sha-missing-tree',
      sourceKind: 'codebase',
      sourcePath: 'src/root.md',
      topology: { lane: 'missing-tree' },
      vectors: {},
      metadata: { summary: 'Missing tree packet' },
      domainClass: 'code',
      tags: ['missing-tree'],
      lineageVersion: 'packet-v1',
      ledgerType: 'canonical',
      canonical: true,
      treeNodeId: '99999999-9999-4999-8999-999999999999',
      qdrantCollection: 'codebase_chunks_384_hybrid',
      qdrantVectorDim: 384
    }
  ]
} as const;

describe('graph snapshot materializer', () => {
  it('materializes a deterministic immutable snapshot with exclusion accounting', () => {
    const left = materializeGraphSnapshot(baseInput);
    const right = materializeGraphSnapshot({
      ...baseInput,
      treeNodes: [...baseInput.treeNodes].reverse(),
      packets: [...baseInput.packets].reverse()
    });

    expect(left.graphSnapshot.snapshotId).toBe(snapshotId);
    expect(left.graphSnapshot.status).toBe('BUILDING');
    expect(left.graphSnapshotManifest.status).toBe('MATERIALIZED');
    expect(left.graphSnapshotManifest.topologyHash).toBe(left.graphSnapshot.topologyHash);
    expect(left.graphSnapshotProof.replayMatches).toBe(true);
    expect(left.graphSnapshotProof.topologyHash).toBe(left.graphSnapshotProof.replayedTopologyHash);
    expect(left.graphSnapshotProof.topologyHash).toBe(right.graphSnapshotProof.topologyHash);

    expect(left.graphSnapshotNodes.every((node) => node.snapshotId === snapshotId)).toBe(true);
    expect(left.graphSnapshotEdges.every((edge) => edge.snapshotId === snapshotId)).toBe(true);
    expect(left.graphSnapshotExclusions.every((exclusion) => exclusion.snapshotId === snapshotId)).toBe(true);

    expect(left.graphSnapshotManifest).toMatchObject({
      snapshotId,
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      nodeCount: 4,
      edgeCount: 2,
      excludedNodeCount: 2,
      excludedEdgeCount: 1,
      status: 'MATERIALIZED'
    });

    expect(left.graphSnapshotProof).toMatchObject({
      snapshotId,
      eligibleNodeCount: 4,
      persistedNodeCount: 4,
      eligibleEdgeCount: 2,
      persistedEdgeCount: 2,
      excludedNodeCount: 2,
      excludedEdgeCount: 1,
      unresolvedEndpointCount: 2,
      duplicateRelationCount: 0,
      selfLoopCount: 0
    });

    expect(left.graphSnapshotExclusions.map((item) => item.exclusionReason)).toEqual(
      expect.arrayContaining(['MISSING_PARENT_NODE', 'MISSING_TREE_NODE_ID', 'UNRESOLVED_TREE_NODE_ID'])
    );
    expect(left.graphSnapshotProof.topologyHash).toBe(right.graphSnapshotProof.topologyHash);
  });

  it('records duplicate identities and self loops as exclusions instead of dropping them silently', () => {
    const result = materializeGraphSnapshot({
      ...baseInput,
      treeNodes: [
        baseInput.treeNodes[0],
        {
          nodeId: '44444444-4444-4444-8444-444444444444',
          parentId: '44444444-4444-4444-8444-444444444444',
          rootId: '11111111-1111-4111-8111-111111111111',
          pageIndexPath: 'doc:root/page:self',
          nodeType: 'page',
          treeDepth: 1,
          sourceRef: 'src/root.md',
          filePath: 'src/root.md',
          packetKey: null,
          featureId: 'feature:self',
          title: 'Self loop',
          summary: 'Self loop node',
          contentPreview: 'Self loop preview',
          domain: 'docs',
          somCluster: 4,
          communityId: 1,
          metadata: { lane: 'self' },
          ledgerType: 'canonical',
          lineageVersion: 'tree-v1'
        },
        {
          nodeId: '44444444-4444-4444-8444-444444444444',
          parentId: '44444444-4444-4444-8444-444444444444',
          rootId: '11111111-1111-4111-8111-111111111111',
          pageIndexPath: 'doc:root/page:self',
          nodeType: 'page',
          treeDepth: 1,
          sourceRef: 'src/root.md',
          filePath: 'src/root.md',
          packetKey: null,
          featureId: 'feature:self',
          title: 'Self loop duplicate',
          summary: 'Self loop duplicate node',
          contentPreview: 'Self loop duplicate preview',
          domain: 'docs',
          somCluster: 4,
          communityId: 1,
          metadata: { lane: 'self-duplicate' },
          ledgerType: 'canonical',
          lineageVersion: 'tree-v1'
        }
      ],
      packets: [
        baseInput.packets[0],
        {
          ...baseInput.packets[0],
          metadata: { summary: 'Duplicate packet identity' }
        }
      ]
    });

    expect(result.graphSnapshotManifest.excludedNodeCount).toBeGreaterThanOrEqual(2);
    expect(result.graphSnapshotProof.selfLoopCount).toBe(1);
    expect(result.graphSnapshotExclusions.map((item) => item.exclusionReason)).toEqual(
      expect.arrayContaining(['TREE_SELF_LOOP', 'DUPLICATE_TREE_NODE_ID', 'DUPLICATE_PACKET_KEY'])
    );
  });
});
