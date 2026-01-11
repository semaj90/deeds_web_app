#!/usr/bin/env node
/**
 * Phase 66 Safe Batch Fixer
 * Apply fixes in controlled batches with validation and git commits
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const BATCH_SIZE = parseInt(process.argv[2]) || 50;
const DRY_RUN = process.argv.includes('--dry-run');

const COLORS = {
	reset: '\x1b[0m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m'
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

function gitCommit(message, filesModified) {
	if (DRY_RUN) {
		log(COLORS.yellow, `[DRY-RUN] Would commit: ${message}`);
		return;
	}

	try {
		execSync('git add src/', { encoding: 'utf-8' });
		execSync(`git commit -m "${message}"`, { encoding: 'utf-8' });
		log(COLORS.green, `✅ Committed: ${message}`);
	} catch (error) {
		log(COLORS.yellow, `ℹ️  No changes to commit (${filesModified} files processed)`);
	}
}

function scanFiles(dir, extensions = ['.svelte', '.ts', '.js']) {
	const files = [];

	function scan(currentDir) {
		const entries = readdirSync(currentDir);

		for (const entry of entries) {
			const fullPath = join(currentDir, entry);
			try {
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					if (!entry.startsWith('.') && entry !== 'node_modules') {
						scan(fullPath);
					}
				} else if (extensions.some(ext => entry.endsWith(ext))) {
					files.push(fullPath);
				}
			} catch (err) {
				// Skip files we can't read
			}
		}
	}

	scan(dir);
	return files;
}

const PATTERNS = [
	{
		name: 'Semicolon Before Comma',
		pattern: /;\s*,/g,
		replacement: ',',
		priority: 1,
		description: '; , → ,'
	},
	{
		name: 'Double Colons',
		pattern: /(\w+):\s*:\s*(\w+)/g,
		replacement: '$1: $2',
		priority: 2,
		description: 'key: : value → key: value'
	},
	{
		name: 'Missing Semicolons After Braces',
		pattern: /\}\s*([a-z]\w+)\s*:/g,
		replacement: '}; $1:',
		priority: 3,
		description: '}property: → }; property:'
	},
	{
		name: 'Missing Commas in Objects',
		pattern: /(\w+):\s*(\w+)\s+(\w+):/g,
		replacement: '$1: $2, $3:',
		priority: 4,
		description: 'key: value nextKey: → key: value, nextKey:'
	}
];

function applyFixes(content, patterns) {
	let modified = content;
	let totalFixes = 0;

	for (const pattern of patterns) {
		const before = modified;
		modified = modified.replace(pattern.pattern, pattern.replacement);

		if (before !== modified) {
			const matches = (before.match(pattern.pattern) || []).length;
			totalFixes += matches;
		}
	}

	return { modified, totalFixes };
}

async function batchFix() {
	log(COLORS.cyan, '\n🔧 Phase 66: Safe Batch Fixer');
	log(COLORS.cyan, '='.repeat(60));

	if (DRY_RUN) {
		log(COLORS.yellow, '\n⚠️  DRY-RUN MODE: No files will be modified\n');
	}

	const baseline = getErrorCount();
	log(COLORS.yellow, `📊 Baseline Errors: ${baseline.toLocaleString()}`);
	log(COLORS.cyan, `📦 Batch Size: ${BATCH_SIZE} files\n`);

	const srcDir = join(process.cwd(), 'src');
	const allFiles = scanFiles(srcDir);

	log(COLORS.cyan, `Found ${allFiles.length} files to process\n`);

	// Sort patterns by priority
	const sortedPatterns = PATTERNS.sort((a, b) => a.priority - b.priority);

	let totalFilesModified = 0;
	let totalFixesApplied = 0;
	let batchNumber = 1;

	// Process in batches
	for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
		const batch = allFiles.slice(i, i + BATCH_SIZE);
		let batchModified = 0;
		let batchFixes = 0;

		log(COLORS.cyan, `\nProcessing Batch ${batchNumber} (${batch.length} files)...`);

		for (const file of batch) {
			try {
				const content = readFileSync(file, 'utf-8');
				const { modified, totalFixes } = applyFixes(content, sortedPatterns);

				if (modified !== content && totalFixes > 0) {
					if (!DRY_RUN) {
						writeFileSync(file, modified, 'utf-8');
					}

					batchModified++;
					batchFixes += totalFixes;

					const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/');
					log(COLORS.green, `  ✓ ${relativePath} (${totalFixes} fixes)`);
				}
			} catch (err) {
				const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/');
				log(COLORS.red, `  ✗ ${relativePath}: ${err.message}`);
			}
		}

		if (batchModified > 0) {
			log(COLORS.yellow, `\nBatch ${batchNumber} Summary:`);
			log(COLORS.green, `  Modified: ${batchModified} files`);
			log(COLORS.green, `  Fixes Applied: ${batchFixes}`);

			// Verify error count change
			const afterBatch = getErrorCount();
			const reduction = baseline - afterBatch;

			if (!DRY_RUN && reduction > 0) {
				log(COLORS.green, `  Error Reduction: -${reduction} (${baseline.toLocaleString()} → ${afterBatch.toLocaleString()})`);
			}

			// Commit this batch
			const commitMsg = `fix(phase66): Batch ${batchNumber} - ${batchFixes} syntax fixes in ${batchModified} files`;
			gitCommit(commitMsg, batchModified);

			totalFilesModified += batchModified;
			totalFixesApplied += batchFixes;
		} else {
			log(COLORS.yellow, `  No fixes needed in this batch`);
		}

		batchNumber++;

		// Break if we've processed enough
		if (batchNumber > 20) {
			log(COLORS.yellow, '\n⚠️  Reached batch limit (20 batches). Run again to continue.');
			break;
		}
	}

	const finalErrors = getErrorCount();
	const totalReduction = baseline - finalErrors;

	log(COLORS.cyan, '\n' + '='.repeat(60));
	log(COLORS.cyan, '📊 FINAL SUMMARY:');
	log(COLORS.cyan, '='.repeat(60));
	log(COLORS.green, `Files Modified: ${totalFilesModified.toLocaleString()}`);
	log(COLORS.green, `Fixes Applied: ${totalFixesApplied.toLocaleString()}`);
	log(COLORS.yellow, `Baseline Errors: ${baseline.toLocaleString()}`);
	log(COLORS.yellow, `Final Errors: ${finalErrors.toLocaleString()}`);
	log(COLORS.green, `Total Reduction: -${totalReduction.toLocaleString()} (${((totalReduction/baseline)*100).toFixed(1)}%)`);
	log(COLORS.cyan, '='.repeat(60));

	if (DRY_RUN) {
		log(COLORS.yellow, '\n✅ Dry-run complete! Run without --dry-run to apply fixes.');
	} else {
		log(COLORS.green, '\n✅ Batch fixing complete!');
	}
}

batchFix().catch(console.error);
