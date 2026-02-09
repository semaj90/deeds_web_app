#!/usr/bin/env node

/**
 * Fixes trailing commas in JSX/Svelte attributes
 * Pattern: <Input required, class="..."/> → <Input required class="..."/>
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 ATTRIBUTE TRAILING COMMA FIXER\n');
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

		// Pattern: attribute value followed by comma before next attribute or />
		// Match: attribute="value", nextAttr OR attribute, nextAttr OR value}, nextAttr
		// Fix: Remove the comma

		// Pattern 1: quoted="value", → quoted="value"
		const pattern1 = /(\w+="[^"]*"),(\s+)/g;
		const matches1 = [...content.matchAll(pattern1)];
		fileFixCount += matches1.length;
		fixed = fixed.replace(pattern1, '$1$2');

		// Pattern 2: attribute, nextAttr → attribute nextAttr (boolean attributes)
		const pattern2 = /(\s+\w+),(\s+\w+=)/g;
		const matches2 = [...content.matchAll(pattern2)];
		fileFixCount += matches2.length;
		fixed = fixed.replace(pattern2, '$1$2');

		// Pattern 3: value}, nextAttr → value} nextAttr (reactive attributes)
		const pattern3 = /(\}),(\s+\w+=)/g;
		const matches3 = [...content.matchAll(pattern3)];
		fileFixCount += matches3.length;
		fixed = fixed.replace(pattern3, '$1$2');

		if (fileFixCount > 0) {
			writeFileSync(fullPath, fixed, 'utf-8');
			filesChanged++;
			totalFixes += fileFixCount;
			changedFiles.push({ file: filePath, fixes: fileFixCount });
			console.log(`✓ ${filePath}`);
			console.log(`  Removed ${fileFixCount} trailing comma${fileFixCount > 1 ? 's' : ''} from attributes`);
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
console.log(`Total trailing commas removed: ${totalFixes}`);

console.log('\n✨ Attribute trailing comma fix complete!');
console.log(`Expected error reduction: ~${totalFixes} errors\n`);

// Save report
const reportPath = resolve('attribute-comma-fix-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalFixes,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: attribute-comma-fix-report.json\n`);