// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fromQdrantPoint, fromRankedChunk } from './retrieval.js';

describe('retrieval gpu cluster preservation', () => {
  it('preserves gpuCluster through the unified retrieval normalizers', () => {
    const qdrantResult = fromQdrantPoint(
      {
        id: 'pt-1',
        score: 0.87,
        payload: {
          content: 'export const value = 1;',
          gpu_cluster: 7,
          som_cluster: 3,
          neo4j_gpuCluster: 9,
          tags: ['code'],
        },
      },
      {
        kind: 'code_chunk',
        collection: 'codebase_chunks_768',
      }
    );

    expect(qdrantResult.gpuCluster).toBe(7);
    expect(qdrantResult.somCluster).toBe(3);

    const rankedChunk = fromRankedChunk(
      {
        path: 'src/lib/example.ts',
        relativePath: 'src/lib/example.ts',
        symbol: 'example',
        kind: 'file',
        content: 'export const example = true;',
        signature: 'export const example = true;',
        tags: ['code'],
        score: 0.91,
        lineStart: 1,
        lineEnd: 1,
        gpuCluster: 5,
      },
      {}
    );

    expect(rankedChunk.gpuCluster).toBe(5);
    expect(rankedChunk.somCluster).toBe(5);
  });
});