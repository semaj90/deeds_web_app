#!/usr/bin/env node
/**
 * Phase 81: TS1005 Syntax Corruption Fixer
 *
 * Targets ONLY files with TS1005 errors from tsc-summary.json
 * Uses raw text patterns since corruption breaks AST parsing
 *
 * Patterns fixed:
 * 1. Function signatures: `) ,` → `, `, missing param names
 * 2. Object literals: malformed property:value pairs
 * 3. Type annotations: `: Type` → `| Type` in unions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const isDryRun = process.argv.includes('--dry-run');
const targetFile = process.argv.includes('--file')
	? process.argv[process.argv.indexOf('--file') + 1]
	: null;

// Load TS1005 errors from tsc-summary.json
const summaryPath = path.join(ROOT, 'reports/tsc-summary.json');
if (!fs.existsSync(summaryPath)) {
	console.error('❌ reports/tsc-summary.json not found. Run phase81-tsc-summarize.mjs first');
	process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

// Re-parse TSC errors (sample only has first 50)
// Need full error list, so re-run TSC
import { spawnSync } from 'child_process';

console.log('📊 Running TSC to get full error list...\n');
const result = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
	cwd: ROOT,
	encoding: 'utf8',
	maxBuffer: 50 * 1024 * 1024, // 50MB buffer
});

const errorPattern = /^(.+)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const tscOutput = result.stdout || result.stderr || '';
const allErrors = tscOutput
	.split('\n')
	.map(line => line.trim())
	.filter(line => errorPattern.test(line))
	.map(line => {
		const match = line.match(errorPattern);
		return {
			file: match[1],
			line: parseInt(match[2]),
			col: parseInt(match[3]),
			code: match[4],
			msg: match[5]
		};
	});

const ts1005Errors = allErrors.filter(e => e.code === 'TS1005');

console.log(`🔧 Phase 81: TS1005 Syntax Corruption Fixer\n`);
console.log(`Found ${ts1005Errors.length} TS1005 errors\n`);

if (isDryRun) {
	console.log('🔍 DRY RUN MODE - No files will be modified\n');
}

// Group errors by file (excluding .svelte-kit generated types)
const errorsByFile = new Map();
for (const error of ts1005Errors) {
	if (error.file.includes('.svelte-kit')) continue; // Skip generated files

	if (!errorsByFile.has(error.file)) {
		errorsByFile.set(error.file, []);
	}
	errorsByFile.get(error.file).push(error);
}

console.log(`📁 Target files with TS1005 errors: ${errorsByFile.size}\n`);

let filesProcessed = 0;
let filesFixed = 0;
const fixes = [];

for (const [relPath, errors] of errorsByFile.entries()) {
	if (targetFile && !relPath.includes(targetFile)) continue;

	filesProcessed++;
	const fullPath = path.join(ROOT, relPath);

	if (!fs.existsSync(fullPath)) {
		console.warn(`⚠️  File not found: ${relPath}`);
		continue;
	}

	let content = fs.readFileSync(fullPath, 'utf8');
	const originalContent = content;
	let changeCount = 0;

	// Pattern 1: Function signature corruption
	// Before: `function foo(a: number), b: string): Type {`
	// After:  `function foo(a: number, b: string): Type {`
	const funcSigPattern = /\(([^)]*)\)\s*,\s*(\w+):\s*([^)]+)\):/g;
	if (funcSigPattern.test(content)) {
		content = content.replace(funcSigPattern, '($1, $2: $3):');
		changeCount++;
	}

	// Pattern 2: Object literal property corruption (common in Drizzle selects)
	// Before: `{ id: cases.id, cases.title: case_number }`
	// After:  `{ id: cases.id, title: cases.title, case_number: cases.case_number }`
	// This is tricky - need line-by-line analysis for each error

	for (const error of errors) {
		const lines = content.split('\n');
		const lineIndex = error.line - 1;

		if (lineIndex >= lines.length) continue;

		const line = lines[lineIndex];
		const col = error.col - 1;

		// Extract context around error position
		const before = line.substring(0, col);
		const after = line.substring(col);

		// Pattern 2a: `table.col: value` should be `col: table.col`
		const malformedPropPattern = /(\w+)\.(\w+):\s*(\w+)/g;
		const fixedLine = line.replace(malformedPropPattern, (match, table, col, val) => {
			// Heuristic: if value looks like a column name from same table
			if (line.includes(`${table}.${val}`)) {
				return `${col}: ${table}.${col}`;
			}
			return match;
		});

		if (fixedLine !== line) {
			lines[lineIndex] = fixedLine;
			content = lines.join('\n');
			changeCount++;
		}

		// Pattern 3: Missing comma in object literal
		// Before: `{ a: 1 b: 2 }`
		// After:  `{ a: 1, b: 2 }`
		const missingCommaPattern = /(\w+):\s*([^,}]+)\s+(\w+):/g;
		const fixedLine2 = lines[lineIndex].replace(missingCommaPattern, '$1: $2, $3:');

		if (fixedLine2 !== lines[lineIndex]) {
			lines[lineIndex] = fixedLine2;
			content = lines.join('\n');
			changeCount++;
		}
	}

	// Pattern 4: Type annotation corruption
	// Before: `type Foo = string: null`
	// After:  `type Foo = string | null`
	content = content.replace(/:\s+(null|undefined)(?!\s*[,;])/g, ' | $1');

	if (content !== originalContent) {
		filesFixed++;
		fixes.push({
			file: relPath,
			changes: changeCount,
			errorCount: errors.length
		});

		console.log(`✅ ${relPath}`);
		console.log(`   Errors: ${errors.length}, Fixes applied: ${changeCount}\n`);

		if (!isDryRun) {
			fs.writeFileSync(fullPath, content, 'utf8');
		}
	} else {
		console.log(`⏭️  ${relPath} - No automatic fixes available`);
	}
}

console.log('\n======================================');
console.log('📊 Summary');
console.log('======================================\n');
console.log(`Files processed: ${filesProcessed}`);
console.log(`Files fixed: ${filesFixed}`);
console.log(`Total transformations: ${fixes.reduce((sum, f) => sum + f.changes, 0)}\n`);

if (fixes.length > 0) {
	console.log('Top 10 files by error count:\n');
	fixes
		.sort((a, b) => b.errorCount - a.errorCount)
		.slice(0, 10)
		.forEach((f, i) => {
			console.log(`  ${i + 1}. ${f.file}: ${f.errorCount} errors, ${f.changes} fixes`);
		});
}

if (isDryRun) {
	console.log('\n🔍 DRY RUN COMPLETE - Remove --dry-run to apply changes');
}

process.exit(filesFixed > 0 ? 0 : 1);
