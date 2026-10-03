import { describe, expect, it } from 'vitest';
import { coordinateAnalyzeThis } from './analyze-this-coordinator.js';

describe('analyze-this coordinator', () => {
	it('deduplicates evidence at the file level and returns deterministic top-K results', () => {
		const request = {
			query: 'packet identity',
			topK: 2,
			evidence: [
				{ kind: 'rg' as const, filePath: 'b.ts', score: 0.7, snippet: 'b' },
				{ kind: 'ast-grep' as const, filePath: 'a.ts', sourceRef: 'a.ts', score: 0.9, startByte: 2, endByte: 8 },
				{ kind: 'postgres' as const, filePath: 'a.ts', sourceRef: 'a.ts', score: 0.8, sourceRevision: 'sha256:source', contentHash: 'sha256:content' },
				{ kind: 'web' as const, filePath: 'c.ts', score: 1.0 },
			],
		};
		const first = coordinateAnalyzeThis(request);
		const second = coordinateAnalyzeThis(request);
		expect(first.files.map((file) => file.filePath)).toEqual(['c.ts', 'a.ts']);
		expect(first.files[1]?.evidence).toHaveLength(2);
		expect(first.contextManifest.checksum).toBe(second.contextManifest.checksum);
		expect(first.canonicalAuthority).toBe(false);
		expect(first.writesPerformed).toBe(false);
	});

	it('labels dirty worktree analysis as noncanonical even when evidence has revisions', () => {
		const result = coordinateAnalyzeThis({
			query: 'analyze this',
			sourceMode: 'WORKTREE_DIAGNOSTIC',
			evidence: [{ kind: 'tree-sitter', filePath: 'src/app.ts', sourceRevision: 'sha256:source', score: 1 }],
		});
		expect(result.sourceMode).toBe('WORKTREE_DIAGNOSTIC');
		expect(result.canonicalAuthority).toBe(false);
	});

	it('preserves structural provenance and rejects invalid spans', () => {
		const result = coordinateAnalyzeThis({
			query: 'span',
			evidence: [{ kind: 'ast-grep', filePath: 'src/app.ts', sourceRef: 'src/app.ts', parserRevision: 'tree-sitter:v1', startByte: 4, endByte: 12, score: 1 }],
		});
		expect(result.files[0]?.evidence[0]).toMatchObject({ parserRevision: 'tree-sitter:v1', startByte: 4, endByte: 12 });
		expect(() => coordinateAnalyzeThis({ query: 'bad', evidence: [{ kind: 'ast-grep', filePath: 'x.ts', startByte: 8, endByte: 2, score: 1 }] })).toThrow('ANALYZE_THIS_END_BYTE_INVALID');
	});
});
