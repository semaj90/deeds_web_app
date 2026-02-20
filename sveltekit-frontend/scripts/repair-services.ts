#!/usr/bin/env npx tsx
/**
 * CLI runner for the syntax-repair tooling.
 *
 * Usage:
 *   npx tsx scripts/repair-services.ts --dry-run --verbose           # preview all fixes
 *   npx tsx scripts/repair-services.ts --dry-run --category function-call
 *   npx tsx scripts/repair-services.ts                                # apply all fixes (creates .backup files)
 *   npx tsx scripts/repair-services.ts --file src/lib/services/foo.ts # single file
 *   npx tsx scripts/repair-services.ts --strip-phantoms              # remove phantom DrizzleTypes imports
 *   npx tsx scripts/repair-services.ts --cleanup-backups             # remove all .backup files
 *   npx tsx scripts/repair-services.ts --validate                    # run svelte-check and report
 */

import { resolve, relative } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// Relative imports from the syntax-repair module
import {
	runMultiPassProcessor,
	runSinglePass,
	runCategoryRemediation,
	type MultiPassConfig,
} from '../src/lib/utils/syntax-repair/multi-pass-processor';
import { processFile, processFiles, cleanupBackups, type FileProcessorConfig } from '../src/lib/utils/syntax-repair/file-processor';
import { getAllPatterns, getPatternStats, type PatternCategory } from '../src/lib/utils/syntax-repair/patterns/index';
import { validateProject, validateSvelte, generateValidationReport } from '../src/lib/utils/syntax-repair/validation-engine';
import { createPattern, type PatternMatcher } from '../src/lib/utils/syntax-repair/pattern-matcher';

// ─── Configuration ───────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const SERVICES_DIR = resolve(PROJECT_ROOT, 'src/lib/services');

const VALID_CATEGORIES: PatternCategory[] = [
	'import-type',
	'function-param',
	'function-call',
	'object-literal',
	'nullish-coalescing',
	'bits-ui-migration',
	'a11y-label',
];

// ─── Phantom import stripper ─────────────────────────────────────────────────

/** Pattern that strips unused `import type { DrizzleTypes } from '...'` lines */
const phantomDrizzlePattern: PatternMatcher = createPattern(
	'phantom-drizzle-import',
	'Remove phantom DrizzleTypes import from enhanced-svelte5-types',
	/^import\s+type\s*\{\s*DrizzleTypes\s*\}\s*from\s*['"][^'"]*enhanced-svelte5-types['"];?\s*\n?/gm,
	'',
	{ priority: 1 }, // run first
);

/** Pattern that strips unused runtime imports from enhanced-svelte5-types */
const phantomRuntimePattern: PatternMatcher = createPattern(
	'phantom-runtime-import',
	'Remove phantom runtime imports from enhanced-svelte5-types',
	/^import\s*\{[^}]*\}\s*from\s*['"][^'"]*enhanced-svelte5-types['"];?\s*\n?/gm,
	'',
	{ priority: 1 },
);

// ─── CLI parsing ─────────────────────────────────────────────────────────────

function parseArgs() {
	const args = process.argv.slice(2);
	const flags = {
		dryRun: args.includes('--dry-run'),
		verbose: args.includes('--verbose'),
		stripPhantoms: args.includes('--strip-phantoms'),
		cleanupBackups: args.includes('--cleanup-backups'),
		validate: args.includes('--validate'),
		stats: args.includes('--stats'),
		help: args.includes('--help') || args.includes('-h'),
		file: '',
		category: '' as PatternCategory | '',
		maxPasses: 5,
		target: SERVICES_DIR,
	};

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--file' && args[i + 1]) flags.file = resolve(PROJECT_ROOT, args[++i]);
		if (args[i] === '--category' && args[i + 1]) flags.category = args[++i] as PatternCategory;
		if (args[i] === '--max-passes' && args[i + 1]) flags.maxPasses = parseInt(args[++i], 10);
		if (args[i] === '--target' && args[i + 1]) flags.target = resolve(PROJECT_ROOT, args[++i]);
	}

	return flags;
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function showHelp() {
	console.log(`
Syntax Repair CLI — Fix corrupted TypeScript/Svelte files

Usage:
  npx tsx scripts/repair-services.ts [options]

Options:
  --dry-run            Preview fixes without modifying files
  --verbose            Show detailed output per file
  --category <name>    Run only one pattern category:
                       ${VALID_CATEGORIES.join(', ')}
  --file <path>        Process a single file (relative to project root)
  --target <dir>       Target directory (default: src/lib/services)
  --max-passes <n>     Max processing passes (default: 5)
  --strip-phantoms     Remove phantom DrizzleTypes imports
  --cleanup-backups    Remove all .backup files in target directory
  --validate           Run svelte-check and show error report
  --stats              Show pattern statistics
  --help, -h           Show this help

Examples:
  npx tsx scripts/repair-services.ts --dry-run --verbose
  npx tsx scripts/repair-services.ts --strip-phantoms --dry-run
  npx tsx scripts/repair-services.ts --category function-call --dry-run
  npx tsx scripts/repair-services.ts --file src/lib/services/some-file.ts --dry-run
`);
}

async function showStats() {
	const stats = getPatternStats();
	console.log(`\nPattern Statistics:`);
	console.log(`  Total patterns: ${stats.totalPatterns}`);
	console.log(`\n  By category:`);
	for (const [cat, count] of Object.entries(stats.byCategory)) {
		console.log(`    ${cat}: ${count}`);
	}
	console.log();
}

async function runStripPhantoms(target: string, dryRun: boolean, verbose: boolean) {
	console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Stripping phantom imports from: ${relative(PROJECT_ROOT, target)}\n`);

	const patterns = [phantomDrizzlePattern, phantomRuntimePattern];
	const { processDirectory } = await import('../src/lib/utils/syntax-repair/file-processor');

	const result = await processDirectory(target, patterns, {
		dryRun,
		verbose,
		createBackups: !dryRun,
		fileExtensions: ['.ts', '.svelte', '.js'],
		excludeDirs: ['node_modules', '.svelte-kit', 'dist', 'build', '.git'],
	});

	console.log(`\nFiles scanned:  ${result.filesProcessed}`);
	console.log(`Files fixed:    ${result.filesFixed}`);
	console.log(`Total removals: ${result.totalFixes}`);
	if (result.failedFiles.length > 0) {
		console.log(`Failed files:   ${result.failedFiles.length}`);
		for (const f of result.failedFiles) {
			console.log(`  - ${relative(PROJECT_ROOT, f)}`);
		}
	}
	console.log(`Duration:       ${result.durationMs}ms`);
}

async function runValidation() {
	console.log('\nRunning svelte-check validation...\n');
	const result = await validateSvelte(PROJECT_ROOT);
	console.log(generateValidationReport(result));
}

async function runCleanup(target: string) {
	console.log(`\nCleaning up .backup files in ${relative(PROJECT_ROOT, target)}...`);
	const cleaned = await cleanupBackups(target);
	console.log(`Removed ${cleaned} backup files.`);
}

async function runSingleFile(filePath: string, dryRun: boolean, verbose: boolean, category: PatternCategory | '') {
	if (!existsSync(filePath)) {
		console.error(`File not found: ${filePath}`);
		process.exit(1);
	}

	const patterns = category
		? (await import('../src/lib/utils/syntax-repair/patterns/index')).getPatternsForCategory(category)
		: [...getAllPatterns(), phantomDrizzlePattern, phantomRuntimePattern];

	console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Processing: ${relative(PROJECT_ROOT, filePath)}`);
	console.log(`Patterns: ${patterns.length} (${category || 'all'})\n`);

	const result = await processFile(filePath, patterns, {
		dryRun,
		verbose,
		createBackups: !dryRun,
	});

	if (result.totalFixes > 0) {
		console.log(`  Fixes applied: ${result.totalFixes}`);
		for (const pr of result.patternResults) {
			if (pr.matchCount > 0) {
				console.log(`    ${pr.patternName}: ${pr.matchCount} matches, ${pr.replacementsMade} changed, ${pr.noopsSkipped} no-ops`);
			}
		}
	} else {
		const totalNoOps = result.patternResults.reduce((s, r) => s + r.noopsSkipped, 0);
		const totalMatches = result.patternResults.reduce((s, r) => s + r.matchCount, 0);
		if (totalMatches > 0) {
			console.log(`  No fixes needed (${totalMatches} matches, all ${totalNoOps} were no-ops).`);
		} else {
			console.log(`  No fixes needed.`);
		}
	}

	if (result.error) {
		console.error(`  Error: ${result.error}`);
	}
}

async function runFullRepair(target: string, flags: ReturnType<typeof parseArgs>) {
	const { dryRun, verbose, category, maxPasses } = flags;

	console.log(`\n${'═'.repeat(60)}`);
	console.log(`  Syntax Repair — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
	console.log(`${'═'.repeat(60)}`);
	console.log(`  Target:     ${relative(PROJECT_ROOT, target)}`);
	console.log(`  Category:   ${category || 'all'}`);
	console.log(`  Max passes: ${maxPasses}`);
	console.log(`  Backups:    ${dryRun ? 'no (dry run)' : 'yes'}`);
	console.log(`${'═'.repeat(60)}\n`);

	if (category) {
		if (!VALID_CATEGORIES.includes(category)) {
			console.error(`Invalid category: ${category}`);
			console.error(`Valid: ${VALID_CATEGORIES.join(', ')}`);
			process.exit(1);
		}

		const result = await runSinglePass(target, category, { dryRun, verbose, createBackups: !dryRun });
		console.log(`\nFiles scanned:  ${result.filesProcessed}`);
		console.log(`Files fixed:    ${result.filesFixed}`);
		console.log(`Total fixes:    ${result.totalFixes}`);
		console.log(`Duration:       ${result.durationMs}ms`);
	} else {
		// Include phantom stripping in the pattern set
		const result = await runMultiPassProcessor(target, {
			maxPasses,
			dryRun,
			verbose,
			createBackups: !dryRun,
			stopOnNoFixes: true,
			validateAfterPass: false,
			cwd: PROJECT_ROOT,
		});

		console.log(result.summary);

		// Also strip phantoms in a separate pass
		console.log('\n--- Phantom import cleanup ---');
		await runStripPhantoms(target, dryRun, verbose);
	}
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const flags = parseArgs();

	if (flags.help) return showHelp();
	if (flags.stats) return showStats();
	if (flags.validate) return runValidation();
	if (flags.cleanupBackups) return runCleanup(flags.target);
	if (flags.stripPhantoms) return runStripPhantoms(flags.target, flags.dryRun, flags.verbose);
	if (flags.file) return runSingleFile(flags.file, flags.dryRun, flags.verbose, flags.category);

	return runFullRepair(flags.target, flags);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
