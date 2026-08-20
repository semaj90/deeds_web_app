import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { treeSitterAstProvenanceSchema } from '@deeds/parent-atlas';
import {
	TsMorphStructuredValueEnricher,
	findExactTsMorphNode,
	utf16OffsetToUtf8ByteOffset,
	utf8ByteOffsetToUtf16Offset,
} from './ts-morph-structured-value-enricher';

function sha(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function byteSpan(source: string, fragment: string): { start: number; end: number } {
	const startChar = source.indexOf(fragment);
	if (startChar < 0) throw new Error(`fragment not found: ${fragment}`);
	return {
		start: Buffer.byteLength(source.slice(0, startChar), 'utf8'),
		end: Buffer.byteLength(source.slice(0, startChar + fragment.length), 'utf8'),
	};
}

describe('TsMorphStructuredValueEnricher', () => {
	it('round-trips UTF-8 byte offsets across non-ASCII TypeScript text', () => {
		const source = 'const π = "😀";\nconst value = 42;';
		for (const offset of [0, source.indexOf('π'), source.indexOf('const value'), source.length]) {
			const byteOffset = utf16OffsetToUtf8ByteOffset(source, offset);
			expect(utf8ByteOffsetToUtf16Offset(source, byteOffset)).toBe(offset);
		}
	});

	it('rejects a byte offset that splits a UTF-8 sequence', () => {
		const source = 'π';
		expect(() => utf8ByteOffsetToUtf16Offset(source, 1)).toThrow(/SPLITS_UTF8_SEQUENCE/);
	});

	it('finds and enriches only the exact Tree-sitter span', () => {
		const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
		const source = 'const π = 1;\nfunction add(a: number, b: number) { return a + b; }\nconst result = add(π, 2);';
		const sourceFile = project.createSourceFile('/src/example.ts', source);
		const callText = 'add(π, 2)';
		const span = byteSpan(source, callText);
		const node = findExactTsMorphNode({ sourceFile, sourceText: source, start_byte: span.start, end_byte: span.end });
		expect(node?.getKindName()).toBe('CallExpression');

		const bytes = Buffer.from(source, 'utf8');
		const provenance = treeSitterAstProvenanceSchema.parse({
			source_ref: '/src/example.ts', source_revision: 'src-r1', workspace_revision: 'ws-r1', language: 'typescript',
			parser_name: 'NODE_TREE_SITTER', parser_revision: '0.25.1', grammar_revision: 'typescript-g1', node_type: 'call_expression',
			start_byte: span.start, end_byte: span.end, start_row: 2, start_column_bytes: 15, end_row: 2, end_column_bytes: 25,
			ast_path: [], source_span_checksum: sha(bytes.subarray(span.start, span.end)), tree_node_id: null,
			upstream_node_id: null, upstream_chunk_id: null, native_identity_span_checksum: null, identity_status: 'SPAN_ONLY', canonical_authority: false,
		});
		const enricher = new TsMorphStructuredValueEnricher({
			project,
			project_revision: 'project-r1',
			ts_morph_revision: '27',
			typescript_revision: '7-dev',
			tsconfig_ref: null,
		});
		const result = enricher.enrich({ provenance, source_text: source });
		expect(result?.exact_span_match).toBe(true);
		expect(result?.node_kind).toBe('CallExpression');
		expect(result?.resolved_signature?.parameters.map((parameter) => parameter.name)).toEqual(['a', 'b']);
		expect(result?.resolved_signature?.return_type_text).toContain('number');
	});

	it('returns null instead of attaching semantic facts to stale source text', () => {
		const project = new Project({ useInMemoryFileSystem: true });
		const source = 'const value = 1;';
		project.createSourceFile('/src/example.ts', source);
		const span = byteSpan(source, '1');
		const provenance = treeSitterAstProvenanceSchema.parse({
			source_ref: '/src/example.ts', source_revision: 'src-r1', workspace_revision: 'ws-r1', language: 'typescript',
			parser_name: 'NODE_TREE_SITTER', parser_revision: '0.25.1', grammar_revision: 'g1', node_type: 'number',
			start_byte: span.start, end_byte: span.end, start_row: 0, start_column_bytes: span.start, end_row: 0, end_column_bytes: span.end,
			ast_path: [], source_span_checksum: sha(Buffer.from(source, 'utf8').subarray(span.start, span.end)), tree_node_id: null,
			upstream_node_id: null, upstream_chunk_id: null, native_identity_span_checksum: null, identity_status: 'SPAN_ONLY', canonical_authority: false,
		});
		const enricher = new TsMorphStructuredValueEnricher({ project, project_revision: 'r1', ts_morph_revision: '27', typescript_revision: '7-dev' });
		expect(enricher.enrich({ provenance, source_text: 'const value = 2;' })).toBeNull();
	});
});
