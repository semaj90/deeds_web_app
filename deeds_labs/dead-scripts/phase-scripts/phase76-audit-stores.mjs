#!/usr/bin/env node
/**
 * Phase 76: Store Audit Tool
 * Scans all store files and generates migration priority report
 *
 * Usage:
 *   node scripts/phase76-audit-stores.mjs
 *
 * Output:
 *   - Console summary
 *   - reports/phase76-store-audit.json (machine-readable)
 *   - reports/phase76-store-audit.md (human-readable)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const STORES_DIR = path.join(ROOT, 'src', 'lib', 'stores');
const REPORTS_DIR = path.join(ROOT, 'reports');

// ANSI colors
const c = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
	console.log(`${c[color]}${msg}${c.reset}`);
}

/**
 * Recursively find all .ts files in stores directory
 */
async function findStoreFiles(dir) {
	const files = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...await findStoreFiles(fullPath));
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * Analyze single store file
 */
async function analyzeStoreFile(filePath) {
	const content = await fs.readFile(filePath, 'utf-8');
	const relativePath = path.relative(ROOT, filePath);
	const lines = content.split('\n').length;

	const analysis = {
		path: relativePath,
		absolutePath: filePath,
		lines,
		isSvelte5: filePath.endsWith('.svelte.ts'),
		hasStoreImports: false,
		writableCount: 0,
		derivedCount: 0,
		readableCount: 0,
		functionCount: 0,
		importCount: 0,
		complexity: 0,
		priority: 0,
		dependencies: [],
		exports: []
	};

	// Check for svelte/store imports
	if (content.includes("from 'svelte/store'")) {
		analysis.hasStoreImports = true;
	}

	// Count writable stores
	analysis.writableCount = (content.match(/writable</g) || []).length;

	// Count derived stores
	analysis.derivedCount = (content.match(/derived\(/g) || []).length;

	// Count readable stores
	analysis.readableCount = (content.match(/readable</g) || []).length;

	// Count exported functions
	analysis.functionCount = (content.match(/export\s+(?:async\s+)?function/g) || []).length;

	// Count imports
	analysis.importCount = (content.match(/^import/gm) || []).length;

	// Extract dependencies (rough approximation)
	const importMatches = content.matchAll(/import.*from\s+['"]([^'"]+)['"]/g);
	for (const match of importMatches) {
		if (match[1].startsWith('$lib') || match[1].startsWith('.')) {
			analysis.dependencies.push(match[1]);
		}
	}

	// Extract exports
	const exportMatches = content.matchAll(/export\s+(?:const|function|class|interface)\s+(\w+)/g);
	for (const match of exportMatches) {
		analysis.exports.push(match[1]);
	}

	// Calculate complexity score (higher = more complex = lower priority for auto-migration)
	analysis.complexity =
		analysis.lines +
		(analysis.writableCount * 10) +
		(analysis.derivedCount * 15) +
		(analysis.functionCount * 20) +
		(analysis.dependencies.length * 5);

	// Calculate priority (higher = should migrate first)
	if (analysis.isSvelte5) {
		analysis.priority = 0; // Already migrated
	} else if (!analysis.hasStoreImports) {
		analysis.priority = 0; // Not a store file
	} else {
		// Priority factors:
		// - Simple files (low complexity) = higher priority
		// - High usage (many exports) = higher priority
		// - Few dependencies = higher priority
		const simplicity = Math.max(0, 1000 - analysis.complexity);
		const usageScore = analysis.exports.length * 50;
		const independenceScore = Math.max(0, 100 - (analysis.dependencies.length * 10));

		analysis.priority = simplicity + usageScore + independenceScore;
	}

	return analysis;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(results) {
	const migrationNeeded = results.filter(r => r.priority > 0);
	const alreadyMigrated = results.filter(r => r.isSvelte5);
	const notStores = results.filter(r => !r.hasStoreImports && !r.isSvelte5);

	let md = `# Phase 76: Store Audit Report

**Generated**: ${new Date().toLocaleString()}
**Total Files**: ${results.length}
**Migration Needed**: ${migrationNeeded.length}
**Already Migrated**: ${alreadyMigrated.length}
**Non-Store Files**: ${notStores.length}

---

## 📊 Summary

| Category | Count | Percentage |
|----------|-------|------------|
| ✅ **Svelte 5 Stores** | ${alreadyMigrated.length} | ${((alreadyMigrated.length / results.length) * 100).toFixed(1)}% |
| 🔴 **Needs Migration** | ${migrationNeeded.length} | ${((migrationNeeded.length / results.length) * 100).toFixed(1)}% |
| ⚪ **Not Stores** | ${notStores.length} | ${((notStores.length / results.length) * 100).toFixed(1)}% |

---

## 🎯 Migration Priority Queue

*Sorted by priority score (higher = migrate first)*

`;

	migrationNeeded.sort((a, b) => b.priority - a.priority);

	for (let i = 0; i < migrationNeeded.length; i++) {
		const store = migrationNeeded[i];
		const rank = i + 1;
		const emoji = rank <= 3 ? '🥇' : rank <= 10 ? '🥈' : '🥉';

		md += `### ${emoji} ${rank}. \`${store.path}\`

**Priority Score**: ${store.priority}
**Complexity**: ${store.complexity} (${store.lines} lines)
**Stores**: ${store.writableCount} writable, ${store.derivedCount} derived
**Functions**: ${store.functionCount}
**Exports**: ${store.exports.length} (${store.exports.join(', ')})
**Dependencies**: ${store.dependencies.length}

**Migration Command**:
\`\`\`bash
node scripts/phase76-migrate-store.mjs ${store.path}
\`\`\`

---

`;
	}

	md += `## ✅ Already Migrated (Svelte 5)

`;

	for (const store of alreadyMigrated) {
		md += `- ✅ \`${store.path}\` (${store.lines} lines, ${store.exports.length} exports)\n`;
	}

	md += `\n---\n\n## 📋 Detailed Analysis\n\n`;
	md += `| File | Lines | Writable | Derived | Functions | Priority |\n`;
	md += `|------|-------|----------|---------|-----------|----------|\n`;

	for (const store of migrationNeeded) {
		md += `| \`${store.path}\` | ${store.lines} | ${store.writableCount} | ${store.derivedCount} | ${store.functionCount} | ${store.priority} |\n`;
	}

	md += `\n---\n\n## 🔧 Automation\n\n`;
	md += `### Migrate Top 5 Stores\n\n`;
	md += `\`\`\`bash\n`;
	for (let i = 0; i < Math.min(5, migrationNeeded.length); i++) {
		md += `node scripts/phase76-migrate-store.mjs ${migrationNeeded[i].path}\n`;
	}
	md += `\`\`\`\n\n`;

	md += `### Migrate All Stores (Batch)\n\n`;
	md += `\`\`\`bash\n`;
	md += `for file in ${migrationNeeded.map(s => s.path).join(' ')}; do\n`;
	md += `  node scripts/phase76-migrate-store.mjs "$file"\n`;
	md += `done\n`;
	md += `\`\`\`\n`;

	return md;
}

/**
 * Main audit function
 */
async function auditStores() {
	log('\n🔍 Phase 76: Store Audit\n', 'bright');

	// Find all store files
	log(`📁 Scanning: ${STORES_DIR}`, 'cyan');
	const storeFiles = await findStoreFiles(STORES_DIR);
	log(`   Found ${storeFiles.length} store files\n`, 'green');

	// Analyze each file
	log(`🔬 Analyzing stores...`, 'yellow');
	const results = [];

	for (const filePath of storeFiles) {
		const analysis = await analyzeStoreFile(filePath);
		results.push(analysis);

		const status = analysis.isSvelte5
			? c.green + '✅ Svelte 5'
			: analysis.priority > 0
				? c.red + '🔴 Needs Migration'
				: c.reset + '⚪ Not a store';

		log(`   ${status}${c.reset} - ${path.basename(filePath)}`, 'reset');
	}

	// Sort by priority
	results.sort((a, b) => b.priority - a.priority);

	// Calculate stats
	const migrationNeeded = results.filter(r => r.priority > 0);
	const alreadyMigrated = results.filter(r => r.isSvelte5);
	const totalStores = results.filter(r => r.hasStoreImports || r.isSvelte5);

	// Print summary
	log(`\n📊 Summary:\n`, 'bright');
	log(`   Total files:        ${results.length}`, 'cyan');
	log(`   Store files:        ${totalStores.length}`, 'blue');
	log(`   ✅ Svelte 5:        ${alreadyMigrated.length}`, 'green');
	log(`   🔴 Needs migration: ${migrationNeeded.length}`, 'red');
	log(`   Progress:           ${((alreadyMigrated.length / totalStores.length) * 100).toFixed(1)}%`, 'yellow');

	// Top 5 priority
	log(`\n🎯 Top 5 Migration Priorities:\n`, 'magenta');
	for (let i = 0; i < Math.min(5, migrationNeeded.length); i++) {
		const store = migrationNeeded[i];
		log(`   ${i + 1}. ${path.basename(store.path)} (priority: ${store.priority})`, 'cyan');
		log(`      ${store.writableCount} writable, ${store.derivedCount} derived, ${store.functionCount} functions`, 'reset');
	}

	// Create reports directory
	await fs.mkdir(REPORTS_DIR, { recursive: true });

	// Write JSON report
	const jsonPath = path.join(REPORTS_DIR, 'phase76-store-audit.json');
	await fs.writeFile(jsonPath, JSON.stringify({
		generatedAt: new Date().toISOString(),
		totalFiles: results.length,
		migrationNeeded: migrationNeeded.length,
		alreadyMigrated: alreadyMigrated.length,
		progress: (alreadyMigrated.length / totalStores.length) * 100,
		stores: results
	}, null, 2), 'utf-8');

	log(`\n💾 JSON report: ${jsonPath}`, 'blue');

	// Write Markdown report
	const mdPath = path.join(REPORTS_DIR, 'phase76-store-audit.md');
	const markdown = generateMarkdownReport(results);
	await fs.writeFile(mdPath, markdown, 'utf-8');

	log(`📄 Markdown report: ${mdPath}`, 'blue');

	// Next steps
	log(`\n🚀 Next Steps:\n`, 'yellow');
	log(`   1. Review: ${mdPath}`, 'reset');
	log(`   2. Migrate top priority:`, 'reset');
	if (migrationNeeded.length > 0) {
		log(`      node scripts/phase76-migrate-store.mjs ${migrationNeeded[0].path}`, 'cyan');
	}
	log(`   3. Test: npm run phase76:test\n`, 'reset');
}

// Run audit
auditStores().catch(error => {
	log(`\n❌ Audit failed: ${error.message}`, 'red');
	console.error(error);
	process.exit(1);
});
