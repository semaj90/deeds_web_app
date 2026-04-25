#!/usr/bin/env node
/**
 * Phase 80: Simple ts-morph Import Fixer
 *
 * Processes files directly without tsconfig to avoid loading issues.
 * Fixes missing imports using ts-morph's fixMissingImports().
 */

import { glob } from 'glob';
import path from 'path';
import { Project } from 'ts-morph';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const config = {
	dryRun: process.argv.includes('--dry-run'),
	pattern: process.argv.find(arg => arg.startsWith('--pattern='))?.split('=')[1] || 'src/lib/services/**/*.ts',
	maxFiles: parseInt(process.argv.find(arg => arg.startsWith('--max='))?.split('=')[1] || '100'),
};

const stats = {
	processed: 0,
	fixed: 0,
	importsAdded: 0,
	errors: 0,
};

async function main() {
	console.log('━'.repeat(60));
	console.log('🚀 Phase 80: Simple ts-morph Import Fixer');
	console.log('━'.repeat(60));
	console.log(`Pattern: ${config.pattern}`);
	console.log(`Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE'}`);
	console.log(`Max files: ${config.maxFiles}\n`);

	// Find files
	const files = await glob(config.pattern, {
		cwd: ROOT,
		ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/*.d.ts'],
		absolute: true,
	});

	console.log(`Found ${files.length} files\n`);

	// Create project without tsconfig
	const project = new Project({
		compilerOptions: {
			target: 99, // ESNext
			module: 99, // ESNext
			moduleResolution: 2, // Node
			allowJs: true,
			checkJs: false,
			strict: false,
		},
	});

	// Process each file
	const filesToProcess = files.slice(0, config.maxFiles);

	for (const filePath of filesToProcess) {
		stats.processed++;
		const relativePath = path.relative(ROOT, filePath);

		try {
			const sourceFile = project.addSourceFileAtPath(filePath);
			const importsBefore = sourceFile.getImportDeclarations().length;

			// Fix missing imports
			sourceFile.fixMissingImports();
			sourceFile.organizeImports();

			const importsAfter = sourceFile.getImportDeclarations().length;
			const added = importsAfter - importsBefore;

			if (added > 0) {
				console.log(`✅ ${relativePath}: +${added} imports`);
				stats.fixed++;
				stats.importsAdded += added;

				if (!config.dryRun) {
					await sourceFile.save();
				}
			}
		} catch (error) {
			console.error(`❌ ${relativePath}: ${error.message}`);
			stats.errors++;
		}
	}

	// Summary
	console.log('\n' + '━'.repeat(60));
	console.log('📊 Summary');
	console.log('━'.repeat(60));
	console.log(`Files processed: ${stats.processed}`);
	console.log(`Files fixed: ${stats.fixed}`);
	console.log(`Imports added: ${stats.importsAdded}`);
	console.log(`Errors: ${stats.errors}`);
	console.log('━'.repeat(60));

	if (config.dryRun) {
		console.log('\n⚠️  DRY RUN - No changes saved');
	}
}

main().catch(console.error);
