/**
 * AST-Grep Extractor — real AST parsing via @ast-grep/napi
 *
 * Supports: TypeScript, TSX, JavaScript, JSX
 * Extracts: functions, classes, methods, arrow functions, imports,
 *           exported symbols, large-function complexity flags.
 *
 * All results are tagged source='ast-grep' with confidence=0.95.
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
	confidence?: number;
}

type SgLang = 'TypeScript' | 'Tsx' | 'JavaScript' | 'Jsx';

function detectLang(hint?: string): SgLang {
	const h = (hint ?? '').toLowerCase();
	if (h.includes('tsx')) return 'Tsx';
	if (h.includes('jsx')) return 'Jsx';
	if (h.includes('js') && !h.includes('ts')) return 'JavaScript';
	return 'TypeScript'; // default — handles both TS and TSX safely
}

function lineOf(node: SgNode): number {
	return node.range().start.line + 1;
}

function firstLine(text: string, maxChars = 120): string {
	return text.split('\n')[0].slice(0, maxChars);
}

/**
 * Extract code structure using @ast-grep/napi real AST parsing.
 * Returns function signatures, class definitions, method contracts.
 */
export async function extractAstFeatures(
	code: string,
	langHint?: string,
): Promise<ExtractedFeature[]> {
	const { parse } = await import('@ast-grep/napi');

	const lang = detectLang(langHint);
	let root: ReturnType<typeof parse>;
	try {
		root = parse(lang, code);
	} catch {
		// Retry with plain TypeScript if TSX/JSX parse fails
		try {
			root = parse('TypeScript', code);
		} catch {
			return [];
		}
	}

	const features: ExtractedFeature[] = [];
	const seen = new Set<string>(); // deduplicate by name+line

	// ── Named functions ───────────────────────────────────────────────────────
	for (const node of root.root().findAll({ rule: { kind: 'function_declaration' } })) {
		const nameNode = node.child(1); // identifier after 'function' keyword
		const name = nameNode?.text() ?? '<anon>';
		const line = lineOf(node);
		const key = `fn:${name}:${line}`;
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
			lineNumber: line,
			confidence: 0.95,
		});
	}

	// ── Arrow function variables (const fn = () => ...) ───────────────────────
	for (const node of root.root().findAll({ rule: { kind: 'lexical_declaration' } })) {
		const declarator = node.find({ rule: { kind: 'variable_declarator' } });
		if (!declarator) continue;
		const arrow = declarator.find({ rule: { kind: 'arrow_function' } });
		if (!arrow) continue;
		const nameNode = declarator.child(0);
		const name = nameNode?.text() ?? '<anon>';
		const line = lineOf(node);
		const key = `arrow:${name}:${line}`;
		if (seen.has(key)) continue;
		seen.add(key);

		features.push({
			type: 'ast_arrow',
			name,
			description: `Arrow function ${name}`,
			source: 'ast-grep',
			rawText: firstLine(node.text()),
			lineNumber: line,
			confidence: 0.92,
		});
	}

	// ── Classes ───────────────────────────────────────────────────────────────
	for (const node of root.root().findAll({ rule: { kind: 'class_declaration' } })) {
		const nameNode = node.find({ rule: { kind: 'type_identifier' } });
		const name = nameNode?.text() ?? '<anon>';
		const line = lineOf(node);
		const key = `cls:${name}:${line}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const isExported = node.text().startsWith('export');
		features.push({
			type: 'ast_class',
			name,
			description: `${isExported ? 'Exported c' : 'C'}lass ${name}`,
			source: 'ast-grep',
			rawText: firstLine(node.text()),
			lineNumber: line,
			confidence: 0.95,
		});

		// Methods inside the class
		for (const method of node.findAll({ rule: { kind: 'method_definition' } })) {
			const mName = method.child(0)?.text() ?? '<anon>';
			if (['constructor', 'get', 'set'].includes(mName)) continue;
			const mLine = lineOf(method);
			const mKey = `method:${name}.${mName}:${mLine}`;
			if (seen.has(mKey)) continue;
			seen.add(mKey);

			features.push({
				type: 'ast_method',
				name: `${name}.${mName}`,
				description: `Method ${mName}() on class ${name}`,
				source: 'ast-grep',
				rawText: firstLine(method.text()),
				lineNumber: mLine,
				confidence: 0.93,
			});
		}
	}

	return features;
}

/**
 * Parse code for external dependencies (import/require statements).
 */
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

	// ES module imports
	for (const node of root.root().findAll({ rule: { kind: 'import_declaration' } })) {
		// Find the string literal (module specifier)
		const spec = node.find({ rule: { kind: 'string_fragment' } });
		const moduleName = spec?.text() ?? node.text().match(/['"]([^'"]+)['"]/)?.[1] ?? '';
		if (!moduleName || seen.has(moduleName)) continue;
		seen.add(moduleName);

		features.push({
			type: 'ast_function', // reuses existing type; caller groups by source='ast-grep'
			name: moduleName,
			description: `Import: ${moduleName}`,
			source: 'ast-grep',
			lineNumber: lineOf(node),
			confidence: 0.98,
		});
	}

	return features;
}

/**
 * Detect large functions as complexity/risk indicators.
 */
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

		const nameNode = node.child(1);
		const name = nameNode?.text() ?? '<anon>';
		features.push({
			type: 'ast_function',
			name,
			description: `Large function ${name}() (~${lineCount} lines) — potential complexity concern`,
			source: 'ast-grep',
			lineNumber: lineOf(node),
			confidence: 0.85,
		});
	}

	return features;
}
