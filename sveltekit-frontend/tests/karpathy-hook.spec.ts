import { describe, it, expect } from 'vitest';
import { generateChunkId, generateFileId } from '../src/lib/server/indexer/chunk-id.js';
import { processKarpathyHook, type KarpathyHookInput } from '../src/lib/server/indexer/karpathy-hook.js';

vi.mock('../src/lib/server/indexer/summary-lens-generator.js', () => ({
	generateSummaryLenses: async () => [
		{ lensType: 'purpose', success: true },
		{ lensType: 'retrieval_role', success: true },
		{ lensType: 'api_surface', success: true }
	]
}));

describe('Karpathy Hook', () => {
	it('generates stable, deterministic chunk IDs', () => {
		const params = {
			repoName: 'deeds-web',
			filePath: 'src/lib/test.ts',
			content: 'const x = 1;',
			startLine: 1,
			endLine: 1
		};

		const id1 = generateChunkId(params);
		const id2 = generateChunkId(params);

		expect(id1).toBe(id2);
		expect(id1).toContain('chunk:');
		
		const id3 = generateChunkId({ ...params, content: 'const x = 2;' });
		expect(id1).not.toBe(id3);
	});

	it('processes file evidence into multi-backend exports', async () => {
		const input: KarpathyHookInput = {
			repoRoot: '/app',
			runId: 'test-run',
			source: 'rg',
			files: [
				{
					filePath: 'src/lib/server/ai/ace.ts',
					content: 'export const ace = {}',
					contentHash: 'hash1',
					audit: { 'auth-check': true },
					graph: { pageRank: 0.9 }
				}
			]
		};

		const output = await processKarpathyHook(input);

		expect(output.stats.filesSeen).toBe(1);
		expect(output.stats.chunksCreated).toBe(1);
		expect(output.neo4jEdges.length).toBeGreaterThan(0);
		expect(output.qdrantPayloads[0].payload.path).toBe('src/lib/server/ai/ace.ts');
		expect(output.libtorchRows[0].stableKey).toBe(output.chunks[0].id);
		
		// Verify Tier 2 summary trigger for high PageRank
		expect(output.stats.summariesCreated).toBe(3);
	});
});
