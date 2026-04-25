#!/usr/bin/env node
/**
 * Phase 80 Chunk 2: Targeted Error Fixes
 *
 * Focus on high-volume, automatable error patterns:
 * 1. Shorthand property errors (3,167 errors)
 * 2. Type-only import usage (2,064 errors)
 * 3. Missing import fixes (selective)
 *
 * Usage:
 *   node scripts/phase80-chunk2-fixer.mjs [--dry-run] [--pattern <name>]
 */

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const patternIndex = args.indexOf('--pattern');
const targetPattern = patternIndex >= 0 ? args[patternIndex + 1] : 'all';

console.log('🔧 Phase 80 Chunk 2: Targeted Error Fixes\n');
if (isDryRun) console.log('🔍 DRY RUN MODE\n');

let fixesApplied = 0;
const filesFix = new Set();

/**
 * Pattern 1: Fix shorthand property errors
 * Error: "No value exists in scope for the shorthand property 'X'"
 * Fix: Change `{ prop }` to `{ prop: prop }`
 */
async function fixShorthandProperties(filePath, content) {
	let modified = content;
	let changes = 0;

	// Pattern: Find shorthand properties that need expansion
	// This is a simplified approach - in production, use AST
	const patterns = [
		// Common shorthand patterns that fail
		{ find: /{\s*lastChecked\s*}/g, replace: '{ lastChecked: lastChecked }' },
		{ find: /{\s*timestamp\s*}/g, replace: '{ timestamp: timestamp }' },
		{ find: /{\s*scale\s*}/g, replace: '{ scale: scale }' },
		{ find: /{\s*value\s*}/g, replace: '{ value: value }' },
	];

	patterns.forEach(({ find, replace }) => {
		const newContent = modified.replace(find, replace);
		if (newContent !== modified) {
			changes++;
			modified = newContent;
		}
	});

	return { modified, changes };
}

/**
 * Pattern 2: Fix type-only imports used as values
 * Error: "'X' cannot be used as a value because it was imported using 'import type'"
 * Fix: Remove `type` keyword from import
 */
async function fixTypeOnlyImports(filePath, content) {
	let modified = content;
	let changes = 0;

	// Find imports with `type` keyword that are used as values
	const typeImportPattern = /import\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

	modified = modified.replace(typeImportPattern, (match, imports, source) => {
		// Common patterns that should NOT be type-only
		const valueImports = ['browser', 'env', 'page', 'navigating'];
		const importList = imports.split(',').map(i => i.trim());

		const hasValueImport = importList.some(imp =>
			valueImports.some(v => imp.includes(v))
		);

		if (hasValueImport) {
			changes++;
			return `import { ${imports} } from '${source}'`;
		}

		return match;
	});

	return { modified, changes };
}

/**
 * Pattern 3: Add missing closing braces (structural fixes)
 */
async function fixStructuralIssues(filePath, content) {
	// This is complex - skip for now, needs manual review
	return { modified: content, changes: 0 };
}

/**
 * Process a single file
 */
async function processFile(filePath) {
	try {
		const content = await readFile(filePath, 'utf-8');
		let modified = content;
		let totalChanges = 0;

		if (targetPattern === 'all' || targetPattern === 'shorthand') {
			const result = await fixShorthandProperties(filePath, modified);
			modified = result.modified;
			totalChanges += result.changes;
		}

		if (targetPattern === 'all' || targetPattern === 'type-imports') {
			const result = await fixTypeOnlyImports(filePath, modified);
			modified = result.modified;
			totalChanges += result.changes;
		}

		if (totalChanges > 0) {
			console.log(`✅ ${filePath}: ${totalChanges} fixes`);

			if (!isDryRun) {
				await writeFile(filePath, modified, 'utf-8');
			}

			fixesApplied += totalChanges;
			filesFix.add(filePath);
		}

		return totalChanges;
	} catch (error) {
		console.error(`❌ Error processing ${filePath}:`, error.message);
		return 0;
	}
}

/**
 * Main execution
 */
async function main() {
	console.log('📁 Finding TypeScript files...\n');

	const files = await glob('src/**/*.ts', {
		ignore: ['node_modules/**', '**/*.d.ts', '**/.*'],
	});

	console.log(`Found ${files.length} files\n`);
	console.log('🔄 Processing files...\n');

	for (const file of files) {
		await processFile(file);
	}

	console.log('\n======================================');
	console.log('📊 Summary');
	console.log('======================================\n');
	console.log(`Files modified: ${filesFix.size}`);
	console.log(`Total fixes: ${fixesApplied}\n`);

	if (isDryRun) {
		console.log('🔍 DRY RUN COMPLETE - No files were modified');
	} else {
		console.log('✅ Fixes applied!');
		console.log('\n🔬 Run `npx svelte-check` to verify\n');
	}
}

main().catch(console.error);
