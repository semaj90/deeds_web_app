#!/usr/bin/env node
/**
 * Route Audit Script
 *
 * Scans routes_parked/ and generates CSV report with:
 * - Route path
 * - Category (demo, test, duplicate, core)
 * - Status recommendation (keep, migrate, delete, merge)
 * - Dependencies (imports, APIs, components)
 * - Priority (1-5)
 *
 * Uses ripgrep for fast pattern matching
 */

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const ROUTES_PARKED = path.join(ROOT, 'src', 'routes_parked');

// ====================================
// Ripgrep Helper
// ====================================
function ripgrep(pattern, options = {}) {
	const {
		directory = ROUTES_PARKED,
		fileType = null,
		json = true,
		maxCount = null
	} = options;

	return new Promise((resolve, reject) => {
		const args = [];

		if (json) args.push('--json');
		args.push('-i'); // case-insensitive
		if (fileType) args.push('--type', fileType);
		if (maxCount) args.push('--max-count', String(maxCount));

		args.push(pattern, directory);

		const rg = spawn('rg', args, { shell: true });

		let stdout = '';
		let stderr = '';

		rg.stdout.on('data', (data) => stdout += data.toString());
		rg.stderr.on('data', (data) => stderr += data.toString());

		rg.on('close', (code) => {
			if (code === 0 || code === 1) { // 0 = matches, 1 = no matches
				if (json) {
					const matches = [];
					const lines = stdout.split('\n').filter(Boolean);
					for (const line of lines) {
						try {
							const parsed = JSON.parse(line);
							if (parsed.type === 'match') {
								matches.push({
									file: parsed.data.path.text,
									line: parsed.data.line_number,
									text: parsed.data.lines.text.trim()
								});
							}
						} catch {}
					}
					resolve(matches);
				} else {
					resolve(stdout.split('\n').filter(Boolean));
				}
			} else {
				reject(new Error(`ripgrep failed: ${stderr}`));
			}
		});
	});
}

// ====================================
// Analysis Functions
// ====================================

async function findRouteDirectories() {
	const { readdirSync, statSync } = await import('fs');
	const dirs = [];

	const entries = readdirSync(ROUTES_PARKED);
	for (const entry of entries) {
		const fullPath = path.join(ROUTES_PARKED, entry);
		if (statSync(fullPath).isDirectory()) {
			dirs.push(entry);
		}
	}

	return dirs;
}

async function categorizeRoute(routeName) {
	// Disabled by convention
	if (routeName.endsWith('_disabled')) {
		return { category: 'disabled', status: 'delete', priority: 5 };
	}

	// Archives
	if (routeName.startsWith('_archive-') || routeName.startsWith('_yorha_legacy')) {
		return { category: 'archive', status: 'delete', priority: 5 };
	}

	// Old/backup
	if (routeName.endsWith('.old') || routeName.endsWith('.bak')) {
		return { category: 'backup', status: 'delete', priority: 5 };
	}

	// Demos
	const demoKeywords = ['demo', 'showcase', 'example', 'field-demo', 'icon-demo', 'mcp-demo', 'nier', 'trt-llm'];
	if (demoKeywords.some(kw => routeName.toLowerCase().includes(kw))) {
		return { category: 'demo', status: 'delete', priority: 4 };
	}

	// Tests
	const testKeywords = ['test', '-test', 'simple-upload'];
	if (testKeywords.some(kw => routeName.toLowerCase().includes(kw))) {
		return { category: 'test', status: 'migrate', priority: 3, notes: 'Extract tests to src/tests/' };
	}

	// Potential core features
	const coreKeywords = {
		'evidence-board': { priority: 1, notes: 'Merge into Visual Evidence Board' },
		'evidenceboard': { priority: 1, notes: 'Merge into Visual Evidence Board' },
		'interactive-canvas': { priority: 1, notes: 'Merge into Board Engine' },
		'memory-palace': { priority: 1, notes: 'Implement as knowledge/palace/' },
		'graph-mode': { priority: 1, notes: 'Merge into knowledge/graph/' },
		'investigation': { priority: 2, notes: 'Merge into investigate/' },
		'detective': { priority: 2, notes: 'Merge into investigate/' },
		'legal-report-compare': { priority: 2, notes: 'Merge into legal/compare/' }
	};

	for (const [keyword, config] of Object.entries(coreKeywords)) {
		if (routeName.toLowerCase().includes(keyword)) {
			return { category: 'core', status: 'migrate', ...config };
		}
	}

	// Duplicates (need deeper analysis)
	const duplicateGroups = {
		'chat': ['chat-standalone', 'phase72-chat', 'aichat'],
		'search': ['search-main', 'search-standalone', 'search.bak'],
		'yorha': ['yorha', 'yorha-detective', '_yorha_legacy'],
		'legal-ai': ['legal-ai', 'legal-ai-suite'],
		'terminal': ['terminal.old', 'terminal_disabled']
	};

	for (const [group, variants] of Object.entries(duplicateGroups)) {
		if (variants.includes(routeName)) {
			return { category: 'duplicate', status: 'merge', priority: 3, notes: `Duplicate of ${group}` };
		}
	}

	return { category: 'unknown', status: 'review', priority: 3 };
}

async function analyzeDependencies(routePath) {
	const dependencies = {
		imports: [],
		apis: [],
		components: [],
		svelte5: false,
		hasTests: false
	};

	try {
		// Find imports
		const imports = await ripgrep(`import.*from.*\\$lib`, {
			directory: routePath,
			fileType: 'svelte'
		});
		dependencies.imports = [...new Set(imports.map(m => {
			const match = m.text.match(/from ['"](\$lib\/[^'"]+)['"]/);
			return match ? match[1] : null;
		}).filter(Boolean))];

		// Find API calls
		const apiCalls = await ripgrep(`fetch\\(/api/`, {
			directory: routePath,
			fileType: 'svelte'
		});
		dependencies.apis = [...new Set(apiCalls.map(m => {
			const match = m.text.match(/fetch\(['"]\/api\/([^'"]+)['"]/);
			return match ? match[1] : null;
		}).filter(Boolean))];

		// Check Svelte 5 runes
		const runes = await ripgrep(`\\$state|\\$derived|\\$effect`, {
			directory: routePath,
			fileType: 'svelte'
		});
		dependencies.svelte5 = runes.length > 0;

		// Check for tests
		const tests = await ripgrep(`describe\\(|test\\(|it\\(`, {
			directory: routePath
		});
		dependencies.hasTests = tests.length > 0;

	} catch (err) {
		// Route might not exist or be empty
	}

	return dependencies;
}

// ====================================
// Main Audit
// ====================================

async function auditRoutes() {
	console.log('🔍 Starting Route Audit...\n');
	console.log(`Scanning: ${ROUTES_PARKED}\n`);

	const routes = await findRouteDirectories();
	console.log(`Found ${routes.length} routes\n`);

	const results = [];

	for (const route of routes) {
		console.log(`📂 Analyzing: ${route}`);

		const routePath = path.join(ROUTES_PARKED, route);
		const { category, status, priority, notes } = await categorizeRoute(route);
		const dependencies = await analyzeDependencies(routePath);

		results.push({
			route,
			category,
			status,
			priority,
			importCount: dependencies.imports.length,
			apiCount: dependencies.apis.length,
			svelte5: dependencies.svelte5 ? 'yes' : 'no',
			hasTests: dependencies.hasTests ? 'yes' : 'no',
			notes: notes || ''
		});
	}

	// Generate CSV
	console.log('\n📊 Generating CSV report...');

	const header = 'Route,Category,Status,Priority,Imports,APIs,Svelte5,HasTests,Notes\n';
	const rows = results.map(r =>
		`"${r.route}",${r.category},${r.status},${r.priority},${r.importCount},${r.apiCount},${r.svelte5},${r.hasTests},"${r.notes}"`
	).join('\n');

	const csv = header + rows;
	const outputPath = path.join(ROOT, 'reports', 'route-audit.csv');

	writeFileSync(outputPath, csv);
	console.log(`✅ Report saved: ${outputPath}\n`);

	// Summary
	const summary = {
		total: results.length,
		delete: results.filter(r => r.status === 'delete').length,
		migrate: results.filter(r => r.status === 'migrate').length,
		merge: results.filter(r => r.status === 'merge').length,
		review: results.filter(r => r.status === 'review').length,
		core: results.filter(r => r.category === 'core').length,
		demo: results.filter(r => r.category === 'demo').length,
		test: results.filter(r => r.category === 'test').length,
		svelte5Ready: results.filter(r => r.svelte5 === 'yes').length
	};

	console.log('📈 Summary:');
	console.log(`   Total routes: ${summary.total}`);
	console.log(`   ❌ Delete: ${summary.delete}`);
	console.log(`   🔄 Migrate: ${summary.migrate}`);
	console.log(`   🔀 Merge: ${summary.merge}`);
	console.log(`   👀 Review: ${summary.review}`);
	console.log(`   ⭐ Core features: ${summary.core}`);
	console.log(`   🎭 Demos: ${summary.demo}`);
	console.log(`   🧪 Tests: ${summary.test}`);
	console.log(`   ✨ Svelte 5 ready: ${summary.svelte5Ready}`);

	// Recommendations
	console.log('\n💡 Recommendations:');
	console.log(`   1. Delete ${summary.delete} routes immediately (disabled, archives, backups)`);
	console.log(`   2. Migrate ${summary.core} core features to new structure`);
	console.log(`   3. Extract tests from ${summary.test} test routes`);
	console.log(`   4. Review ${summary.review} unknown routes manually`);

	return results;
}

// ====================================
// Run
// ====================================

auditRoutes().catch(console.error);
