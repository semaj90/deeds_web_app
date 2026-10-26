import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/lib/server/features/rag/codebase-context.ts'), 'utf8');
const embedQuery = source.match(/async function embedQuery\(text: string\): Promise<number\[\]> \{([\s\S]*?)\n\}/)?.[1] ?? '';
const clusterSummarySource = readFileSync(resolve(process.cwd(), 'src/lib/server/features/codebase-intel/indexer/cluster-summary.ts'), 'utf8');
const embeddingServiceSource = readFileSync(resolve(process.cwd(), 'src/lib/server/retrieval/embedding-service.ts'), 'utf8');
const embedSummary = clusterSummarySource.match(/async function embedSummary\(summary: string\): Promise<number\[\] \| null> \{([\s\S]*?)\n\}/)?.[1] ?? '';

describe('codebase-context semantic_768 embedding boundary', () => {
	it('uses the shared identity-gated embedding client and validates semantic_768 width', () => {
		expect(embedQuery).toContain('generateEmbeddings([prompt]');
		expect(embedQuery).toContain("taskMode: 'unprompted_legacy'");
		expect(embedQuery).toContain('result.vectors[0]');
		expect(embedQuery).toContain('isValidEmbedding(embedding)');
		expect(embedQuery).not.toContain('getCachedEmbedding');
		expect(embedQuery).not.toContain('setCachedEmbedding');
		expect(embedQuery).not.toContain('/api/embeddings');
	});

	it('routes the exact semantic_768 query path through the shared provider transport', () => {
		const exactPath = embeddingServiceSource.match(/const embedding = requireExact768([\s\S]*?)\n\s*: await requestEmbedding\(query\);/)?.[1] ?? '';
		expect(exactPath).toContain("mode: 'unprompted_legacy'");
		expect(exactPath).toContain('createProviderEmbeddingExecutorV1({');
		expect(exactPath).toContain("provider: 'ollama'");
		expect(exactPath).toContain('baseUrl: config.ollama_url');
		expect(exactPath).toContain('modelId: modelOverride');
		expect(exactPath).toContain('timeoutMs: config.timeout_ms');
		expect(embeddingServiceSource).toContain('const rawEmbedding = await requestSemantic768Embedding(formattedText) as number[];');
		expect(embeddingServiceSource).toContain('assertSemantic768(rawEmbedding);');
	});
});

describe('cluster-summary semantic_768 embedding boundary', () => {
	it('keeps the raw summary recipe and its non-fatal fallback on the shared adapter', () => {
		expect(embedSummary).toContain('executeProviderEmbeddingV1({');
		expect(embedSummary).toContain("mode: 'unprompted_legacy'");
		expect(embedSummary).toContain("provider: 'ollama'");
		expect(embedSummary).toContain('modelId: \'embeddinggemma:latest\'');
		expect(embedSummary).toContain('timeoutMs: 30_000');
		expect(embedSummary).toContain('return embedding;');
		expect(embedSummary).toContain('return null;');
		expect(embedSummary).not.toContain('/api/embeddings');
	});
});
