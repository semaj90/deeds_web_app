// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  protoLoad: vi.fn(async () => ({})),
  loadPackageDefinition: vi.fn(),
  searchChunksRpc: vi.fn(),
  topologyRpc: vi.fn(),
  retrievalServiceCtor: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    RETRIEVAL_GRPC_URL: '127.0.0.1:50053',
    RETRIEVAL_GRPC_ENABLED: true,
    RETRIEVAL_HTTP_URL: 'http://127.0.0.1:8100',
    RETRIEVAL_HTTP_ENABLED: false,
    GO_SEARCH_URL: 'http://127.0.0.1:8096',
    GO_SEARCH_GRPC_URL: '127.0.0.1:50055',
  },
}));

vi.mock('@grpc/proto-loader', () => ({
  load: (...args: unknown[]) => mocks.protoLoad(...args),
}));

vi.mock('@grpc/grpc-js', () => ({
  credentials: {
    createInsecure: vi.fn(() => 'insecure-creds'),
  },
  loadPackageDefinition: (...args: unknown[]) => mocks.loadPackageDefinition(...args),
}));

describe('retrieval-client gRPC mapping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.searchChunksRpc.mockImplementation(
      (_request: unknown, _options: unknown, callback: (err: Error | null, response: unknown) => void) => {
        callback(null, {
          results: [
            {
              id: 'chunk-1',
              chunkId: 'chunk-1',
              contentPreview: 'search chunk preview',
              kind: 'route',
              httpMethod: 'GET',
              routeId: '/cases/[id]',
              tags: ['route', 'svelte'],
              sourceMetadata: {
                source: 'qdrant',
                sourceId: 'chunk-1',
                sourceType: 'codebase_chunk',
                url: 'https://example.test/cases',
                title: 'Cases route',
                filePath: 'src/routes/cases/[id]/+page.svelte',
                routeId: '/cases/[id]',
                collection: 'codebase_chunks_768',
                metadata: {
                  repo: 'frontend',
                  feature: 'cases',
                },
              },
              scoreMetadata: {
                score: 0.91,
                semanticScore: 0.87,
                lexicalScore: 0.31,
                rerankScore: 0.95,
              },
              clusterMetadata: {
                clusterId: 'gpu-4',
                clusterType: 'gpu',
                gpuCluster: 4,
                somCluster: 12,
                bmuRow: 3,
                bmuCol: 9,
              },
              timestamps: {
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:01:00.000Z',
                indexedAt: '2026-04-22T00:02:00.000Z',
              },
              filePath: 'src/routes/cases/[id]/+page.svelte',
              startLine: 10,
              endLine: 24,
            },
          ],
          totalMs: 12.4,
        });
      }
    );

    mocks.topologyRpc.mockImplementation(
      (_request: unknown, _options: unknown, callback: (err: Error | null, response: unknown) => void) => {
        callback(null, {
          neighbors: [
            {
              id: 'topology-1',
              chunkId: 'topology-1',
              contentPreview: 'neighbor preview',
              kind: 'component',
              httpMethod: '',
              routeId: '/dashboard',
              tags: ['component'],
              sourceMetadata: {
                source: 'qdrant',
                sourceId: 'topology-1',
                sourceType: 'codebase_chunk',
                filePath: 'src/lib/components/DashboardCard.svelte',
                routeId: '/dashboard',
                collection: 'codebase_chunks_768',
                metadata: {
                  repo: 'frontend',
                },
              },
              scoreMetadata: {
                score: 0.72,
                semanticScore: 0.72,
              },
              clusterMetadata: {
                clusterId: 'som-17',
                clusterType: 'som',
                somCluster: 17,
                bmuRow: 7,
                bmuCol: 8,
              },
              filePath: 'src/lib/components/DashboardCard.svelte',
              startLine: 4,
              endLine: 18,
            },
          ],
          somMetadataJson: '{"radius":1}',
          clusterMetadata: {
            clusterId: 'som-17',
            clusterType: 'som',
            somCluster: 17,
            bmuRow: 7,
            bmuCol: 8,
          },
        });
      }
    );

    mocks.retrievalServiceCtor.mockImplementation(() => ({
      searchChunks: (...args: unknown[]) => mocks.searchChunksRpc(...args),
      getTopologyContext: (...args: unknown[]) => mocks.topologyRpc(...args),
    }));

    mocks.loadPackageDefinition.mockReturnValue({
      yorha: {
        retrieval: {
          RetrievalService: mocks.retrievalServiceCtor,
        },
      },
    });
  });

  it('maps expanded SearchChunksResponse metadata into RetrievedCodebaseChunk', async () => {
    const { searchChunksViaGrpc } = await import('./retrieval-client.js');

    const response = await searchChunksViaGrpc('cases auth route', 5, 'codebase_chunks_768');

    expect(response).toMatchObject({
      totalMs: 12.4,
      results: [
        {
          id: 'chunk-1',
          chunkId: 'chunk-1',
          filePath: 'src/routes/cases/[id]/+page.svelte',
          kind: 'route',
          httpMethod: 'GET',
          routeId: '/cases/[id]',
          source: 'qdrant',
          sourceId: 'chunk-1',
          sourceType: 'codebase_chunk',
          url: 'https://example.test/cases',
          title: 'Cases route',
          collection: 'codebase_chunks_768',
          sourceMetadata: {
            repo: 'frontend',
            feature: 'cases',
          },
          tags: ['route', 'svelte'],
          contentPreview: 'search chunk preview',
          score: 0.91,
          semanticScore: 0.87,
          lexicalScore: 0.31,
          rerankScore: 0.95,
          clusterId: 'gpu-4',
          clusterType: 'gpu',
          gpuCluster: 4,
          somCluster: 12,
          bmuRow: 3,
          bmuCol: 9,
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:01:00.000Z',
          indexedAt: '2026-04-22T00:02:00.000Z',
          startLine: 10,
          endLine: 24,
        },
      ],
    });
  });

  it('maps TopologyResponse root cluster metadata and neighbor chunks', async () => {
    const { getTopologyContextViaGrpc } = await import('./retrieval-client.js');

    const response = await getTopologyContextViaGrpc(7, 8, 1);

    expect(response).toMatchObject({
      somMetadataJson: '{"radius":1}',
      clusterMetadata: {
        clusterId: 'som-17',
        clusterType: 'som',
        somCluster: 17,
        bmuRow: 7,
        bmuCol: 8,
      },
      neighbors: [
        {
          id: 'topology-1',
          chunkId: 'topology-1',
          filePath: 'src/lib/components/DashboardCard.svelte',
          kind: 'component',
          routeId: '/dashboard',
          source: 'qdrant',
          sourceId: 'topology-1',
          sourceType: 'codebase_chunk',
          collection: 'codebase_chunks_768',
          sourceMetadata: {
            repo: 'frontend',
          },
          score: 0.72,
          semanticScore: 0.72,
          clusterId: 'som-17',
          clusterType: 'som',
          somCluster: 17,
          bmuRow: 7,
          bmuCol: 8,
          startLine: 4,
          endLine: 18,
        },
      ],
    });
  });
});