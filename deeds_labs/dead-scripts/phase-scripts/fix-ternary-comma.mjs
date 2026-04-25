#!/usr/bin/env node

/**
 * Fixes ternary operators using comma instead of colon
 * Pattern: condition ? trueValue, falseValue
 * Fix: condition ? trueValue : falseValue
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 TERNARY COMMA FIXER\n');
console.log('='.repeat(80) + '\n');

// Get all git-tracked TypeScript/Svelte files
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
		let fixed = content;
		let fileFixCount = 0;

		// Pattern 1: Ternary with strings (quoted values)
		// Match: ? 'value', 'value' or ? "value", "value"
		// Fix: ? 'value' : 'value'
		const stringPattern = /\?\s*(['"][^'"]*['"])\s*,\s*(['"][^'"]*['"])/g;
		const stringMatches = [...content.matchAll(stringPattern)];

		for (const match of stringMatches) {
			const original = match[0];
			const replacement = `? ${match[1]} : ${match[2]}`;
			fixed = fixed.replace(original, replacement);
			fileFixCount++;
		}

		// Pattern 2: Ternary with identifiers or simple expressions
		// Match: ? identifier, identifier or ? obj.prop, obj.prop
		// Fix: ? identifier : identifier
		// This is trickier - need to avoid false positives
		const identifierPattern = /\?\s*([a-zA-Z_$][\w.$]*(?:\([^)]*\))?)\s*,\s*([a-zA-Z_$][\w.$]*(?:\([^)]*\))?)\s*(?=[}\s])/g;
		const identifierMatches = [...content.matchAll(identifierPattern)];

		for (const match of identifierMatches) {
			const original = match[0];
			const replacement = `? ${match[1]} : ${match[2]}`;
			fixed = fixed.replace(original, replacement);
			fileFixCount++;
		}

		// Pattern 3: Ternary in object literals - the trickiest case
		// Match: { duration, 300 } in transition:slide={{ duration, 300 }}
		// This is mixing shorthand and positional - needs to be { duration: 300 }
		const objectShorthandPattern = /\{\s*([a-zA-Z_$][\w$]*)\s*,\s*(\d+)\s*\}/g;
		const objectMatches = [...content.matchAll(objectShorthandPattern)];

		for (const match of objectMatches) {
			const original = match[0];
			const replacement = `{ ${match[1]}: ${match[2]} }`;
			fixed = fixed.replace(original, replacement);
			fileFixCount++;
		}

		if (fileFixCount > 0) {
			writeFileSync(fullPath, fixed, 'utf-8');
			filesChanged++;
			totalFixes += fileFixCount;
			changedFiles.push({ file: filePath, fixes: fileFixCount });
			console.log(`✓ ${filePath}`);
			console.log(`  Fixed ${fileFixCount} ternary/object error${fileFixCount > 1 ? 's' : ''}`);
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
console.log(`Total fixes applied: ${totalFixes}`);

console.log('\n✨ Ternary comma fix complete!');
console.log(`Expected error reduction: ~${totalFixes * 2} errors eliminated\n`);

// Save report
const reportPath = resolve('ternary-fix-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalFixes,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: ternary-fix-report.json\n`);
