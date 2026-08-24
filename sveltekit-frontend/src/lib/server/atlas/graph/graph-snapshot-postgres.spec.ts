import { describe, expect, it, vi } from 'vitest';
import { loadCanonicalGraphSnapshotInputFromPostgres, materializeCanonicalGraphSnapshotFromPostgres, type QueryLike } from './graph-snapshot-postgres.js';

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
    packetKey: 'packet:alpha',
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
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    });

    expect(loaded.snapshotId).toBe(snapshotId);
    expect(loaded.treeNodes).toHaveLength(2);
    expect(loaded.packets).toHaveLength(1);
    expect(loaded.packets[0].packetKey).toBe('packet:alpha');
    expect(loaded.treeNodes[1].packetKey).toBe('packet:alpha');

    const materialized = await materializeCanonicalGraphSnapshotFromPostgres(pool, {
      snapshotId,
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    });

    expect(materialized.graphSnapshot.snapshotId).toBe(snapshotId);
    expect(materialized.graphSnapshotManifest.status).toBe('MATERIALIZED');
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
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    });

    expect(loaded.packets).toHaveLength(1);
    expect(loaded.packets[0].packetKey).toBe('packet:alpha');
    expect(loaded.treeNodes).toHaveLength(2);
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
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: 'inventory:2026-07-23T12:00:00Z',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt: '2026-07-23T12:00:00.000Z'
    })).rejects.toThrow(/packet_key/);
  });
});
