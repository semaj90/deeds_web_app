/**
 * AST-Grep Extractor — real AST parsing via @ast-grep/napi
 *
 * Supports: TypeScript, TSX, JavaScript, JSX
 * Extracts: functions, classes, methods, arrow functions, imports,
 *           exported symbols, large-function complexity flags.
 *
 * Atlas note: byteStart/byteEnd retain ast-grep's source offsets so a later
 * structural-observation adapter can join deterministic matches back to
 * Consiliency chunk/node provenance without reconstructing offsets from lines.
 */

import type { SgNode } from '@ast-grep/napi';

export interface ExtractedFeature {
	type:
		| 'ast_function'
		| 'ast_class'
		| 'ast_method'
		| 'ast_arrow'
		| 'ast_import'
		| 'entity_person'
		| 'entity_org'
		| 'entity_location'
		| 'entity_statute'
		| 'entity_case';
	name: string;
	description: string;
	source: 'ast-grep' | 'langextract' | 'pattern';
	rawText?: string;
	lineNumber?: number;
	byteStart?: number;
	byteEnd?: number;
	ruleId?: string;
	captures?: Record<string, string>;
	confidence?: number;
}

type SgLang = 'TypeScript' | 'Tsx' | 'JavaScript' | 'Jsx';

function detectLang(hint?: string): SgLang {
	const h = (hint ?? '').toLowerCase();
	if (h.includes('tsx')) return 'Tsx';
	if (h.includes('jsx')) return 'Jsx';
	if (h.includes('js') && !h.includes('ts')) return 'JavaScript';
	return 'TypeScript';
}

function nodeRange(node: SgNode): { lineNumber: number; byteStart: number; byteEnd: number } {
	const range = node.range();
	return {
		lineNumber: range.start.line + 1,
		byteStart: range.start.index,
		byteEnd: range.end.index,
	};
}

function firstLine(text: string, maxChars = 120): string {
	return text.split('\n')[0].slice(0, maxChars);
}

/** Extract code structure using @ast-grep/napi real AST parsing. */
export async function extractAstFeatures(code: string, langHint?: string): Promise<ExtractedFeature[]> {
	const { parse } = await import('@ast-grep/napi');
	const lang = detectLang(langHint);
	let root: ReturnType<typeof parse>;
	try {
		root = parse(lang, code);
	} catch {
		try {
			root = parse('TypeScript', code);
		} catch {
			return [];
		}
	}

	const features: ExtractedFeature[] = [];
	const seen = new Set<string>();

	for (const node of root.root().findAll({ rule: { kind: 'function_declaration' } })) {
		const nameNode = node.child(1);
		const name = nameNode?.text() ?? '<anon>';
		const range = nodeRange(node);
		const key = `fn:${name}:${range.byteStart}:${range.byteEnd}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const sig = firstLine(node.text());
		const isExported = node.text().startsWith('export');
		features.push({
			type: 'ast_function',
			name,
			description: `${isExported ? 'Exported f' : 'F'}unction ${name}()`,
			source: 'ast-grep',
			rawText: sig,
			...range,
			ruleId: 'ast-grep:function-declaration',
			captures: { name },
			confidence: 0.95,
		});
	}

	for (const node of root.root().findAll({ rule: { kind: 'lexical_declaration' } })) {
		const declarator = node.find({ rule: { kind: 'variable_declarator' } });
		if (!declarator) continue;
		const arrow = declarator.find({ rule: { kind: 'arrow_function' } });
		if (!arrow) continue;
		const name = declarator.child(0)?.text() ?? '<anon>';
		const range = nodeRange(node);
		const key = `arrow:${name}:${range.byteStart}:${range.byteEnd}`;
		if (seen.has(key)) continue;
		seen.add(key);
		features.push({
			type: 'ast_arrow',
			name,
			description: `Arrow function ${name}`,
			source: 'ast-grep',
			rawText: firstLine(node.text()),
			...range,
			ruleId: 'ast-grep:arrow-function-variable',
			captures: { name },
			confidence: 0.92,
		});
	}

	for (const node of root.root().findAll({ rule: { kind: 'class_declaration' } })) {
		const nameNode = node.find({ rule: { kind: 'type_identifier' } });
		const name = nameNode?.text() ?? '<anon>';
		const range = nodeRange(node);
		const key = `cls:${name}:${range.byteStart}:${range.byteEnd}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const isExported = node.text().startsWith('export');
		features.push({
			type: 'ast_class',
			name,
			description: `${isExported ? 'Exported c' : 'C'}lass ${name}`,
			source: 'ast-grep',
			rawText: firstLine(node.text()),
			...range,
			ruleId: 'ast-grep:class-declaration',
			captures: { name },
			confidence: 0.95,
		});

		for (const method of node.findAll({ rule: { kind: 'method_definition' } })) {
			const mName = method.child(0)?.text() ?? '<anon>';
			if (['constructor', 'get', 'set'].includes(mName)) continue;
			const methodRange = nodeRange(method);
			const mKey = `method:${name}.${mName}:${methodRange.byteStart}:${methodRange.byteEnd}`;
			if (seen.has(mKey)) continue;
			seen.add(mKey);
			features.push({
				type: 'ast_method',
				name: `${name}.${mName}`,
				description: `Method ${mName}() on class ${name}`,
				source: 'ast-grep',
				rawText: firstLine(method.text()),
				...methodRange,
				ruleId: 'ast-grep:method-definition',
				captures: { class: name, method: mName },
				confidence: 0.93,
			});
		}
	}

	return features;
}

/** Parse code for external dependencies (import/require statements). */
export async function extractDependencyFeatures(code: string): Promise<ExtractedFeature[]> {
	const { parse } = await import('@ast-grep/napi');
	let root: ReturnType<typeof parse>;
	try {
		root = parse('TypeScript', code);
	} catch {
		return [];
	}

	const features: ExtractedFeature[] = [];
	const seen = new Set<string>();
	for (const node of root.root().findAll({ rule: { kind: 'import_statement' } })) {
		const spec = node.find({ rule: { kind: 'string_fragment' } });
		const moduleName = spec?.text() ?? node.text().match(/['\"]([^'\"]+)['\"]/)?.[1] ?? '';
		if (!moduleName || seen.has(moduleName)) continue;
		seen.add(moduleName);
		const range = nodeRange(node);
		features.push({
			type: 'ast_import',
			name: moduleName,
			description: `Import: ${moduleName}`,
			source: 'ast-grep',
			...range,
			ruleId: 'ast-grep:import-statement',
			captures: { module: moduleName },
			confidence: 0.98,
		});
	}
	return features;
}

/** Detect large functions as complexity/risk indicators. */
export async function extractComplexityFeatures(code: string): Promise<ExtractedFeature[]> {
	const { parse } = await import('@ast-grep/napi');
	let root: ReturnType<typeof parse>;
	try {
		root = parse('TypeScript', code);
	} catch {
		return [];
	}

	const features: ExtractedFeature[] = [];
	for (const node of root.root().findAll({ rule: { kind: 'function_declaration' } })) {
		const fnText = node.text();
		const lineCount = fnText.split('\n').length;
		if (lineCount <= 50) continue;
		const name = node.child(1)?.text() ?? '<anon>';
		const range = nodeRange(node);
		features.push({
			type: 'ast_function',
			name,
			description: `Large function ${name}() (~${lineCount} lines) — potential complexity concern`,
			source: 'ast-grep',
			...range,
			ruleId: 'ast-grep:large-function',
			captures: { name, line_count: String(lineCount) },
			confidence: 0.85,
		});
	}
	return features;
}
