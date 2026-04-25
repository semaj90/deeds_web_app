#!/usr/bin/env node
/**
 * Phase 102: Apply Enhanced Type Definitions
 * Systematically imports and applies enhanced-svelte5-types.d.ts to codebase
 *
 * Strategy:
 * 1. Identify files using caching, Drizzle, bits-ui, or SSR-detection
 * 2. Add type imports where beneficial
 * 3. Replace `any` types with proper type references
 * 4. Track changes and report statistics
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

// Statistics
const stats = {
	filesScanned: 0,
	filesModified: 0,
	typesAdded: 0,
	anyTypesReplaced: 0,
	errors: 0
};

// Pattern detection
const patterns = {
	needsCachingTypes: /CacheEntry|CacheLayer|CacheStrategy|multiLayerCache|lokiCache|indexedDBCache|cache\.(get|set)/,
	needsDrizzleTypes: /from 'drizzle-orm'|db\.(select|insert|update|delete)|eq\(|and\(|or\(/,
	needsBitsUITypes: /from 'bits-ui'|Dialog\.|Dropdown\.|Tooltip\.|Select\.|Tabs\./,
	needsSSRTypes: /browser &&|typeof window|navigator\.|document\./,
	hasAnyType: /:\s*any\b/,
	hasImportEnhancedTypes: /from '\$lib\/types\/enhanced-svelte5-types'/
};

// Type import templates
const typeImports = {
	caching: "import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';",
	drizzle: "import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';",
	bitsUI: "import type { BitsUI } from '$lib/types/enhanced-svelte5-types';",
	ssr: "import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';",
	loki: "import type { LokiTypes } from '$lib/types/enhanced-svelte5-types';",
	indexedDB: "import type { IndexedDBTypes } from '$lib/types/enhanced-svelte5-types';",
	redis: "import type { RedisTypes } from '$lib/types/enhanced-svelte5-types';"
};

/**
 * Analyze file to determine which enhanced types it needs
 */
async function analyzeFile(filePath) {
	const content = await fs.readFile(filePath, 'utf-8');

	// Skip if already has enhanced types import
	if (patterns.hasImportEnhancedTypes.test(content)) {
		return null;
	}

	const needs = {
		caching: patterns.needsCachingTypes.test(content),
		drizzle: patterns.needsDrizzleTypes.test(content),
		bitsUI: patterns.needsBitsUITypes.test(content),
		ssr: patterns.needsSSRTypes.test(content),
		hasAny: patterns.hasAnyType.test(content)
	};

	// Only process if file needs at least one type
	if (!needs.caching && !needs.drizzle && !needs.bitsUI && !needs.ssr && !needs.hasAny) {
		return null;
	}

	return { filePath, content, needs };
}

/**
 * Add type imports to file content
 */
function addTypeImports(content, needs) {
	const lines = content.split('\n');
	const importsToAdd = [];

	// Determine which imports are needed
	if (needs.caching) {
		importsToAdd.push(typeImports.caching);
	}
	if (needs.drizzle) {
		importsToAdd.push(typeImports.drizzle);
	}
	if (needs.bitsUI) {
		importsToAdd.push(typeImports.bitsUI);
	}
	if (needs.ssr) {
		importsToAdd.push(typeImports.ssr);
	}

	// Find insertion point (after last import)
	let lastImportIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim().startsWith('import ')) {
			lastImportIndex = i;
		}
	}

	// Insert imports
	if (lastImportIndex >= 0) {
		lines.splice(lastImportIndex + 1, 0, ...importsToAdd);
		stats.typesAdded += importsToAdd.length;
	}

	return lines.join('\n');
}

/**
 * Replace common `any` types with proper references
 */
function replaceAnyTypes(content, needs) {
	let modified = content;
	let replacements = 0;

	// Cache-related any types
	if (needs.caching) {
		// cacheService: any → proper type
		const cacheServicePattern = /cacheService:\s*any/g;
		if (cacheServicePattern.test(modified)) {
			modified = modified.replace(
				cacheServicePattern,
				'cacheService: CachingTypes.UnifiedCache<unknown> | null'
			);
			replacements++;
		}

		// Redis client: any
		const redisPattern = /redisClient:\s*any/g;
		if (redisPattern.test(modified)) {
			modified = modified.replace(
				redisPattern,
				'redisClient: RedisTypes.RedisClient | null'
			);
			replacements++;
		}
	}

	// Drizzle-related any types
	if (needs.drizzle) {
		const dbAnyPattern = /db:\s*any/g;
		if (dbAnyPattern.test(modified)) {
			modified = modified.replace(
				dbAnyPattern,
				'db: DrizzleTypes.DatabaseConfig'
			);
			replacements++;
		}
	}

	stats.anyTypesReplaced += replacements;
	return modified;
}

/**
 * Process a single file
 */
async function processFile(analysis) {
	try {
		let { content, needs, filePath } = analysis;

		// Add type imports
		content = addTypeImports(content, needs);

		// Replace any types
		content = replaceAnyTypes(content, needs);

		// Write back to file
		await fs.writeFile(filePath, content, 'utf-8');

		stats.filesModified++;
		console.log(`✅ Updated: ${path.relative(srcDir, filePath)}`);
	} catch (error) {
		stats.errors++;
		console.error(`❌ Error processing ${analysis.filePath}:`, error.message);
	}
}

/**
 * Recursively find all TypeScript and Svelte files
 */
async function* findFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			// Skip common directories
			if (['node_modules', '.svelte-kit', 'build', 'dist'].includes(entry.name)) {
				continue;
			}
			yield* findFiles(fullPath);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name);
			if (['.ts', '.svelte'].includes(ext) && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
				yield fullPath;
			}
		}
	}
}

/**
 * Main execution
 */
async function main() {
	console.log('🚀 Phase 102: Apply Enhanced Type Definitions\n');
	console.log('Scanning TypeScript and Svelte files for type enhancement opportunities...\n');

	const startTime = Date.now();
	const analyses = [];

	// Scan all files
	for await (const filePath of findFiles(srcDir)) {
		stats.filesScanned++;
		const analysis = await analyzeFile(filePath);
		if (analysis) {
			analyses.push(analysis);
		}
	}

	console.log(`\nFound ${analyses.length} files that could benefit from enhanced types\n`);

	// Process files
	for (const analysis of analyses) {
		await processFile(analysis);
	}

	// Report statistics
	const duration = ((Date.now() - startTime) / 1000).toFixed(2);

	console.log('\n' + '='.repeat(60));
	console.log('📊 Phase 102 Statistics');
	console.log('='.repeat(60));
	console.log(`Files scanned:       ${stats.filesScanned}`);
	console.log(`Files modified:      ${stats.filesModified}`);
	console.log(`Type imports added:  ${stats.typesAdded}`);
	console.log(`'any' types replaced: ${stats.anyTypesReplaced}`);
	console.log(`Errors:              ${stats.errors}`);
	console.log(`Duration:            ${duration}s`);
	console.log('='.repeat(60));

	if (stats.filesModified > 0) {
		console.log('\n✅ Enhanced type definitions successfully applied!');
		console.log('\nNext steps:');
		console.log('1. Run: npx svelte-check --threshold error');
		console.log('2. Validate error count reduction');
		console.log('3. Commit changes if successful');
	} else {
		console.log('\n⚠️  No files were modified. Enhanced types may already be applied.');
	}
}

main().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
