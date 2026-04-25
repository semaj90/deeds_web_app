#!/usr/bin/env node
/**
 * Phase 80: ts-morph Automated Import Fixer
 *
 * Uses ts-morph to automatically fix missing imports and organize imports
 * across the codebase. Targets top error directories from stratification.
 *
 * User guidance:
 * - "ts-morph sourceFile.fixMissingImports() to add missing import declarations"
 * - "batch-process files: use ts-morph to detect missing imports and add them programmatically"
 *
 * Expected impact: -10,000+ errors (missing symbol cascades)
 */

import fs from 'fs/promises';
import path from 'path';
import { Project } from 'ts-morph';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Top broken directories from stratification (ordered by error count)
const TARGET_DIRS = [
	'src/lib/services',
	'src/lib/server',
	'src/lib/stores',
	'src/lib/types',
	'src/lib/components',
	'src/routes',
	'src/lib/machines',
	'src/lib/utils',
	'src/lib/integrations',
	'src/lib/ai.bak',
];

// Configuration
const config = {
	dryRun: process.argv.includes('--dry-run'),
	verbose: process.argv.includes('--verbose'),
	dirFilter: process.argv.find((arg) => arg.startsWith('--dir='))?.split('=')[1],
	maxFiles: parseInt(process.argv.find((arg) => arg.startsWith('--max='))?.split('=')[1] || '500'),
};

const stats = {
	filesProcessed: 0,
	filesFixed: 0,
	importsAdded: 0,
	importsOrganized: 0,
	errors: 0,
	startTime: Date.now(),
};

/**
 * Initialize ts-morph project with SvelteKit tsconfig
 */
function createProject() {
	console.log('🔧 Initializing ts-morph project...');

	const project = new Project({
		tsConfigFilePath: path.join(ROOT, 'tsconfig.json'),
		skipAddingFilesFromTsConfig: false,
		manipulationSettings: {
			indentationText: '\t',
			quoteKind: 1, // Single quotes
			useTrailingCommas: true,
		},
	});

	console.log(`✅ Loaded ${project.getSourceFiles().length} source files\n`);
	return project;
}

/**
 * Fix missing imports in a single file
 */
async function fixFile(sourceFile) {
	const filePath = sourceFile.getFilePath();
	const relativePath = path.relative(ROOT, filePath);

	stats.filesProcessed++;

	if (config.verbose) {
		console.log(`\n📄 Processing: ${relativePath}`);
	}

	try {
		// Get diagnostics before fixing
		const diagnosticsBefore = sourceFile.getPreEmitDiagnostics();
		const missingImportErrors = diagnosticsBefore.filter(
			(d) => d.getCode() === 2304 || // Cannot find name
			       d.getCode() === 2552 || // Cannot find namespace
			       d.getCode() === 2305    // Module has no exported member
		);

		if (missingImportErrors.length === 0) {
			if (config.verbose) {
				console.log('  ✓ No missing import errors');
			}
			return { fixed: false, importsAdded: 0 };
		}

		console.log(`  🔍 Found ${missingImportErrors.length} missing import errors`);

		// Attempt to fix missing imports
		const importsBefore = sourceFile.getImportDeclarations().length;

		// ts-morph's fixMissingImports() - auto-adds missing imports
		sourceFile.fixMissingImports();

		// Organize imports (remove duplicates, sort)
		sourceFile.organizeImports();

		const importsAfter = sourceFile.getImportDeclarations().length;
		const importsAdded = importsAfter - importsBefore;

		// Check if errors were actually fixed
		const diagnosticsAfter = sourceFile.getPreEmitDiagnostics();
		const missingImportErrorsAfter = diagnosticsAfter.filter(
			(d) => d.getCode() === 2304 || d.getCode() === 2552 || d.getCode() === 2305
		);

		const errorsFixed = missingImportErrors.length - missingImportErrorsAfter.length;

		if (importsAdded > 0 || errorsFixed > 0) {
			console.log(`  ✅ Fixed: +${importsAdded} imports, -${errorsFixed} errors`);

			if (!config.dryRun) {
				await sourceFile.save();
			}

			stats.filesFixed++;
			stats.importsAdded += importsAdded;
			stats.importsOrganized++;

			return { fixed: true, importsAdded, errorsFixed };
		} else {
			if (config.verbose) {
				console.log('  ⚠️  Could not auto-fix (may need manual import)');
			}
			return { fixed: false, importsAdded: 0 };
		}
	} catch (error) {
		console.error(`  ❌ Error processing ${relativePath}:`, error.message);
		stats.errors++;
		return { fixed: false, importsAdded: 0, error: error.message };
	}
}

/**
 * Process files in a directory
 */
async function processDirectory(project, dirPath) {
	const fullPath = path.join(ROOT, dirPath);

	try {
		await fs.access(fullPath);
	} catch {
		console.log(`⏭️  Skipping ${dirPath} (does not exist)`);
		return;
	}

	console.log(`\n📂 Processing directory: ${dirPath}`);
	console.log('━'.repeat(60));

	// Get all .ts and .svelte.ts files in directory (recursive)
	const sourceFiles = project
		.getSourceFiles()
		.filter((sf) => {
			const filePath = sf.getFilePath();
			return (
				filePath.startsWith(fullPath) &&
				(filePath.endsWith('.ts') || filePath.endsWith('.svelte.ts')) &&
				!filePath.includes('.d.ts') &&
				!filePath.includes('node_modules') &&
				!filePath.includes('.svelte-kit')
			);
		})
		.slice(0, config.maxFiles);

	console.log(`Found ${sourceFiles.length} TypeScript files\n`);

	const results = [];
	for (const sourceFile of sourceFiles) {
		if (stats.filesProcessed >= config.maxFiles) {
			console.log(`\n⏸️  Reached max files limit (${config.maxFiles})`);
			break;
		}

		const result = await fixFile(sourceFile);
		results.push(result);
	}

	const fixed = results.filter((r) => r.fixed).length;
	console.log(`\n📊 Directory summary: ${fixed}/${sourceFiles.length} files fixed`);
}

/**
 * Main execution
 */
async function main() {
	console.log('━'.repeat(60));
	console.log('🚀 Phase 80: ts-morph Automated Import Fixer');
	console.log('━'.repeat(60));
	console.log(`Mode: ${config.dryRun ? 'DRY RUN (no changes saved)' : 'LIVE (changes will be saved)'}`);
	console.log(`Max files: ${config.maxFiles}`);
	console.log(`Verbose: ${config.verbose}\n`);

	if (config.dirFilter) {
		console.log(`Filter: Only processing --dir=${config.dirFilter}\n`);
	}

	// Initialize project
	const project = createProject();

	// Process directories
	const dirsToProcess = config.dirFilter
		? [config.dirFilter.startsWith('src/') ? config.dirFilter : `src/lib/${config.dirFilter}`]
		: TARGET_DIRS;

	if (dirsToProcess.length === 0) {
		console.error(`❌ No directories match filter: ${config.dirFilter}`);
		process.exit(1);
	}

	console.log(`Will process: ${dirsToProcess.join(', ')}\n`);

	for (const dir of dirsToProcess) {
		await processDirectory(project, dir);
	}

	// Final summary
	const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);

	console.log('\n' + '━'.repeat(60));
	console.log('📊 Final Statistics');
	console.log('━'.repeat(60));
	console.log(`Files processed:     ${stats.filesProcessed}`);
	console.log(`Files fixed:         ${stats.filesFixed}`);
	console.log(`Imports added:       ${stats.importsAdded}`);
	console.log(`Imports organized:   ${stats.importsOrganized}`);
	console.log(`Errors encountered:  ${stats.errors}`);
	console.log(`Duration:            ${duration}s`);
	console.log('━'.repeat(60));

	if (config.dryRun) {
		console.log('\n⚠️  DRY RUN MODE - No changes were saved');
		console.log('Run without --dry-run to apply fixes\n');
	} else {
		console.log('\n✅ All changes saved!');
		console.log('Run svelte-check again to measure impact\n');
	}

	// Exit with error code if errors occurred
	process.exit(stats.errors > 0 ? 1 : 0);
}

// Usage instructions
if (process.argv.includes('--help')) {
	console.log(`
Usage: node scripts/phase80-ts-morph-fixer.mjs [options]

Options:
  --dry-run          Preview changes without saving
  --verbose          Show detailed processing logs
  --dir=<name>       Only process directories matching <name>
  --max=<number>     Maximum files to process (default: 500)
  --help             Show this help message

Examples:
  # Dry run on services directory
  node scripts/phase80-ts-morph-fixer.mjs --dry-run --dir=services --verbose

  # Fix all directories (limited to 500 files)
  node scripts/phase80-ts-morph-fixer.mjs

  # Fix specific directory with more files
  node scripts/phase80-ts-morph-fixer.mjs --dir=server --max=1000

Target directories (in priority order):
${TARGET_DIRS.map((d) => `  - ${d}`).join('\n')}
`);
	process.exit(0);
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
