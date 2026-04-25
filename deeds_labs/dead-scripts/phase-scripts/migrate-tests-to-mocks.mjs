#!/usr/bin/env node
/**
 * Batch Test Migration Script
 * Automatically updates test files to use new mock infrastructure
 *
 * Usage:
 *   node scripts/migrate-tests-to-mocks.mjs --dry-run    # Preview changes
 *   node scripts/migrate-tests-to-mocks.mjs --apply      # Apply changes
 *   node scripts/migrate-tests-to-mocks.mjs --file path  # Migrate specific file
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldApply = args.includes('--apply');
const specificFile = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

// Migration patterns
const PATTERNS = {
	// Remove old fetch mocking
	oldFetchMock: /vi\.mock\(['"](node-)?fetch['"]\s*,\s*\(\)\s*=>\s*\{[\s\S]*?\}\);?/g,
	oldFetchImport: /import\s+\{[^}]*\}\s+from\s+['"](node-)?fetch['"];?\s*/g,

	// Detect manual fetch usage
	manualFetch: /const\s+\w+\s*=\s*await\s+fetch\(/g,
	globalFetchMock: /global\.fetch\s*=/g,

	// Import detection
	hasSetupImport: /import\s+\{[^}]*setupTest[^}]*\}\s+from\s+['"]\$lib\/test-utils\/setup['"]/,
	hasDescribe: /describe\(/,
	hasBeforeEach: /beforeEach\(/,
	hasAfterEach: /afterEach\(/,
};

// Import statement to add
const SETUP_IMPORT = `import { setupTest, cleanupTest, mockQdrant, mockRedis, mockOllama, mockPostgres, mockMinio } from '$lib/test-utils/setup';`;

// Lifecycle hooks to add
const LIFECYCLE_HOOKS = `
	beforeEach(async () => {
		await setupTest();
	});

	afterEach(async () => {
		await cleanupTest();
	});
`;

/**
 * Find all test files
 */
function findTestFiles(dir = join(ROOT_DIR, 'src')) {
	const files = [];

	function walk(currentDir) {
		const entries = readdirSync(currentDir);

		for (const entry of entries) {
			const fullPath = join(currentDir, entry);
			const stat = statSync(fullPath);

			if (stat.isDirectory()) {
				// Skip node_modules and build directories
				if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'build') {
					walk(fullPath);
				}
			} else if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) {
				files.push(fullPath);
			}
		}
	}

	walk(dir);
	return files;
}

/**
 * Analyze a test file
 */
function analyzeFile(filePath) {
	const content = readFileSync(filePath, 'utf-8');

	return {
		path: filePath,
		relativePath: relative(ROOT_DIR, filePath),
		hasOldFetchMock: PATTERNS.oldFetchMock.test(content),
		hasManualFetch: PATTERNS.manualFetch.test(content),
		hasGlobalFetchMock: PATTERNS.globalFetchMock.test(content),
		hasSetupImport: PATTERNS.hasSetupImport.test(content),
		hasDescribe: PATTERNS.hasDescribe.test(content),
		hasBeforeEach: PATTERNS.hasBeforeEach.test(content),
		hasAfterEach: PATTERNS.hasAfterEach.test(content),
		needsMigration: function() {
			return (this.hasOldFetchMock || this.hasManualFetch || this.hasGlobalFetchMock) && !this.hasSetupImport;
		}
	};
}

/**
 * Migrate a test file
 */
function migrateFile(filePath) {
	let content = readFileSync(filePath, 'utf-8');
	const analysis = analyzeFile(filePath);

	if (!analysis.needsMigration()) {
		return { migrated: false, reason: 'Already using new mocks or no mocking needed' };
	}

	const changes = [];

	// 1. Remove old fetch mocking
	if (analysis.hasOldFetchMock) {
		content = content.replace(PATTERNS.oldFetchMock, '');
		changes.push('Removed old fetch mock');
	}

	// 2. Remove fetch imports
	if (analysis.hasOldFetchImport) {
		content = content.replace(PATTERNS.oldFetchImport, '');
		changes.push('Removed fetch import');
	}

	// 3. Add setup import if not present
	if (!analysis.hasSetupImport) {
		// Find the last import statement
		const importMatches = [...content.matchAll(/^import\s+.*?;$/gm)];
		if (importMatches.length > 0) {
			const lastImport = importMatches[importMatches.length - 1];
			const insertPos = lastImport.index + lastImport[0].length;
			content = content.slice(0, insertPos) + '\n' + SETUP_IMPORT + content.slice(insertPos);
			changes.push('Added setup import');
		}
	}

	// 4. Add lifecycle hooks to first describe block
	if (analysis.hasDescribe && !analysis.hasBeforeEach) {
		// Find first describe block
		const describeMatch = content.match(/describe\([^{]+\{/);
		if (describeMatch) {
			const insertPos = describeMatch.index + describeMatch[0].length;
			content = content.slice(0, insertPos) + LIFECYCLE_HOOKS + content.slice(insertPos);
			changes.push('Added beforeEach/afterEach hooks');
		}
	}

	// 5. Replace manual fetch calls with mock usage comments
	if (analysis.hasManualFetch) {
		content = content.replace(
			/const\s+(\w+)\s*=\s*await\s+fetch\([^)]+\);?/g,
			'// TODO: Replace with mock - const $1 = await mockFetch(...);'
		);
		changes.push('Added TODO comments for manual fetch calls');
	}

	// 6. Remove global.fetch assignments
	if (analysis.hasGlobalFetchMock) {
		content = content.replace(/global\.fetch\s*=\s*[^;]+;?\s*/g, '');
		changes.push('Removed global.fetch assignments');
	}

	return { migrated: true, content, changes };
}

/**
 * Main execution
 */
async function main() {
	console.log('🔧 Test Migration Script\n');

	// Find test files
	const testFiles = specificFile ? [specificFile] : findTestFiles();
	console.log(`📁 Found ${testFiles.length} test files\n`);

	// Analyze files
	const analyses = testFiles.map(analyzeFile);
	const needsMigration = analyses.filter(a => a.needsMigration());

	console.log(`📊 Analysis Results:`);
	console.log(`   Total files: ${analyses.length}`);
	console.log(`   Need migration: ${needsMigration.length}`);
	console.log(`   Already migrated: ${analyses.length - needsMigration.length}\n`);

	if (needsMigration.length === 0) {
		console.log('✅ All test files are already migrated!');
		return;
	}

	// Show files needing migration
	console.log(`📋 Files Needing Migration:\n`);
	needsMigration.forEach((analysis, i) => {
		console.log(`   ${i + 1}. ${analysis.relativePath}`);
		if (analysis.hasOldFetchMock) console.log(`      - Has old fetch mock`);
		if (analysis.hasManualFetch) console.log(`      - Has manual fetch calls`);
		if (analysis.hasGlobalFetchMock) console.log(`      - Has global.fetch mock`);
	});
	console.log('');

	// Dry run or apply
	if (isDryRun || !shouldApply) {
		console.log('🔍 DRY RUN MODE - No files will be modified');
		console.log('   Run with --apply to make changes\n');

		// Show preview for first file
		if (needsMigration.length > 0) {
			const preview = migrateFile(needsMigration[0].path);
			console.log(`📄 Preview of ${needsMigration[0].relativePath}:\n`);
			console.log(`   Changes:`);
			preview.changes.forEach(c => console.log(`   - ${c}`));
		}

		return;
	}

	// Apply migrations
	console.log('🚀 Applying migrations...\n');

	const results = {
		success: 0,
		failed: 0,
		skipped: 0
	};

	for (const analysis of needsMigration) {
		try {
			const result = migrateFile(analysis.path);

			if (result.migrated) {
				writeFileSync(analysis.path, result.content, 'utf-8');
				console.log(`✅ ${analysis.relativePath}`);
				result.changes.forEach(c => console.log(`   - ${c}`));
				results.success++;
			} else {
				console.log(`⏭️  ${analysis.relativePath} - ${result.reason}`);
				results.skipped++;
			}
		} catch (error) {
			console.log(`❌ ${analysis.relativePath} - ${error.message}`);
			results.failed++;
		}
	}

	console.log(`\n📊 Migration Results:`);
	console.log(`   ✅ Success: ${results.success}`);
	console.log(`   ⏭️  Skipped: ${results.skipped}`);
	console.log(`   ❌ Failed: ${results.failed}`);

	if (results.success > 0) {
		console.log(`\n🧪 Next Steps:`);
		console.log(`   1. Review the migrated files`);
		console.log(`   2. Replace TODO comments with actual mock usage`);
		console.log(`   3. Run tests: npm run test:run`);
	}
}

main().catch(console.error);
