#!/usr/bin/env node

/**
 * Analyzes error patterns in git-tracked files to identify most common issues
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Get all git-tracked files
const gitFiles = new Set(
	execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' })
		.split('\n')
		.filter(Boolean)
		.map(f => f.trim())
);

console.log(`Analyzing error patterns in ${gitFiles.size} git-tracked files...\n`);

const errorOutput = readFileSync(resolve('svelte-check-output.txt'), 'utf-8');

// Pattern categories (order matters - more specific patterns first)
const patterns = {
	'CSS brace error': /\{|\} expected \(css\)/i,
	'CSS at-rule error': /at-rule or selector expected \(css\)/i,
	'TypeScript comma': /',' expected\./i,
	'Property assignment': /Property assignment expected/i,
	'Declaration expected': /Declaration (or statement )?expected/i,
	'Cannot find name': /Cannot find name/i,
	'Catch/finally missing': /'catch' or 'finally' expected/i,
	'Unexpected token': /Unexpected token/i,
	'Missing semicolon': /';' expected/i,
	'Property does not exist': /Property .* does not exist/i,
	'Type mismatch': /Type .* is not assignable to type/i,
	'No overload matches': /No overload matches this call/i,
	'Object possibly undefined': /Object is possibly 'undefined'/i,
	'Import error': /Cannot find module|Module .* has no exported member/i,
	'Svelte event deprecated': /on:[a-z]+ is deprecated/i,
	'Duplicate identifier': /Duplicate identifier/i,
	'Implicit any': /implicitly has an? 'any' type/i,
};

const patternCounts = new Map();
const fileErrors = new Map();
const errorsByFile = new Map();

// Initialize counters
Object.keys(patterns).forEach(key => patternCounts.set(key, 0));

const lines = errorOutput.split('\n');

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	const cleanLine = line.replace(/\x1b\[\d+m/g, '');

	// Check if this is an error location line
	const fileMatch = cleanLine.match(/^c:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\(src.+?):(\d+):(\d+)/);

	if (fileMatch && i + 1 < lines.length) {
		const relativePath = fileMatch[1].replace(/\\/g, '/');

		// Only process if file is git-tracked
		if (!gitFiles.has(relativePath)) {
			continue;
		}

		// Next line should contain "Error:"
		const nextLine = lines[i + 1];
		const cleanNextLine = nextLine.replace(/\x1b\[\d+m/g, '');

		if (cleanNextLine.includes('Error:')) {
			// Categorize error
			let categorized = false;
			for (const [patternName, regex] of Object.entries(patterns)) {
				if (regex.test(cleanNextLine)) {
					patternCounts.set(patternName, (patternCounts.get(patternName) || 0) + 1);

					// Track errors by file
					if (!errorsByFile.has(relativePath)) {
						errorsByFile.set(relativePath, new Map());
					}
					const filePatterns = errorsByFile.get(relativePath);
					filePatterns.set(patternName, (filePatterns.get(patternName) || 0) + 1);

					categorized = true;
					break;
				}
			}

			if (!categorized) {
				patternCounts.set('Other', (patternCounts.get('Other') || 0) + 1);

				if (!errorsByFile.has(relativePath)) {
					errorsByFile.set(relativePath, new Map());
				}
				const filePatterns = errorsByFile.get(relativePath);
				filePatterns.set('Other', (filePatterns.get('Other') || 0) + 1);
			}
		}
	}
}

// Sort patterns by frequency
const sortedPatterns = Array.from(patternCounts.entries())
	.filter(([_, count]) => count > 0)
	.sort((a, b) => b[1] - a[1]);

console.log('📊 Error Pattern Distribution (Git-Tracked Files Only):\n');
console.log('Rank | Count  | Pattern');
console.log('-----|--------|--------');

let totalCategorized = 0;
sortedPatterns.forEach(([pattern, count], i) => {
	console.log(`${(i + 1).toString().padStart(4)} | ${count.toString().padStart(6)} | ${pattern}`);
	totalCategorized += count;
});

console.log(`\n📈 Summary:`);
console.log(`  Total categorized errors: ${totalCategorized}`);
console.log(`  Top 3 patterns account for: ${sortedPatterns.slice(0, 3).reduce((sum, [_, count]) => sum + count, 0)} errors`);

// Find top files for the 3 most common error patterns
for (let patternIdx = 0; patternIdx < Math.min(3, sortedPatterns.length); patternIdx++) {
	const [patternName, patternCount] = sortedPatterns[patternIdx];

	console.log(`\n\n🎯 Top 10 Files by "${patternName}" Errors (${patternCount} total):\n`);

	const filesWithPattern = [];
	for (const [file, patterns] of errorsByFile.entries()) {
		const count = patterns.get(patternName) || 0;
		if (count > 0) {
			filesWithPattern.push([file, count]);
		}
	}

	filesWithPattern.sort((a, b) => b[1] - a[1]);
	filesWithPattern.slice(0, 10).forEach(([file, count], i) => {
		console.log(`${(i + 1).toString().padStart(2)}. [${count.toString().padStart(3)} errors] ${file}`);
	});
}
