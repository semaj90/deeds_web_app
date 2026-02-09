#!/usr/bin/env node

/**
 * Fixes CSS corruption: property, property → property; property
 * Pattern: Commas used instead of semicolons in CSS property separators
 *
 * Examples:
 * - border-radius: 8px, text-align: center → border-radius: 8px; text-align: center
 * - font-size: 1rem, color: red → font-size: 1rem; color: red
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 CSS COMMA → SEMICOLON FIXER\n');
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

		// Only process files with <style> blocks
		if (!content.includes('<style>') && !content.includes('<style ')) {
			filesProcessed++;
			continue;
		}

		// Extract style blocks to only fix CSS, not TypeScript
		const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
		const styleMatches = [...content.matchAll(styleRegex)];

		if (styleMatches.length === 0) {
			filesProcessed++;
			continue;
		}

		let fixed = content;
		let fileFixCount = 0;

		// Pattern: CSS property value followed by comma before next property
		// Match: value, property-name: (but not in url(), rgb(), etc.)
		// Example: "8px, text-align" → "8px; text-align"
		// Example: "1rem, color" → "1rem; color"

		for (const match of styleMatches) {
			const styleBlock = match[1];
			let fixedStyleBlock = styleBlock;

			// Pattern 1: value, property: → value; property:
			// Matches: "8px, text-align:" or "1rem, color:"
			// Must avoid: rgb(255, 0, 0), url(..., ...), calc(100% - 1rem, ...)
			const pattern1 = /([a-z0-9]+px|[a-z0-9]+rem|[a-z0-9]+%|[a-z0-9]+em|auto|none|[0-9]+),\s*([a-z-]+):/g;
			const matches1 = [...styleBlock.matchAll(pattern1)];
			fileFixCount += matches1.length;
			fixedStyleBlock = fixedStyleBlock.replace(pattern1, '$1; $2:');

			// Pattern 2: color value, next-property: → color; next-property:
			// Matches: "#abc123, font-size:" or "red, margin:"
			const pattern2 = /(#[a-f0-9]{3,6}|[a-z]+),\s*([a-z-]+):/gi;
			const matches2 = [...styleBlock.matchAll(pattern2)];
			fileFixCount += matches2.length;
			fixedStyleBlock = fixedStyleBlock.replace(pattern2, '$1; $2:');

			// Pattern 3: Fix missing semicolons before closing braces
			// Matches: "value}" → "value;}"
			const pattern3 = /([a-z0-9#]+)\s*}/g;
			const matches3 = [...styleBlock.matchAll(pattern3)];
			// Only count if semicolon is actually missing
			const actualMisses = matches3.filter(m => {
				const before = styleBlock.substring(0, m.index);
				return !before.endsWith(';');
			});
			fileFixCount += actualMisses.length;
			fixedStyleBlock = fixedStyleBlock.replace(pattern3, (match, value, offset) => {
				// Check if previous char is already a semicolon
				const before = fixedStyleBlock.substring(0, offset);
				if (before.endsWith(';')) {
					return match; // Don't double-add semicolon
				}
				return `${value};}`;
			});

			// Replace the style block in the content
			fixed = fixed.replace(match[0], `<style${match[0].match(/<style([^>]*)>/)[1] || ''}>${fixedStyleBlock}</style>`);
		}

		if (fileFixCount > 0) {
			writeFileSync(fullPath, fixed, 'utf-8');
			filesChanged++;
			totalFixes += fileFixCount;
			changedFiles.push({ file: filePath, fixes: fileFixCount });
			console.log(`✓ ${filePath}`);
			console.log(`  Fixed ${fileFixCount} CSS comma/semicolon error(s)`);
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
console.log(`Total CSS comma → semicolon fixes: ${totalFixes}`);

console.log('\n✨ CSS comma corruption fix complete!');
console.log(`Expected error reduction: ~${totalFixes * 2} errors (cascade effects)\n`);

// Save report
const reportPath = resolve('css-comma-fix-report.json');
writeFileSync(reportPath, JSON.stringify({
	timestamp: new Date().toISOString(),
	filesProcessed,
	filesChanged,
	totalFixes,
	changedFiles
}, null, 2));

console.log(`📄 Report saved: css-comma-fix-report.json\n`);