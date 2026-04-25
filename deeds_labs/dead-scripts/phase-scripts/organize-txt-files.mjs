#!/usr/bin/env node
/**
 * Organize .txt Files Script
 * Moves all .txt files to organized directories under docs/txt
 *
 * Usage:
 *   node scripts/organize-txt-files.mjs --dry-run    # Preview moves
 *   node scripts/organize-txt-files.mjs --apply      # Apply moves
 */

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const WORKSPACE_ROOT = join(ROOT_DIR, '..');
const DOCS_TXT_DIR = join(WORKSPACE_ROOT, 'docs', 'txt');

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--apply');

// Categorization rules
const CATEGORIES = {
	'error-logs': [
		/error.*\.txt$/i,
		/tsc.*\.txt$/i,
		/svelte-check.*\.txt$/i,
		/.*-errors.*\.txt$/i,
		/npm.*log.*\.txt$/i,
		/.*-output\.txt$/i
	],
	'phase-summaries': [
		/PHASE\d+.*\.txt$/i,
		/phase\d+.*\.txt$/i,
		/SESSION.*\.txt$/i,
		/SUMMARY.*\.txt$/i,
		/COMPLETE.*\.txt$/i,
		/STATUS.*\.txt$/i
	],
	'analysis': [
		/.*-analysis.*\.txt$/i,
		/top-.*\.txt$/i,
		/normalized-.*\.txt$/i,
		/template-.*\.txt$/i,
		/files_to_fix\.txt$/i
	],
	'test-uploads': [
		/test-.*\.txt$/i,
		/uploads\/.*\.txt$/i
	]
};

/**
 * Find all .txt files
 */
function findTxtFiles(dir = ROOT_DIR, excludeDirs = ['node_modules', 'build', '.svelte-kit', '.git', 'docs']) {
	const files = [];

	function walk(currentDir) {
		try {
			const entries = readdirSync(currentDir);

			for (const entry of entries) {
				const fullPath = join(currentDir, entry);

				// Skip excluded directories
				if (excludeDirs.some(excluded => fullPath.includes(excluded))) {
					continue;
				}

				try {
					const stat = statSync(fullPath);

					if (stat.isDirectory()) {
						walk(fullPath);
					} else if (entry.endsWith('.txt')) {
						files.push(fullPath);
					}
				} catch (err) {
					// Skip files we can't access
					continue;
				}
			}
		} catch (err) {
			// Skip directories we can't access
			return;
		}
	}

	walk(dir);
	return files;
}

/**
 * Categorize a .txt file
 */
function categorizeFile(filePath) {
	const fileName = basename(filePath);

	// Check each category
	for (const [category, patterns] of Object.entries(CATEGORIES)) {
		for (const pattern of patterns) {
			if (pattern.test(fileName) || pattern.test(filePath)) {
				return category;
			}
		}
	}

	// Default category
	return 'analysis';
}

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

/**
 * Main execution
 */
async function main() {
	console.log('📁 Organize .txt Files Script\n');

	if (isDryRun) {
		console.log('🔍 DRY RUN MODE - No files will be moved');
		console.log('   Run with --apply to make changes\n');
	}

	// Find all .txt files
	const txtFiles = findTxtFiles();
	console.log(`📊 Found ${txtFiles.length} .txt files\n`);

	if (txtFiles.length === 0) {
		console.log('✅ No .txt files to organize!');
		return;
	}

	// Categorize files
	const categorized = {};
	for (const file of txtFiles) {
		const category = categorizeFile(file);
		if (!categorized[category]) {
			categorized[category] = [];
		}
		categorized[category].push(file);
	}

	// Show categorization
	console.log('📋 Categorization:\n');
	for (const [category, files] of Object.entries(categorized)) {
		console.log(`   ${category} (${files.length} files)`);
	}
	console.log('');

	// Move files
	const results = {
		moved: 0,
		skipped: 0,
		failed: 0
	};

	for (const [category, files] of Object.entries(categorized)) {
		const targetDir = join(DOCS_TXT_DIR, category);

		if (!isDryRun) {
			ensureDir(targetDir);
		}

		console.log(`\n📂 ${category}/`);

		for (const file of files) {
			const fileName = basename(file);
			const targetPath = join(targetDir, fileName);
			const relativeSource = relative(WORKSPACE_ROOT, file);
			const relativeTarget = relative(WORKSPACE_ROOT, targetPath);

			try {
				if (isDryRun) {
					console.log(`   📄 ${relativeSource}`);
					console.log(`      → ${relativeTarget}`);
					results.moved++;
				} else {
					// Check if target exists
					if (existsSync(targetPath)) {
						console.log(`   ⏭️  ${fileName} (already exists)`);
						results.skipped++;
					} else {
						renameSync(file, targetPath);
						console.log(`   ✅ ${fileName}`);
						results.moved++;
					}
				}
			} catch (error) {
				console.log(`   ❌ ${fileName} - ${error.message}`);
				results.failed++;
			}
		}
	}

	console.log(`\n📊 Results:`);
	console.log(`   ${isDryRun ? '📄 Would move' : '✅ Moved'}: ${results.moved}`);
	if (results.skipped > 0) console.log(`   ⏭️  Skipped: ${results.skipped}`);
	if (results.failed > 0) console.log(`   ❌ Failed: ${results.failed}`);

	if (isDryRun) {
		console.log(`\n🚀 Run with --apply to move files`);
	} else {
		console.log(`\n✅ Files organized in docs/txt/`);
		console.log(`   These files will now be tracked by Git`);
	}
}

main().catch(console.error);
