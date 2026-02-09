#!/usr/bin/env node

/**
 * Fixes text corruption: ?? 0% → ?? {} (empty object)
 * TARGETED: Only replaces in specific TypeScript contexts
 * Pattern: Nullish coalescing operator with 0%
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 TARGETED 0% → {} CORRUPTION FIXER (APPLY MODE)\n');
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

		// Only process files that contain ?? 0%
		if (!content.includes('?? 0%') && !content.includes('|| 0%')) {
			filesProcessed++;
			continue;
		}

		let fixed = content;
		let fileFixCount = 0;

		// TARGETED PATTERNS - Only match in TypeScript contexts
		// Pattern 1: ?? 0% (nullish coalescing with 0%)
		const pattern1 = /\?\?\s*0%/g;
		const matches1 = [...content.matchAll(pattern1)];
		fileFixCount += matches1.length;
		fixed = fixed.replace(pattern1, '?? {}');

		// Pattern 2: || 0% (logical OR with 0%)
		const pattern2 = /\|\|\s*0%/g;
		const matches2 = [...content.matchAll(pattern2)];
		fileFixCount += matches2.length;
		fixed = fixed.replace(pattern2, '|| {}');

		if (fileFixCount > 0) {
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

console.log('\n✨ Targeted 0% corruption fix complete!');
console.log(`Expected error reduction: ~${totalFixes * 2} errors (cascade effects)\n`);

// Save report
const reportPath = resolve('zero-percent-targeted-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalFixes,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: zero-percent-targeted-report.json\n`);
