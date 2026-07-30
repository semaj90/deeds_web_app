import { describe, expect, it } from 'vitest';
import {
	buildConceptVector12,
	buildKeyValuePairs,
	chunkCodeSemanticallViaTreeChunker,
	classifyCodeIntelDomain,
	extractConceptsViAstGrep,
	extractImportSources,
} from './code-intel-service.js';

describe('code intel corpus helpers', () => {
	it('classifies shared data code and emits a 12-dim concept vector', () => {
		const source = [
			"import { db } from 'drizzle-orm';",
			'export async function GET() {',
			'  return db.select();',
			'}',
			'',
		].join('\n');

		const imports = extractImportSources(source);
		const concepts = extractConceptsViAstGrep(source, 'src/routes/api/demo/+server.ts');
		const classification = classifyCodeIntelDomain(source, 'src/routes/api/demo/+server.ts', imports);
		const vector = buildConceptVector12(classification.domain, concepts, source, 'src/routes/api/demo/+server.ts', classification.confidence);
		const chunks = chunkCodeSemanticallViaTreeChunker(source);
		const kv = buildKeyValuePairs({
			filePath: 'src/routes/api/demo/+server.ts',
			symbol: 'GET',
			kind: 'function',
			domain: classification.domain,
			lineStart: 1,
			lineEnd: 4,
			concepts,
			imports,
		});

		expect(imports).toContain('drizzle-orm');
		expect(classification.domain).toBe('DATA');
		expect(vector).toHaveLength(12);
		expect(concepts.length).toBeGreaterThan(0);
		expect(chunks.length).toBeGreaterThan(0);
		expect(kv.some((pair) => pair.key === 'domain' && pair.value === 'DATA')).toBe(true);
		expect(kv.some((pair) => pair.key === 'symbol' && pair.value === 'GET')).toBe(true);
	});

	it('emits AST-grep concepts for route handlers', () => {
		const source = [
			"import { db } from 'drizzle-orm';",
			'export async function POST() {',
			'  return new Response("ok");',
			'}',
		].join('\n');

		const concepts = extractConceptsViAstGrep(source, 'src/routes/api/demo/+server.ts');

		expect(concepts.map((concept) => concept.concept)).toContain('api_route_handler');
		expect(concepts.every((concept) => typeof concept.line === 'number')).toBe(true);
	});
});
