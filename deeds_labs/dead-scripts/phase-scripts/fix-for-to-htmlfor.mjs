#!/usr/bin/env node

/**
 * Fixes 'for' attribute to 'htmlFor' in Label components
 * Pattern: <Label for="id"> → <Label htmlFor="id">
 * Note: Svelte allows 'for' but TypeScript types may expect 'htmlFor'
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 FOR → HTMLFOR ATTRIBUTE FIXER\n');
console.log('='.repeat(80) + '\n');

const gitFiles = execSync('git ls-files "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean)
	.map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked Svelte files\n`);

let filesProcessed = 0;
let filesChanged = 0;
let totalFixes = 0;
const changedFiles = [];

for (const filePath of gitFiles) {
	try {
		const fullPath = resolve(filePath);
		const content = readFileSync(fullPath, 'utf-8');
		let fixed = content;
		let fileFixCount = 0;

		// Pattern: <Label for="..." or <label for="..."
		// Fix: Change to htmlFor="..."

		// Match Label component (capital L) and label element (lowercase l)
		const pattern = /(<(?:Label|label)\s+[^>]*)(\bfor=)/g;

		let match;
		while ((match = pattern.exec(content)) !== null) {
			fileFixCount++;
		}

		// Apply fix
		fixed = fixed.replace(pattern, '$1htmlFor=');

		if (fileFixCount > 0) {
			writeFileSync(fullPath, fixed, 'utf-8');
			filesChanged++;
			totalFixes += fileFixCount;
			changedFiles.push({ file: filePath, fixes: fileFixCount });
			console.log(`✓ ${filePath}`);
			console.log(`  Fixed ${fileFixCount} 'for' → 'htmlFor' replacement${fileFixCount > 1 ? 's' : ''}`);
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
console.log(`Total 'for' → 'htmlFor' fixes: ${totalFixes}`);

console.log('\n✨ for→htmlFor fix complete!');
console.log(`Expected error reduction: ~${totalFixes} errors\n`);

// Save report
const reportPath = resolve('for-to-htmlfor-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalFixes,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: for-to-htmlfor-report.json\n`);
