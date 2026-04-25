#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔧 Fixing phantom comma pattern (;,) in all git-tracked files...\n');

// Get all git-tracked TypeScript and Svelte files
const files = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean);

let filesFixed = 0;
let patternsFixed = 0;

for (const file of files) {
	try {
		const content = readFileSync(file, 'utf-8');
		const before = (content.match(/;,/g) || []).length;
		
		if (before > 0) {
			// Fix: ;, → ;  (remove the comma)
			const fixed = content.replace(/;,\s*/g, '; ');
			
			const after = (fixed.match(/;,/g) || []).length;
			const fixedCount = before - after;
			
			if (fixedCount > 0) {
				writeFileSync(file, fixed, 'utf-8');
				console.log(`✅ ${file}: fixed ${fixedCount} patterns`);
				filesFixed++;
				patternsFixed += fixedCount;
			}
		}
	} catch (error) {
		console.error(`❌ Error processing ${file}:`, error.message);
	}
}

console.log(`\n📊 Summary:`);
console.log(`  Files fixed: ${filesFixed}`);
console.log(`  Patterns fixed: ${patternsFixed}`);
console.log(`\n✅ Done! Run 'npm run check' to verify.`);
