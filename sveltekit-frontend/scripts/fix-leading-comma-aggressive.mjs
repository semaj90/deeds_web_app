#!/usr/bin/env node

/**
 * Aggressive Leading Comma Fixer (Round 2)
 * Targets remaining cases missed by first pass
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 AGGRESSIVE LEADING COMMA FIXER (Round 2)\n');
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
		const lines = content.split('\n');
		let changed = false;
		let fileFixCount = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// Pattern 1: Line starts with comma (any context)
			// Match: <whitespace>,<space><content>
			if (trimmed.startsWith(',')) {
				const indent = line.match(/^\s*/)[0];
				const restOfLine = trimmed.slice(1).trim();

				// Only fix if rest of line looks like object property or statement
				if (restOfLine && !restOfLine.startsWith('//')) {
					lines[i] = indent + restOfLine;
					changed = true;
					fileFixCount++;
				}
			}
		}

		if (changed) {
			const fixed = lines.join('\n');
			writeFileSync(fullPath, fixed, 'utf-8');
			filesChanged++;
			totalFixes += fileFixCount;
			changedFiles.push({ file: filePath, fixes: fileFixCount });
			console.log(`✓ ${filePath}`);
			console.log(`  Removed ${fileFixCount} leading comma${fileFixCount > 1 ? 's' : ''}`);
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
console.log(`Total leading commas removed: ${totalFixes}`);

console.log('\n✨ Aggressive leading comma fix complete!');
console.log(`Expected error reduction: ~${totalFixes * 3} errors (cascade effects)\n`);

// Save report
const reportPath = resolve('leading-comma-fix-round2-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalFixes,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: leading-comma-fix-round2-report.json\n`);