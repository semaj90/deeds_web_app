#!/usr/bin/env node
/**
 * Phase 89: AST Signature Indexer
 *
 * Extracts structural metadata from TypeScript/Svelte files and indexes in Qdrant
 * - Imports/Exports (what this file depends on/provides)
 * - Top-level declarations (functions, classes, interfaces, types)
 * - Runes usage (Svelte 5 state management)
 * - Shape metrics (LOC, complexity, dependencies)
 *
 * Output: phase89_ast_embeddings collection in Qdrant
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { parse } from '@typescript-eslint/typescript-estree';
import { createHash } from 'crypto';
import * as fs from 'fs';
import { glob } from 'glob';
import ollama from 'ollama';
import * as path from 'path';

// Configuration
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const COLLECTION_NAME = 'phase89_ast_embeddings';
const EMBEDDING_DIM = 1024; // embeddinggemma:latest
const MODEL = 'embeddinggemma:latest';

const client = new QdrantClient({ url: QDRANT_URL });

/**
 * Extract AST signature from a file
 */
async function extractASTSignature(filePath) {
	const content = fs.readFileSync(filePath, 'utf-8');
	const ext = path.extname(filePath);

	// Skip non-TypeScript/Svelte files
	if (!['.ts', '.tsx', '.svelte', '.js', '.mjs'].includes(ext)) {
		return null;
	}

	let code = content;

	// For Svelte files, extract script content
	if (ext === '.svelte') {
		const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		if (!scriptMatch) return null;
		code = scriptMatch[1];
	}

	try {
		const ast = parse(code, {
			jsx: ext === '.tsx',
			loc: true,
			range: true,
			tokens: false,
			comment: false,
			errorOnUnknownASTType: false
		});

		// Extract imports
		const imports = ast.body
			.filter(node => node.type === 'ImportDeclaration')
			.map(node => ({
				source: node.source.value,
				specifiers: node.specifiers.map(spec => {
					if (spec.type === 'ImportDefaultSpecifier') {
						return { type: 'default', name: spec.local.name };
					} else if (spec.type === 'ImportNamespaceSpecifier') {
						return { type: 'namespace', name: spec.local.name };
					} else {
						return {
							type: 'named',
							name: spec.imported?.name || spec.local.name,
							alias: spec.local.name !== spec.imported?.name ? spec.local.name : null
						};
					}
				})
			}));

		// Extract exports
		const exports = ast.body
			.filter(node => node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' || node.type === 'ExportAllDeclaration')
			.map(node => {
				if (node.type === 'ExportDefaultDeclaration') {
					return { type: 'default', name: 'default' };
				} else if (node.type === 'ExportAllDeclaration') {
					return { type: 'all', source: node.source?.value };
				} else {
					return {
						type: 'named',
						declarations: node.declaration ? extractDeclarationNames(node.declaration) : [],
						specifiers: node.specifiers?.map(spec => spec.exported?.name || spec.local?.name) || []
					};
				}
			});

		// Extract top-level declarations
		const declarations = ast.body
			.filter(node =>
				node.type === 'FunctionDeclaration' ||
				node.type === 'ClassDeclaration' ||
				node.type === 'TSInterfaceDeclaration' ||
				node.type === 'TSTypeAliasDeclaration' ||
				node.type === 'VariableDeclaration'
			)
			.map(node => ({
				type: node.type,
				name: extractDeclarationNames(node),
				loc: node.loc
			}));

		// Detect Svelte 5 runes usage
		const runesUsage = detectRunesUsage(code);

		// Compute shape metrics
		const lines = content.split('\n').length;
		const complexity = estimateComplexity(ast);
		const dependencyCount = imports.length;
		const exportCount = exports.length;

		return {
			filePath,
			imports,
			exports,
			declarations,
			runesUsage,
			metrics: {
				lines,
				complexity,
				dependencyCount,
				exportCount,
				declarationCount: declarations.length
			},
			hash: createHash('md5').update(content).digest('hex')
		};
	} catch (err) {
		console.error(`   ❌ Parse error in ${filePath}:`, err.message);
		return null;
	}
}

/**
 * Extract declaration names from AST node
 */
function extractDeclarationNames(node) {
	if (!node) return [];

	if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
		return node.id?.name ? [node.id.name] : [];
	}

	if (node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration') {
		return [node.id.name];
	}

	if (node.type === 'VariableDeclaration') {
		return node.declarations
			.map(decl => decl.id?.name)
			.filter(Boolean);
	}

	return [];
}

/**
 * Detect Svelte 5 runes ($state, $derived, $effect, $props)
 */
function detectRunesUsage(code) {
	const runes = {
		$state: false,
		$derived: false,
		$effect: false,
		$props: false,
		$bindable: false,
		$host: false,
		$inspect: false
	};

	for (const rune of Object.keys(runes)) {
		if (code.includes(rune)) {
			runes[rune] = true;
		}
	}

	return runes;
}

/**
 * Estimate code complexity (simple cyclomatic complexity)
 */
function estimateComplexity(ast) {
	let complexity = 1; // Base complexity

	function walk(node) {
		if (!node || typeof node !== 'object') return;

		// Branch points increase complexity
		if (
			node.type === 'IfStatement' ||
			node.type === 'ConditionalExpression' ||
			node.type === 'SwitchCase' ||
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement' ||
			node.type === 'WhileStatement' ||
			node.type === 'DoWhileStatement' ||
			node.type === 'CatchClause' ||
			(node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||'))
		) {
			complexity++;
		}

		// Recursively walk children
		for (const key of Object.keys(node)) {
			const child = node[key];
			if (Array.isArray(child)) {
				child.forEach(walk);
			} else if (child && typeof child === 'object') {
				walk(child);
			}
		}
	}

	walk(ast);
	return complexity;
}

/**
 * Generate embedding for AST signature
 */
async function generateEmbedding(signature) {
	// Create textual representation of AST signature
	const text = [
		`File: ${signature.filePath}`,
		`\nImports (${signature.imports.length}):`,
		...signature.imports.map(imp => `  - ${imp.source}: ${imp.specifiers.map(s => s.name).join(', ')}`),
		`\nExports (${signature.exports.length}):`,
		...signature.exports.map(exp => {
			if (exp.type === 'default') return '  - default export';
			if (exp.type === 'all') return `  - export * from ${exp.source}`;
			return `  - ${exp.declarations.join(', ')}`;
		}),
		`\nDeclarations (${signature.declarations.length}):`,
		...signature.declarations.map(decl => `  - ${decl.type}: ${decl.name.join(', ')}`),
		`\nRunes:`,
		...Object.entries(signature.runesUsage)
			.filter(([_, used]) => used)
			.map(([rune]) => `  - ${rune}`),
		`\nMetrics:`,
		`  - Lines: ${signature.metrics.lines}`,
		`  - Complexity: ${signature.metrics.complexity}`,
		`  - Dependencies: ${signature.metrics.dependencyCount}`,
		`  - Exports: ${signature.metrics.exportCount}`
	].join('\n');

	// Generate embedding using Ollama
	const response = await ollama.embeddings({
		model: MODEL,
		prompt: text
	});

	return response.embedding;
}

/**
 * Index AST signature in Qdrant
 */
async function indexSignature(signature, embedding) {
	const point = {
		id: signature.hash,
		vector: embedding,
		payload: {
			file_path: signature.filePath,
			imports: signature.imports,
			exports: signature.exports,
			declarations: signature.declarations.map(d => ({
				type: d.type,
				names: d.name
			})),
			runes: signature.runesUsage,
			metrics: signature.metrics,
			indexed_at: new Date().toISOString()
		}
	};

	await client.upsert(COLLECTION_NAME, {
		wait: true,
		points: [point]
	});
}

/**
 * Ensure Qdrant collection exists
 */
async function ensureCollection() {
	try {
		await client.getCollection(COLLECTION_NAME);
		console.log(`✅ Collection '${COLLECTION_NAME}' already exists`);
	} catch (err) {
		console.log(`📦 Creating collection '${COLLECTION_NAME}'...`);
		await client.createCollection(COLLECTION_NAME, {
			vectors: {
				size: EMBEDDING_DIM,
				distance: 'Cosine'
			}
		});
		console.log('✅ Collection created');
	}
}

/**
 * Main indexing function
 */
async function main() {
	console.log('🚀 Phase 89: AST Signature Indexer\n');

	await ensureCollection();

	// Find all TypeScript/Svelte files in src/
	const files = await glob('src/**/*.{ts,tsx,js,mjs,svelte}', {
		ignore: ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**', '**/*.d.ts']
	});

	console.log(`📁 Found ${files.length} files to index\n`);

	let indexed = 0;
	let skipped = 0;

	for (const file of files) {
		process.stdout.write(`   Processing: ${file}...`);

		const signature = await extractASTSignature(file);

		if (!signature) {
			console.log(' ⏭️  skipped');
			skipped++;
			continue;
		}

		const embedding = await generateEmbedding(signature);
		await indexSignature(signature, embedding);

		console.log(` ✅ indexed (${signature.declarations.length} decls, ${signature.metrics.complexity} complexity)`);
		indexed++;
	}

	console.log(`\n📊 Summary:`);
	console.log(`   Indexed: ${indexed} files`);
	console.log(`   Skipped: ${skipped} files`);
	console.log(`   Collection: ${COLLECTION_NAME}`);
	console.log(`   Qdrant: ${QDRANT_URL}`);
}

main().catch(err => {
	console.error('❌ Error:', err);
	process.exit(1);
});
