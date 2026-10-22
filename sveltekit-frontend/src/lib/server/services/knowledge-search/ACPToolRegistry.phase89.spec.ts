import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeACPTool, getACPToolRegistry, getACPToolSchema, toolSupportsDryRun } from './ACPToolRegistry.js';

describe('ACP tool registry phase89 workflow', () => {
	it('registers the board workflow tool for ACP discovery', () => {
		const registry = getACPToolRegistry();
		const tool = registry.get('phase89:board-workflow');

		expect(tool?.name).toBe('phase89:board-workflow');
		expect(tool?.category).toBe('error-analysis');
		expect(toolSupportsDryRun('phase89:board-workflow')).toBe(true);
	});
});

describe('ACP NLP sidecar tools', () => {
	it('registers all sidecar tools as dry-run capable', () => {
		for (const name of ['nlp:capabilities', 'nlp:analyze', 'nlp:ast-chunk']) {
			expect(getACPToolSchema(name)?.name).toBe(name);
			expect(toolSupportsDryRun(name)).toBe(true);
		}
	});

	it('plans valid analysis and AST requests without contacting the sidecar', async () => {
		const analysis = await executeACPTool('nlp:analyze', { text: 'The court held that...', passes: ['linguistic'] }, { dryRun: true });
		const ast = await executeACPTool('nlp:ast-chunk', {
			source: 'export function foo() {}',
			language: 'typescript',
			filePath: 'src/foo.ts',
			sourceRevision: 'sha256:abc'
		}, { dryRun: true });

		expect(analysis.success).toBe(true);
		expect(ast.success).toBe(true);
	});

	it('rejects invalid or oversized requests before network I/O', async () => {
		const invalidMode = await executeACPTool('nlp:analyze', { text: 'x', extraction_mode: 'unknown' }, { dryRun: true });
		const oversizedSource = await executeACPTool('nlp:ast-chunk', {
			source: 'x'.repeat(200_001),
			language: 'typescript',
			filePath: 'src/foo.ts',
			sourceRevision: 'sha256:abc'
		}, { dryRun: true });

		expect(invalidMode.success).toBe(false);
		expect(oversizedSource.success).toBe(false);
	});

	describe('nlp:ast-chunk scan completeness (fail closed)', () => {
		const astArgs = {
			source: 'export function foo() {}',
			language: 'typescript',
			filePath: 'src/foo.ts',
			sourceRevision: 'sha256:abc'
		};

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('returns success when the sidecar reports COMPLETE', async () => {
			vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
				scan_completeness: 'COMPLETE',
				scan_failure: null,
				chunks: []
			}), { status: 200, headers: { 'Content-Type': 'application/json' } })));

			const result = await executeACPTool('nlp:ast-chunk', astArgs);
			expect(result.success).toBe(true);
		});

		it('fails when the sidecar reports PARTIAL_AST_FAILED', async () => {
			vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
				scan_completeness: 'PARTIAL_AST_FAILED',
				scan_failure: 'RuntimeError: chunker exploded',
				chunks: []
			}), { status: 200, headers: { 'Content-Type': 'application/json' } })));

			const result = await executeACPTool('nlp:ast-chunk', astArgs);
			expect(result.success).toBe(false);
			expect(result.error).toContain('PARTIAL_AST_FAILED');
			expect(result.error).toContain('chunker exploded');
		});

		it('fails when the receipt field is missing (older sidecar)', async () => {
			vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ chunks: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})));

			const result = await executeACPTool('nlp:ast-chunk', astArgs);
			expect(result.success).toBe(false);
			expect(result.error).toContain('MISSING_RECEIPT');
		});

		it('fails (never succeeds) when the sidecar call times out or is aborted', async () => {
			vi.stubGlobal('fetch', vi.fn(async () => {
				throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
			}));

			const result = await executeACPTool('nlp:ast-chunk', astArgs);
			expect(result.success).toBe(false);
			expect(result.error).toContain('timeout');
		});
	});
});
