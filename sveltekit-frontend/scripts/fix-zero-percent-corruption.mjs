#!/usr/bin/env node

/**
 * Fixes text corruption: 0% → {} (empty object)
 * Pattern: ...?? 0% or ...(f ?? 0%)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 0% → {} CORRUPTION FIXER\n');
console.log('='.repeat(80) + '\n');

const gitFiles = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean)
	.map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked files\n`);

let filesProcessed = 0;
let filesChanged = 0;
let totalFixes = 0;
const changedFiles = [];

for (const filePath of gitFiles) {
	try {
		const fullPath = resolve(filePath);
		const content = readFileSync(fullPath, 'utf-8');

		// Only process files that contain 0%
		if (!content.includes('0%')) {
			filesProcessed++;
			continue;
		}

		let fixed = content;
		let fileFixCount = 0;

		// Pattern: 0% used where {} should be
		// Common contexts:
		// 1. ?? 0% (nullish coalescing with empty object)
		// 2. || 0% (logical or with empty object)
		// 3. : 0% (type annotation or object property)
		// 4. (f ?? 0%) (in expressions)

		// Replace 0% with {} - don't use word boundaries as % is not a word char
		const pattern = /0%/g;
		const matches = [...content.matchAll(pattern)];
		fileFixCount = matches.length;

		if (fileFixCount > 0) {
			fixed = fixed.replace(pattern, '{}');
			writeFileSync(fullPath, fixed, 'utf-8');
			filesChanged++;
			totalFixes += fileFixCount;
			changedFiles.push({ file: filePath, fixes: fileFixCount });
			console.log(`✓ ${filePath}`);
			console.log(`  Fixed ${fileFixCount} corrupted 0% → {}`);
		}

		filesProcessed++;
	} catch (err) {
		console.error(`✗ Error processing ${filePath}:`, err.message);
	}
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 RESULTS:\n`);
console.log(`Files processed: ${filesProcessed}`);
console.log(`Files changed: ${filesChanged}`);
console.log(`Total 0% → {} fixes: ${totalFixes}`);

console.log('\n✨ 0% corruption fix complete!');
console.log(`Expected error reduction: ~${totalFixes * 2} errors (cascade effects)\n`);

// Save report
const reportPath = resolve('zero-percent-fix-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalFixes,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: zero-percent-fix-report.json\n`);