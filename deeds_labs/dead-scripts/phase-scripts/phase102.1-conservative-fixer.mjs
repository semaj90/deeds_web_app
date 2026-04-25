#!/usr/bin/env node
/**
 * Phase 102.1: CONSERVATIVE Error Fixer
 * Excludes aggressive incomplete_ternary pattern
 * Targets: TS1005, TS1128, TS1109 with validated patterns only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

// Conservative patterns only (NO incomplete_ternary)
const PATTERNS = [
	{
		name: 'missing_semicolon_declaration',
		description: 'Add missing semicolons to declarations',
		regex: /^(\s*(?:const|let|var|type|interface|export)\s+[^;\n]+)(\n)/gm,
		replacement: '$1;$2',
		validate: (match, code, index) => {
			const line = code.substring(code.lastIndexOf('\n', index) + 1, code.indexOf('\n', index));
			// Skip if already has semicolon or is in comment
			if (line.trim().endsWith(';') || line.trim().startsWith('//')) return false;
			// Skip multi-line declarations
			if (line.includes('{') && !line.includes('}')) return false;
			return true;
		}
	},
	{
		name: 'unexpected_closing_brace',
		description: 'Remove unnecessary semicolon after closing brace',
		regex: /(\}\s*);(\s*(?:else|catch|finally|\n|$))/g,
		replacement: '$1$2',
		validate: (match, code, index) => {
			// Don't remove semicolons after object literals
			const before = code.substring(Math.max(0, index - 100), index);
			if (before.includes('= {')) return false;
			return true;
		}
	},
	{
		name: 'async_placement',
		description: 'Fix async keyword placement',
		regex: /(\basync\s+)\s*(\basync\s+)/g,
		replacement: '$1',
		validate: () => true
	},
	{
		name: 'trailing_comma_in_call',
		description: 'Remove trailing comma in function calls',
		regex: /,(\s*\))/g,
		replacement: '$1',
		validate: (match, code, index) => {
			// Only in function calls, not array/object literals
			const before = code.substring(Math.max(0, index - 50), index);
			if (before.match(/\[/g) && !before.match(/\]/g)) return false; // In array
			if (before.match(/\{/g)?.length > before.match(/\}/g)?.length) return false; // In object
			return true;
		}
	},
	{
		name: 'function_param_colon',
		description: 'function foo(a, b: string) - fix param positioning',
		regex: /\(([^)]*),\s*([^:,)]+):\s*([^),]+)\)/g,
		replacement: (match, before, paramName, type) => {
			return `(${before}: ${type}, ${paramName})`;
		},
		validate: () => true
	},
	{
		name: 'duplicate_export',
		description: 'Remove duplicate export keyword',
		regex: /\bexport\s+export\s+/g,
		replacement: 'export ',
		validate: () => true
	},
	{
		name: 'optional_chain_assertion',
		description: 'Fix optional chaining with type assertion',
		regex: /\?\.\s*as\s+/g,
		replacement: ' as ',
		validate: () => true
	}
];

function findTypeScriptFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			// Skip common excluded directories
			if (['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(file)) {
				continue;
			}
			findTypeScriptFiles(filePath, fileList);
		} else if (file.match(/\.(ts|tsx)$/)) {
			fileList.push(filePath);
		}
	}

	return fileList;
}

function applyPatterns(code, filePath) {
	let modified = code;
	const fixes = {};

	for (const pattern of PATTERNS) {
		let count = 0;

		if (typeof pattern.replacement === 'function') {
			modified = modified.replace(pattern.regex, (...args) => {
				const match = args[0];
				const index = args[args.length - 2];

				if (pattern.validate && !pattern.validate(match, code, index)) {
					return match; // Skip if validation fails
				}

				count++;
				return pattern.replacement(...args);
			});
		} else {
			modified = modified.replace(pattern.regex, (match, ...args) => {
				const index = args[args.length - 2];

				if (pattern.validate && !pattern.validate(match, code, index)) {
					return match; // Skip if validation fails
				}

				count++;
				return pattern.replacement;
			});
		}

		if (count > 0) {
			fixes[pattern.name] = count;
		}
	}

	return { modified, fixes };
}

async function processFiles(apply = false) {
	console.log('\n╔════════════════════════════════════════════════════════════╗');
	console.log('║       PHASE 102.1: CONSERVATIVE ERROR FIXER              ║');
	console.log('╚════════════════════════════════════════════════════════════╝\n');
	console.log(`Mode: ${apply ? '✍️  LIVE' : '🔍 DRY RUN'}`);
	console.log(`Patterns: ${PATTERNS.length} conservative patterns (NO incomplete_ternary)\n`);

	const files = findTypeScriptFiles(SRC_DIR);
	console.log(`📂 Scanning ${files.length} TypeScript files...\n`);

	const results = {
		filesScanned: 0,
		filesModified: 0,
		totalFixes: 0,
		patternStats: {},
		fileDetails: []
	};

	for (const pattern of PATTERNS) {
		results.patternStats[pattern.name] = { count: 0, description: pattern.description };
	}

	for (let i = 0; i < files.length; i++) {
		const filePath = files[i];
		results.filesScanned++;

		if ((i + 1) % 100 === 0) {
			process.stdout.write(`\r   Progress: ${i + 1}/${files.length} files scanned`);
		}

		const code = fs.readFileSync(filePath, 'utf-8');
		const { modified, fixes } = applyPatterns(code, filePath);

		if (modified !== code) {
			results.filesModified++;
			const fixCount = Object.values(fixes).reduce((sum, count) => sum + count, 0);
			results.totalFixes += fixCount;

			for (const [patternName, count] of Object.entries(fixes)) {
				results.patternStats[patternName].count += count;
			}

			results.fileDetails.push({
				file: path.relative(ROOT_DIR, filePath),
				fixes: fixCount,
				patterns: fixes
			});

			if (apply) {
				fs.writeFileSync(filePath, modified, 'utf-8');
			}
		}
	}

	console.log(`\r   Progress: ${files.length}/${files.length} files scanned ✓      \n`);

	// Display results
	console.log('\n╔════════════════════════════════════════════════════════════╗');
	console.log('║                    RESULTS SUMMARY                         ║');
	console.log('╚════════════════════════════════════════════════════════════╝\n');
	console.log(`Files scanned: ${results.filesScanned}`);
	console.log(`Files with fixes: ${results.filesModified}`);
	console.log(`Total fixes: ${results.totalFixes}`);
	console.log(`Mode: ${apply ? 'LIVE (files updated)' : 'DRY RUN (no changes made)'}\n`);

	console.log('📊 Pattern Breakdown:\n');
	const sortedPatterns = Object.entries(results.patternStats)
		.sort((a, b) => b[1].count - a[1].count)
		.filter(([_, data]) => data.count > 0);

	for (const [name, data] of sortedPatterns) {
		const percentage = ((data.count / results.totalFixes) * 100).toFixed(1);
		console.log(`   ${name}: ${data.count} fixes (${percentage}%)`);
		console.log(`      └─ ${data.description}\n`);
	}

	if (results.fileDetails.length > 0) {
		console.log('\n🎯 Top 10 Files with Most Fixes:\n');
		const topFiles = results.fileDetails
			.sort((a, b) => b.fixes - a.fixes)
			.slice(0, 10);

		for (const file of topFiles) {
			console.log(`   ${file.file}: ${file.fixes} fixes`);
		}
	}

	// Save report
	if (!fs.existsSync(REPORTS_DIR)) {
		fs.mkdirSync(REPORTS_DIR, { recursive: true });
	}

	const reportPath = path.join(REPORTS_DIR, `phase102.1-fixer-${apply ? 'live' : 'dryrun'}.json`);
	fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
	console.log(`\n📄 Report saved: ${reportPath}`);

	if (!apply) {
		console.log('\n💡 To apply fixes, run: node scripts/phase102.1-conservative-fixer.mjs --apply');
	}
}

// Run
const apply = process.argv.includes('--apply');
processFiles(apply).catch(console.error);
