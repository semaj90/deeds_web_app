#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔧 Fixing leading comma pattern in all git-tracked files...\n');

// Get all git-tracked TypeScript and Svelte files
const files = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean);

let filesFixed = 0;
let patternsFixed = 0;

for (const file of files) {
	try {
		const content = readFileSync(file, 'utf-8');
		const lines = content.split('\n');
		let modified = false;
		let fixCount = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			
			// Check if line starts with comma (after whitespace)
			const match = line.match(/^(\s*),\s*(.+)$/);
			if (match) {
				const indent = match[1];
				const rest = match[2];
				
				// Replace leading comma with just the content
				lines[i] = `${indent}${rest}`;
				modified = true;
				fixCount++;
			}
		}

		if (modified) {
			const fixed = lines.join('\n');
			writeFileSync(file, fixed, 'utf-8');
			console.log(`✅ ${file}: fixed ${fixCount} leading commas`);
			filesFixed++;
			patternsFixed += fixCount;
		}
	} catch (error) {
		console.error(`❌ Error processing ${file}:`, error.message);
	}
}

console.log(`\n📊 Summary:`);
console.log(`  Files fixed: ${filesFixed}`);
console.log(`  Leading commas fixed: ${patternsFixed}`);
console.log(`\n✅ Done! Run 'npm run check' to verify.`);
