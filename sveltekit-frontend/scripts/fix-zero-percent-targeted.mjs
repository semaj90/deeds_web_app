#!/usr/bin/env node

/**
 * Fixes text corruption: ?? 0% → ?? {} (empty object)
 * TARGETED: Only replaces in specific TypeScript contexts
 * Pattern: Nullish coalescing operator with 0%
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 TARGETED 0% → {} CORRUPTION FIXER\n');
console.log('='.repeat(80) + '\n');
console.log('⚠️  DRY RUN MODE - No files will be modified yet\n');

const gitFiles = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean)
	.map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked files\n`);

let filesProcessed = 0;
let filesWithMatches = 0;
let totalMatches = 0;
const matchedFiles = [];

for (const filePath of gitFiles) {
	try {
		const fullPath = resolve(filePath);
		const content = readFileSync(fullPath, 'utf-8');

		// Only process files that contain ?? 0%
		if (!content.includes('?? 0%')) {
			filesProcessed++;
			continue;
		}

		// TARGETED PATTERNS - Only match in TypeScript contexts
		const patterns = [
			// Pattern 1: ?? 0% (nullish coalescing with 0%)
			{ regex: /\?\?\s*0%/g, name: '?? 0%' },
			// Pattern 2: || 0% (logical OR with 0%)
			{ regex: /\|\|\s*0%/g, name: '|| 0%' },
		];

		let fileMatchCount = 0;
		const matches = [];

		for (const { regex, name } of patterns) {
			const patternMatches = [...content.matchAll(regex)];
			if (patternMatches.length > 0) {
				fileMatchCount += patternMatches.length;
				matches.push({ pattern: name, count: patternMatches.length });
			}
		}

		if (fileMatchCount > 0) {
			filesWithMatches++;
			totalMatches += fileMatchCount;
			matchedFiles.push({ file: filePath, matches, totalMatches: fileMatchCount });

			console.log(`📄 ${filePath}`);
			matches.forEach(m => console.log(`   ${m.pattern}: ${m.count} match(es)`));
		}

		filesProcessed++;
	} catch (err) {
		console.error(`✗ Error processing ${filePath}:`, err.message);
	}
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 DRY RUN RESULTS:\n`);
console.log(`Files scanned: ${filesProcessed}`);
console.log(`Files with matches: ${filesWithMatches}`);
console.log(`Total matches found: ${totalMatches}`);

if (filesWithMatches > 0) {
	console.log(`\n📝 Files that would be modified:\n`);
	matchedFiles.forEach(({ file, totalMatches }) => {
		console.log(`  • ${file} (${totalMatches} fixes)`);
	});
}

console.log('\n✅ DRY RUN COMPLETE!');
console.log(`\nTo apply these fixes, edit this script and set DRY_RUN = false\n`);

// Save report
const reportPath = resolve('zero-percent-targeted-dry-run.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	dryRun: true,
	filesProcessed,
	filesWithMatches,
	totalMatches,
	matchedFiles
}, null, 2));

console.log(`📄 Report saved: zero-percent-targeted-dry-run.json\n`);