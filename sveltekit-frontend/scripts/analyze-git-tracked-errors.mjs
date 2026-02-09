#!/usr/bin/env node

/**
 * Analyze svelte-check errors for git-tracked files only
 * Outputs top files by error count
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Get all git-tracked TypeScript and Svelte files
const gitFiles = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean)
	.map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked TS/Svelte files`);

// Read svelte-check output
const errorOutput = readFileSync(resolve('svelte-check-output.txt'), 'utf-8');

// Count errors per file
const errorCounts = new Map();

for (const file of gitFiles) {
	// Match lines that reference this file
	const pattern = new RegExp(`\\b${file.replace(/\\/g, '\\\\')}\\b`, 'g');
	const matches = errorOutput.match(pattern);
	const count = matches ? matches.length : 0;

	if (count > 0) {
		errorCounts.set(file, count);
	}
}

// Sort by error count descending
const sorted = Array.from(errorCounts.entries())
	.sort((a, b) => b[1] - a[1]);

// Output top 50
console.log('\n📊 Top 50 Git-Tracked Files by Error Count:\n');
console.log('Rank | Errors | File');
console.log('-----|--------|-----');

sorted.slice(0, 50).forEach(([file, count], i) => {
	console.log(`${(i + 1).toString().padStart(4)} | ${count.toString().padStart(6)} | ${file}`);
});

// Summary statistics
const totalErrors = Array.from(errorCounts.values()).reduce((a, b) => a + b, 0);
const avgErrors = (totalErrors / errorCounts.size).toFixed(1);

console.log('\n📈 Summary:');
console.log(`  Total git-tracked files with errors: ${errorCounts.size}`);
console.log(`  Total errors in git-tracked files: ${totalErrors}`);
console.log(`  Average errors per file: ${avgErrors}`);
console.log(`  Files with 10+ errors: ${sorted.filter(([_, c]) => c >= 10).length}`);
console.log(`  Files with 20+ errors: ${sorted.filter(([_, c]) => c >= 20).length}`);