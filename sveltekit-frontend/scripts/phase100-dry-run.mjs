#!/usr/bin/env node
/**
 * Phase 100: Dry-Run Automated Fixer
 * Tests fixes on top N files without writing changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--write');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5');

// Load error data
function loadErrorData() {
	const dataPath = path.join(ROOT, 'reports', 'phase100-error-data.json');
	if (!fs.existsSync(dataPath)) {
		console.error('❌ Error data not found. Run phase100-ast-analyzer.mjs first.');
		process.exit(1);
	}
	return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

// Fix patterns
const fixers = {
	// TS1005: ',' expected -> Check for object literal issues
	fixMissingComma(content, error) {
		const lines = content.split('\n');
		const lineIdx = error.line - 1;
		const colIdx = error.column - 1;

		if (lineIdx < 0 || lineIdx >= lines.length) return null;

		const line = lines[lineIdx];
		const char = line[colIdx];

		// Pattern: property followed by property without comma
		// e.g., "foo: string bar: number" -> "foo: string, bar: number"
		if (char === ' ' || char === '\t') {
			// Check if previous non-whitespace is identifier/closing brace
			let prevIdx = colIdx - 1;
			while (prevIdx >= 0 && /\s/.test(line[prevIdx])) prevIdx--;

			if (prevIdx >= 0) {
				const before = line.substring(0, colIdx);
				const after = line.substring(colIdx);

				// Insert comma
				return {
					file: error.file,
					line: error.line,
					original: line,
					fixed: before + ',' + after,
					type: 'add-comma'
				};
			}
		}

		return null;
	},

	// TS1005: ';' expected
	fixMissingSemicolon(content, error) {
		const lines = content.split('\n');
		const lineIdx = error.line - 1;
		const colIdx = error.column - 1;

		if (lineIdx < 0 || lineIdx >= lines.length) return null;

		const line = lines[lineIdx];

		// Add semicolon at end of statement
		const before = line.substring(0, colIdx);
		const after = line.substring(colIdx);

		return {
			file: error.file,
			line: error.line,
			original: line,
			fixed: before + ';' + after,
			type: 'add-semicolon'
		};
	},

	// TS1109: Expression expected
	fixExpressionExpected(content, error) {
		const lines = content.split('\n');
		const lineIdx = error.line - 1;

		if (lineIdx < 0 || lineIdx >= lines.length) return null;

		const line = lines[lineIdx];

		// Common pattern: shorthand property where type expected
		// e.g., "{ foo }" -> "{ foo: foo }"
		const match = line.match(/{\s*(\w+)\s*}/);
		if (match) {
			const prop = match[1];
			const fixed = line.replace(match[0], `{ ${prop}: ${prop} }`);

			return {
				file: error.file,
				line: error.line,
				original: line,
				fixed,
				type: 'expand-shorthand'
			};
		}

		return null;
	}
};

// Apply fix to file
function applyFix(filePath, fix) {
	const fullPath = path.resolve(ROOT, filePath);

	if (!fs.existsSync(fullPath)) {
		console.warn(`⚠️  File not found: ${filePath}`);
		return false;
	}

	const content = fs.readFileSync(fullPath, 'utf8');
	const lines = content.split('\n');

	if (fix.line - 1 < 0 || fix.line - 1 >= lines.length) {
		return false;
	}

	if (lines[fix.line - 1] !== fix.original) {
		console.warn(`⚠️  Line mismatch in ${filePath}:${fix.line}`);
		return false;
	}

	lines[fix.line - 1] = fix.fixed;

	if (!DRY_RUN) {
		fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
	}

	return true;
}

// Main execution
async function main() {
	console.log(`\n🔧 Phase 100: Dry-Run Automated Fixer\n`);
	console.log(`Mode: ${DRY_RUN ? '🔍 DRY-RUN (no changes)' : '✍️  WRITE MODE'}`);
	console.log(`Limit: Top ${LIMIT} files\n`);

	const data = loadErrorData();
	const topFiles = data.topFiles.slice(0, LIMIT);

	let totalFixes = 0;
	let fixesByType = {};

	for (const fileData of topFiles) {
		const relPath = path.relative(ROOT, fileData.path).replace(/\\/g, '/');
		console.log(`\n📄 ${relPath} (${fileData.errorCount} errors)`);

		// Load file content
		const fullPath = path.resolve(ROOT, fileData.path);
		if (!fs.existsSync(fullPath)) {
			console.log(`   ⚠️  File not found, skipping`);
			continue;
		}

		const content = fs.readFileSync(fullPath, 'utf8');
		let fixes = [];

		// Try to fix each error
		for (const error of fileData.errors) {
			let fix = null;

			if (error.code === 'TS1005') {
				if (error.message.includes("','")) {
					fix = fixers.fixMissingComma(content, error);
				} else if (error.message.includes("';'")) {
					fix = fixers.fixMissingSemicolon(content, error);
				}
			} else if (error.code === 'TS1109') {
				fix = fixers.fixExpressionExpected(content, error);
			}

			if (fix) {
				fixes.push(fix);
				fixesByType[fix.type] = (fixesByType[fix.type] || 0) + 1;
			}
		}

		console.log(`   ✅ ${fixes.length} fixable errors found`);

		if (fixes.length > 0 && !DRY_RUN) {
			// Apply fixes (would need sorting by line number in real implementation)
			fixes.sort((a, b) => b.line - a.line); // Apply from bottom to top

			for (const fix of fixes) {
				if (applyFix(fileData.path, fix)) {
					totalFixes++;
				}
			}
		}

		totalFixes += fixes.length;

		// Show sample fixes
		fixes.slice(0, 3).forEach((fix, idx) => {
			console.log(`   ${idx + 1}. Line ${fix.line}: ${fix.type}`);
			console.log(`      - ${fix.original.trim()}`);
			console.log(`      + ${fix.fixed.trim()}`);
		});

		if (fixes.length > 3) {
			console.log(`   ... and ${fixes.length - 3} more`);
		}
	}

	console.log(`\n📊 Summary\n`);
	console.log(`Total fixes: ${totalFixes}`);
	console.log(`\nFixes by type:`);
	Object.entries(fixesByType).forEach(([type, count]) => {
		console.log(`  - ${type}: ${count}`);
	});

	if (DRY_RUN) {
		console.log(`\n💡 Run with --write to apply changes\n`);
	} else {
		console.log(`\n✅ Changes written to ${topFiles.length} files\n`);
	}
}

main().catch(console.error);
