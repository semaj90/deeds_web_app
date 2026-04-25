#!/usr/bin/env node
/**
 * Phase 80: Complete Mojibake Pattern Codemod
 *
 * Fixes all corruption patterns:
 * 1. Optional chain corruption: `this?.(property)` → `this.property`
 * 2. Numeric literal corruption: `1?.(0)` → `1.0`
 * 3. Function signature corruption: `param: Type: param2` → `param: Type, param2`
 * 4. Method call corruption: `Math?.(method)` → `Math.method`
 * 5. Duplicate function definitions
 *
 * Usage:
 *   node scripts/phase80-complete-codemod.mjs [--dry-run] [--file <path>] [--dir <path>]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const helpRequested = args.includes('--help');

// Get target file/directory
const fileIndex = args.indexOf('--file');
const dirIndex = args.indexOf('--dir');
const targetFile = fileIndex >= 0 ? args[fileIndex + 1] : null;
const targetDir = dirIndex >= 0 ? args[dirIndex + 1] : 'src/';

if (helpRequested) {
	console.log(`
Phase 80: Complete Mojibake Pattern Codemod

Usage:
  node scripts/phase80-complete-codemod.mjs [options]

Options:
  --dry-run         Preview changes without writing files
  --file <path>     Process single file
  --dir <path>      Process directory (default: src/)
  --help            Show this help message
`);
	process.exit(0);
}

console.log('🔧 Phase 80: Complete Mojibake Pattern Codemod');
console.log('='.repeat(50) + '\n');

if (isDryRun) {
	console.log('🔍 DRY RUN MODE - No files will be modified\n');
}

// Define all corruption patterns and their fixes
const PATTERNS = [
	// Optional chain to property access corruption: this?.(property) → this.property
	{
		name: 'optional-chain-corruption',
		regex: /(\w+)\?\.\((\w+)\)/g,
		replacement: '$1.$2',
		description: 'Fix optional chain property access corruption',
	},
	// Numeric literal corruption: 1?.(0) → 1.0
	{
		name: 'numeric-literal-corruption',
		regex: /(\d+)\?\.\((\d+)\)/g,
		replacement: '$1.$2',
		description: 'Fix numeric literal corruption',
	},
	// Function parameter corruption: (param: Type: anotherParam: Type2) → (param: Type, anotherParam: Type2)
	{
		name: 'function-param-corruption',
		regex: /(\w+:\s*\w+(?:\[\])?)\s*:\s*(\w+:\s*\w+)/g,
		replacement: '$1, $2',
		description: 'Fix function parameter corruption',
	},
	// Return type corruption: ): WebGLProgram: null { → ): WebGLProgram | null {
	{
		name: 'return-type-union-corruption',
		regex: /\):\s*(\w+)\s*:\s*(null|undefined)\s*\{/g,
		replacement: '): $1 | $2 {',
		description: 'Fix return type union corruption',
	},
	// Tuple type corruption: [number: number, number] → [number, number, number]
	{
		name: 'tuple-type-corruption',
		regex: /\[(\w+):\s*(\w+),/g,
		replacement: '[$1, $2,',
		description: 'Fix tuple type corruption',
	},
	// Object property corruption: { ...room: documents: await → { ...room, documents: await
	{
		name: 'object-spread-corruption',
		regex: /\.\.\.([\w.]+)\s*:\s*(\w+):/g,
		replacement: '...$1, $2:',
		description: 'Fix object spread corruption',
	},
	// Console/method corruption: console?.(error) → console.error
	{
		name: 'console-method-corruption',
		regex: /(console|Math|JSON|Object|Array|String|Number|Date|Promise|Error)\?\.\((\w+)\)/g,
		replacement: '$1.$2',
		description: 'Fix global method corruption',
	},
	// Property access in expressions: viewPosition?.(xyz) → viewPosition.xyz
	{
		name: 'expression-property-corruption',
		regex: /(\w+)\?\.\((\w+)\)/g,
		replacement: '$1.$2',
		description: 'Fix expression property access corruption',
	},
	// Duplicate async function definition pattern
	{
		name: 'duplicate-async-def',
		regex: /async getDocument\(documentId: string\): Promise<CachedDocument \| null> {\n\s*async getDocument\(documentId: string\): Promise<CachedDocument: null> {/g,
		replacement: 'async getDocument(documentId: string): Promise<CachedDocument | null> {',
		description: 'Fix duplicate async function definition',
	},
	// Function declaration corruption with extra type annotations
	{
		name: 'function-extra-type-params',
		regex: /(\w+:\s*\w+(?:\[\])?),\s*(\w+):\s*(\w+)\)/g,
		replacement: '$1, $2): $3',
		description: 'Fix function declaration with extra type params',
	},
];

// Additional multi-pass patterns for complex corruptions
const COMPLEX_PATTERNS = [
	// Fix `await: await` pattern
	{
		regex: /await:\s*await/g,
		replacement: 'await',
		description: 'Fix duplicate await pattern',
	},
	// Fix comma-colon swaps in object literals
	{
		regex: /(\w+)\s*:\s*(\{[^}]+\})\s*:\s*/g,
		replacement: '$1: $2, ',
		description: 'Fix nested object colon-comma swap',
	},
	// Fix parameter list with colons
	{
		regex: /\((\w+):\s*(\w+)\s*:\s*(\w+)\s*:\s*(\w+)\)/g,
		replacement: '($1: $2, $3: $4)',
		description: 'Fix 2-param function signature',
	},
];

let totalFiles = 0;
let totalFixes = 0;
const fixesByPattern = {};

// Initialize fix counters
for (const pattern of [...PATTERNS, ...COMPLEX_PATTERNS]) {
	fixesByPattern[pattern.name || pattern.description] = 0;
}

function fixFile(filePath) {
	try {
		let content = fs.readFileSync(filePath, 'utf-8');
		let originalContent = content;
		let fileFixes = 0;

		// Apply all patterns
		for (const pattern of PATTERNS) {
			const matches = content.match(pattern.regex);
			if (matches) {
				const count = matches.length;
				content = content.replace(pattern.regex, pattern.replacement);
				fileFixes += count;
				fixesByPattern[pattern.name] = (fixesByPattern[pattern.name] || 0) + count;
			}
		}

		// Apply complex patterns
		for (const pattern of COMPLEX_PATTERNS) {
			const matches = content.match(pattern.regex);
			if (matches) {
				const count = matches.length;
				content = content.replace(pattern.regex, pattern.replacement);
				fileFixes += count;
				fixesByPattern[pattern.description] = (fixesByPattern[pattern.description] || 0) + count;
			}
		}

		// Only save if there were changes
		if (content !== originalContent) {
			if (!isDryRun) {
				fs.writeFileSync(filePath, content, 'utf-8');
			}
			console.log(`  ✅ ${filePath}: ${fileFixes} fixes`);
			totalFiles++;
			totalFixes += fileFixes;
		}

		return fileFixes;
	} catch (error) {
		console.error(`  ❌ Error processing ${filePath}: ${error.message}`);
		return 0;
	}
}

async function processFiles() {
	let files = [];

	if (targetFile) {
		files = [targetFile];
		console.log(`📄 Processing file: ${targetFile}\n`);
	} else {
		console.log(`📁 Processing directory: ${targetDir}\n`);
		files = await glob(`${targetDir}/**/*.{ts,svelte}`, {
			ignore: ['**/node_modules/**', '**/.svelte-kit/**'],
		});
	}

	console.log(`Found ${files.length} files to process\n`);

	for (const file of files) {
		fixFile(file);
	}

	// Summary
	console.log('\n' + '='.repeat(50));
	console.log('📊 Transformation Summary');
	console.log('='.repeat(50) + '\n');
	console.log(`Files processed: ${files.length}`);
	console.log(`Files modified: ${totalFiles}`);
	console.log(`Total fixes: ${totalFixes}\n`);

	console.log('Fixes by pattern:');
	for (const [name, count] of Object.entries(fixesByPattern)) {
		if (count > 0) {
			console.log(`  - ${name}: ${count}`);
		}
	}
	console.log();

	if (isDryRun) {
		console.log('🔍 DRY RUN COMPLETE - No files were modified');
		console.log('   Remove --dry-run flag to apply changes\n');
	} else {
		console.log('✅ Codemod complete!\n');
	}
}

processFiles().catch(console.error);
