import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routePaths = [
  'src/routes/api/retrieval/reranked-search/+server.ts',
  'src/routes/api/tags/search/+server.ts',
];

const sharedClientPaths = [
  'src/lib/server/retrieval/orchestrator.ts',
  'src/mcp/tools/trace-kag.tool.ts',
];

describe('embedding query route adapter wiring', () => {
  it.each(routePaths)('%s uses the shared recipe adapter', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(source).toContain('executeEmbeddingInputV1');
    expect(source).toContain("mode: 'unprompted_legacy'");
    expect(source).toContain('executor: async');
  });

  it('routes dual-lane EmbeddingGemma queries through the shared provider executor', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/api/retrieval/dual-lane/+server.ts'), 'utf8');
    expect(source).toContain('executeProviderEmbeddingV1');
    expect(source).toContain("mode: 'unprompted_legacy'");
    expect(source).toContain("provider: 'ollama'");
    expect(source).toContain("baseUrl: env.OLLAMA_HOST || ENV.OLLAMA_BASE_URL");
    expect(source).toContain("modelId: 'embeddinggemma:latest'");
    expect(source).toContain('timeoutMs: 30_000');
    expect(source).not.toContain('/api/embeddings');
  });

  it('routes the shared server batch client through recipe preparation and batch validation', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/server/grpc/embedding-client.ts'), 'utf8');
    expect(source).toContain('prepareEmbeddingInputV1');
    expect(source).toContain('validateEmbeddingBatchV1(newVectors, uncachedIndices.length)');
    expect(source).toContain("taskMode?: EmbeddingInputModeV1");
  });

  it.each(sharedClientPaths)('%s uses the shared embedding client', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(source).toContain('generateEmbedding');
    expect(source).toContain("taskMode: 'unprompted_legacy'");
    expect(source).not.toContain('/api/embeddings');
  });
});
