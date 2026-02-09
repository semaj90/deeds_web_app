#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const gitFiles = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean)
	.map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked TS/Svelte files`);

const errorOutput = readFileSync(resolve('svelte-check-output.txt'), 'utf-8');
const errorCounts = new Map();

const lines = errorOutput.split('\n');
for (const line of lines) {
	// Strip ANSI color codes first (\x1b is ESC character)
	const cleanLine = line.replace(/\x1b\[\d+m/g, '');

	// Match: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\...:123:45
	const match = cleanLine.match(/^c:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\(src.+?):(\d+):(\d+)/);
	if (match) {
		const relativePath = match[1].replace(/\\/g, '/');
		if (gitFiles.includes(relativePath)) {
			errorCounts.set(relativePath, (errorCounts.get(relativePath) || 0) + 1);
		}
	}
}

const sorted = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]);

console.log('\n📊 Top 50 Git-Tracked Files by ACTUAL Error Count:\n');
console.log('Rank | Errors | File');
console.log('-----|--------|-----');

sorted.slice(0, 50).forEach(([file, count], i) => {
	console.log(`${(i + 1).toString().padStart(4)} | ${count.toString().padStart(6)} | ${file}`);
});

const totalErrors = Array.from(errorCounts.values()).reduce((a, b) => a + b, 0);
const avgErrors = errorCounts.size > 0 ? (totalErrors / errorCounts.size).toFixed(1) : 0;
const maxErrors = sorted.length > 0 ? sorted[0][1] : 0;

console.log('\n📈 Summary:');
console.log(`  Total git-tracked files with errors: ${errorCounts.size}`);
console.log(`  Total ACTUAL errors in git-tracked files: ${totalErrors}`);
console.log(`  Average errors per file: ${avgErrors}`);
console.log(`  Maximum errors in single file: ${maxErrors}`);
console.log(`  Files with 10+ errors: ${sorted.filter(([_, c]) => c >= 10).length}`);
console.log(`  Files with 20+ errors: ${sorted.filter(([_, c]) => c >= 20).length}`);
console.log(`  Files with 50+ errors: ${sorted.filter(([_, c]) => c >= 50).length}`);
