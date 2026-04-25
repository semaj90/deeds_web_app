#!/usr/bin/env node
/**
 * Phase 66 Dry-Run Tester
 * Preview fixes before applying them in batches
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const COLORS = {
	reset: '\x1b[0m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	gray: '\x1b[90m'
};

function log(color, ...args) {
	console.log(color + args.join(' ') + COLORS.reset);
}

function getErrorCount() {
	try {
		const result = execSync('npx svelte-check --threshold error 2>&1', {
			encoding: 'utf-8',
			maxBuffer: 50 * 1024 * 1024
		});
		const match = result.match(/found (\d+) errors/);
		return match ? parseInt(match[1]) : 0;
	} catch {
		return 0;
	}
}

function scanFiles(dir, extensions = ['.svelte', '.ts', '.js']) {
	const files = [];

	function scan(currentDir) {
		const entries = readdirSync(currentDir);

		for (const entry of entries) {
			const fullPath = join(currentDir, entry);
			const stat = statSync(fullPath);

			if (stat.isDirectory()) {
				if (!entry.startsWith('.') && entry !== 'node_modules') {
					scan(fullPath);
				}
			} else if (extensions.some(ext => entry.endsWith(ext))) {
				files.push(fullPath);
			}
		}
	}

	scan(dir);
	return files;
}

function analyzePattern(content, pattern, description) {
	const regex = new RegExp(pattern, 'g');
	const matches = content.match(regex);
	return {
		description,
		pattern,
		count: matches ? matches.length : 0,
		examples: matches ? matches.slice(0, 3) : []
	};
}

const PATTERNS = [
	{
		name: 'Missing Commas in Objects',
		pattern: '(\\w+):\\s*(\\w+)\\s+(\\w+):',
		fix: '$1: $2, $3:',
		description: 'object: value nextKey: → object: value, nextKey:'
	},
	{
		name: 'Missing Commas in Arrays',
		pattern: '\\[([^\\]]+)\\s+(\\w+)(?!\\s*:)',
		fix: '[$1, $2',
		description: '[item1 item2] → [item1, item2]'
	},
	{
		name: 'Double Colons in Objects',
		pattern: '(\\w+):\\s*:\\s*(\\w+)',
		fix: '$1: $2',
		description: 'key: : value → key: value'
	},
	{
		name: 'Semicolon Before Comma',
		pattern: ';\\s*,',
		fix: ',',
		description: '; , → ,'
	},
	{
		name: 'Missing Semicolons After Statements',
		pattern: '\\}\\s*([a-z]\\w+)\\s*:',
		fix: '}; $1:',
		description: '}property: → }; property:'
	}
];

async function dryRun() {
	log(COLORS.cyan, '\n🔍 Phase 66: Dry-Run Pattern Analysis');
	log(COLORS.cyan, '='.repeat(60));

	const baseline = getErrorCount();
	log(COLORS.yellow, `\n📊 Current Errors: ${baseline.toLocaleString()}\n`);

	const srcDir = join(process.cwd(), 'src');
	const files = scanFiles(srcDir);

	log(COLORS.gray, `Scanning ${files.length} files...\n`);

	const results = [];

	for (const pattern of PATTERNS) {
		let totalMatches = 0;
		let affectedFiles = 0;
		const exampleFiles = [];

		for (const file of files) {
			const content = readFileSync(file, 'utf-8');
			const analysis = analyzePattern(content, pattern.pattern, pattern.description);

			if (analysis.count > 0) {
				totalMatches += analysis.count;
				affectedFiles++;

				if (exampleFiles.length < 3) {
					exampleFiles.push({
						file: file.replace(process.cwd(), '').replace(/\\/g, '/'),
						count: analysis.count,
						examples: analysis.examples
					});
				}
			}
		}

		results.push({
			...pattern,
			totalMatches,
			affectedFiles,
			exampleFiles
		});
	}

	// Sort by impact
	results.sort((a, b) => b.totalMatches - a.totalMatches);

	log(COLORS.cyan, '📋 Pattern Analysis Results:\n');

	results.forEach((result, index) => {
		if (result.totalMatches > 0) {
			log(COLORS.green, `${index + 1}. ${result.name}`);
			log(COLORS.gray, `   Pattern: ${result.pattern}`);
			log(COLORS.yellow, `   Matches: ${result.totalMatches.toLocaleString()} across ${result.affectedFiles} files`);
			log(COLORS.gray, `   Fix: ${result.description}`);

			if (result.exampleFiles.length > 0) {
				log(COLORS.gray, '   Example files:');
				result.exampleFiles.forEach(ex => {
					log(COLORS.gray, `     - ${ex.file} (${ex.count} matches)`);
					ex.examples.slice(0, 2).forEach(example => {
						log(COLORS.gray, `       "${example.substring(0, 60)}..."`);
					});
				});
			}
			console.log();
		}
	});

	// Calculate estimated impact
	const totalMatches = results.reduce((sum, r) => sum + r.totalMatches, 0);
	const estimatedErrorReduction = Math.floor(totalMatches * 0.3); // Conservative estimate

	log(COLORS.cyan, '='.repeat(60));
	log(COLORS.yellow, '📊 Estimated Impact:');
	log(COLORS.green, `   Total Pattern Matches: ${totalMatches.toLocaleString()}`);
	log(COLORS.green, `   Estimated Error Reduction: ${estimatedErrorReduction.toLocaleString()} (${((estimatedErrorReduction/baseline)*100).toFixed(1)}%)`);
	log(COLORS.yellow, `   Projected Final Count: ${(baseline - estimatedErrorReduction).toLocaleString()}`);
	log(COLORS.cyan, '='.repeat(60));

	log(COLORS.green, '\n✅ Dry-run complete! No files were modified.');
	log(COLORS.yellow, '\nTo apply fixes:');
	log(COLORS.gray, '  1. Review patterns above');
	log(COLORS.gray, '  2. Run: node scripts/fix-object-literals.mjs --limit 50');
	log(COLORS.gray, '  3. Verify with: npx svelte-check --threshold error\n');
}

dryRun().catch(console.error);
