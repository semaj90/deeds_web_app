#!/usr/bin/env node

/**
 * Reverts htmlFor back to for in native <label> elements
 * Keeps htmlFor in <Label> components (capital L)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 REVERT HTMLFOR IN NATIVE <label> ELEMENTS\n');
console.log('='.repeat(80) + '\n');

const gitFiles = execSync('git ls-files "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean)
	.map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked Svelte files\n`);

let filesProcessed = 0;
let filesChanged = 0;
let totalReverts = 0;
const changedFiles = [];

for (const filePath of gitFiles) {
	try {
		const fullPath = resolve(filePath);
		const content = readFileSync(fullPath, 'utf-8');
		let fixed = content;
		let fileRevertCount = 0;

		// Pattern: <label ...htmlFor= → <label ...for=
		// Only match lowercase label (HTML element), not Label (component)
		const pattern = /(<label\s+[^>]*)(htmlFor=)/g;

		let match;
		while ((match = pattern.exec(content)) !== null) {
			fileRevertCount++;
		}

		// Apply revert
		fixed = fixed.replace(pattern, '$1for=');

		if (fileRevertCount > 0) {
			writeFileSync(fullPath, fixed, 'utf-8');
			filesChanged++;
			totalReverts += fileRevertCount;
			changedFiles.push({ file: filePath, reverts: fileRevertCount });
			console.log(`✓ ${filePath}`);
			console.log(`  Reverted ${fileRevertCount} htmlFor → for in <label> element${fileRevertCount > 1 ? 's' : ''}`);
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
console.log(`Total reverts (htmlFor → for): ${totalReverts}`);

console.log('\n✨ Native <label> revert complete!');
console.log(`Note: <Label> components (capital L) still use htmlFor (correct)\n`);

// Save report
const reportPath = resolve('label-revert-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalReverts,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: label-revert-report.json\n`);