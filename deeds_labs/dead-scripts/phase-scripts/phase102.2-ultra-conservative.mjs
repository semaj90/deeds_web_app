#!/usr/bin/env node
/**
 * Phase 102.2: ULTRA-CONSERVATIVE Error Fixer
 * ONLY proven safe patterns: semicolons and trailing commas
 * NO function_param_colon (caused +40,764 errors)
 * NO incomplete_ternary (caused +8,267 errors)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

// ULTRA-CONSERVATIVE: Only semicolon and trailing comma patterns
const PATTERNS = [
	{
		name: 'missing_semicolon_declaration',
		description: 'Add missing semicolons to declarations',
		regex: /^(\s*(?:const|let|var|type|interface|export\s+(?:const|let|var|type|interface))\s+[^;\n{]+)(\n)/gm,
		replacement: '$1;$2',
		validate: (match, code, index) => {
			const line = code.substring(code.lastIndexOf('\n', index) + 1, code.indexOf('\n', index));
			// Skip if already has semicolon
			if (line.trim().endsWith(';')) return false;
			// Skip if line has opening brace (multi-line)
			if (line.includes('{') && !line.includes('}')) return false;
			// Skip comments
			if (line.trim().startsWith('//')) return false;
			// Skip lines with = { (object literals)
			if (line.includes('= {')) return false;
			return true;
		}
	},
	{
		name: 'unexpected_closing_brace',
		description: 'Remove unnecessary semicolon after closing brace',
		regex: /(\})\s*;(\s*(?:else|catch|finally))/g,
		replacement: '$1$2',
		validate: (match, code, index) => {
			// Very conservative: only remove before else/catch/finally
			return true;
		}
	},
	{
		name: 'trailing_comma_in_call',
		description: 'Remove trailing comma in function calls',
		regex: /,(\s*\))/g,
		replacement: '$1',
		validate: (match, code, index) => {
			// Only in function calls, not destructuring or arrays
			const before = code.substring(Math.max(0, index - 80), index);
			// Skip if in array literal
			if (before.match(/\[/) && !before.match(/\]/)) return false;
			// Skip if in object destructuring
			if (before.match(/\{\s*[a-zA-Z_$][\w$]*\s*,/)) return false;
			return true;
		}
	},
	{
		name: 'duplicate_export',
		description: 'Remove duplicate export keyword',
		regex: /\bexport\s+export\s+/g,
		replacement: 'export ',
		validate: () => true
	}
];

function findTypeScriptFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
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
					return match;
				}

				count++;
				return pattern.replacement(...args);
			});
		} else {
			modified = modified.replace(pattern.regex, (match, ...args) => {
				const index = args[args.length - 2];

				if (pattern.validate && !pattern.validate(match, code, index)) {
					return match;
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
	console.log('║      PHASE 102.2: ULTRA-CONSERVATIVE FIXER               ║');
	console.log('╚════════════════════════════════════════════════════════════╝\n');
	console.log(`Mode: ${apply ? '✍️  LIVE' : '🔍 DRY RUN'}`);
	console.log(`Patterns: ${PATTERNS.length} ULTRA-CONSERVATIVE (semicolons + trailing commas ONLY)\n`);
	console.log('❌ EXCLUDED: function_param_colon (caused +40,764 errors)');
	console.log('❌ EXCLUDED: incomplete_ternary (caused +8,267 errors)');
	console.log('❌ EXCLUDED: async_placement (untested)\n');

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
		const percentage = results.totalFixes > 0 ? ((data.count / results.totalFixes) * 100).toFixed(1) : '0.0';
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

	if (!fs.existsSync(REPORTS_DIR)) {
		fs.mkdirSync(REPORTS_DIR, { recursive: true });
	}

	const reportPath = path.join(REPORTS_DIR, `phase102.2-ultra-conservative-${apply ? 'live' : 'dryrun'}.json`);
	fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
	console.log(`\n📄 Report saved: ${reportPath}`);

	if (!apply) {
		console.log('\n💡 To apply fixes, run: node scripts/phase102.2-ultra-conservative.mjs --apply');
	}
}

const apply = process.argv.includes('--apply');
processFiles(apply).catch(console.error);
