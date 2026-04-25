#!/usr/bin/env node
/**
 * Phase 74: Complete Route Inventory & Analysis
 *
 * Lists ALL routes without deleting anything
 * Identifies:
 * - Active routes (src/routes/)
 * - Parked routes (src/routes__parked/)
 * - Duplicate routes
 * - Missing imports
 * - Test coverage
 * - API endpoint alignment
 */

import chalk from 'chalk';
import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

console.log(chalk.cyan.bold('📋 Phase 74: Complete Route Inventory\n'));

const inventory = {
	active: [],
	parked: [],
	duplicates: [],
	missingImports: [],
	tests: [],
	apis: []
};

/**
 * Discover all routes
 */
async function discoverRoutes() {
	console.log(chalk.yellow('📍 Step 1: Discovering All Routes\n'));

	// Active routes
	const activePatterns = [
		'src/routes/**/+page.svelte',
		'src/routes/**/+page.ts',
		'src/routes/**/+page.server.ts',
		'src/routes/**/+layout.svelte',
		'src/routes/**/+layout.ts',
		'src/routes/**/+layout.server.ts',
		'src/routes/**/+server.ts',
		'src/routes/**/+error.svelte'
	];

	for (const pattern of activePatterns) {
		const files = await glob(pattern, { cwd: rootDir });
		files.forEach(file => {
			const routePath = extractRoutePath(file);
			const type = extractRouteType(file);
			inventory.active.push({
				file: file.replace(/\\/g, '/'),
				path: routePath,
				type,
				status: 'active',
				exists: fs.existsSync(path.join(rootDir, file)),
				size: fs.existsSync(path.join(rootDir, file))
					? fs.statSync(path.join(rootDir, file)).size
					: 0
			});
		});
	}

	// Parked routes
	const parkedPatterns = [
		'src/routes__parked/**/*.svelte',
		'src/routes__parked/**/*.ts'
	];

	for (const pattern of parkedPatterns) {
		const files = await glob(pattern, { cwd: rootDir });
		files.forEach(file => {
			inventory.parked.push({
				file: file.replace(/\\/g, '/'),
				path: file.replace('src/routes__parked/', '/'),
				status: 'parked',
				exists: true,
				size: fs.statSync(path.join(rootDir, file)).size
			});
		});
	}

	console.log(chalk.green(`  ✅ Found ${inventory.active.length} active routes`));
	console.log(chalk.yellow(`  ⏸️  Found ${inventory.parked.length} parked routes\n`));
}

/**
 * Find duplicate routes
 */
function findDuplicates() {
	console.log(chalk.yellow('📍 Step 2: Detecting Duplicates\n'));

	const routePaths = new Map();

	// Check active routes
	inventory.active.forEach(route => {
		if (!routePaths.has(route.path)) {
			routePaths.set(route.path, []);
		}
		routePaths.get(route.path).push({ ...route, location: 'active' });
	});

	// Check parked routes for duplicates
	inventory.parked.forEach(route => {
		const cleanPath = route.path.replace(/\\/g, '/');
		if (routePaths.has(cleanPath)) {
			routePaths.get(cleanPath).push({ ...route, location: 'parked' });
		}
	});

	// Find actual duplicates
	routePaths.forEach((routes, path) => {
		if (routes.length > 1) {
			inventory.duplicates.push({
				path,
				routes: routes.map(r => ({
					file: r.file,
					location: r.location,
					size: r.size
				}))
			});
		}
	});

	console.log(chalk.green(`  ✅ Found ${inventory.duplicates.length} duplicate route paths\n`));
}

/**
 * Check for missing imports
 */
async function checkMissingImports() {
	console.log(chalk.yellow('📍 Step 3: Checking Missing Imports\n'));

	const importChecks = [];

	for (const route of inventory.active.slice(0, 50)) { // Sample 50 routes
		if (!route.exists) continue;

		try {
			const content = fs.readFileSync(path.join(rootDir, route.file), 'utf-8');

			// Check for common missing imports
			const missingImports = [];

			if (content.includes('$lib/') || content.includes('from "$lib')) {
				const libImports = content.match(/from ['"](\$lib\/[^'"]+)['"]/g) || [];
				libImports.forEach(imp => {
					const libPath = imp.match(/\$lib\/([^'"]+)/)[1];
					const fullPath = path.join(rootDir, 'src/lib', libPath);

					// Check if file exists with common extensions
					const exists = ['.ts', '.js', '.svelte', '/index.ts', '/index.js'].some(ext =>
						fs.existsSync(fullPath + ext)
					);

					if (!exists) {
						missingImports.push(libPath);
					}
				});
			}

			if (missingImports.length > 0) {
				inventory.missingImports.push({
					file: route.file,
					missing: missingImports
				});
			}

		} catch (error) {
			// Skip files that can't be read
		}
	}

	console.log(chalk.green(`  ✅ Found ${inventory.missingImports.length} files with missing imports\n`));
}

/**
 * Discover API endpoints
 */
async function discoverAPIs() {
	console.log(chalk.yellow('📍 Step 4: Discovering API Endpoints\n'));

	const apiFiles = await glob('src/routes/api/**/+server.ts', { cwd: rootDir });

	apiFiles.forEach(file => {
		const apiPath = extractApiPath(file);
		const methods = extractApiMethods(path.join(rootDir, file));
		const tested = checkIfTested(file);

		inventory.apis.push({
			file: file.replace(/\\/g, '/'),
			path: apiPath,
			methods,
			tested,
			hasErrorHandling: hasErrorHandling(path.join(rootDir, file))
		});
	});

	console.log(chalk.green(`  ✅ Found ${inventory.apis.length} API endpoints\n`));
}

/**
 * Find tests
 */
async function discoverTests() {
	console.log(chalk.yellow('📍 Step 5: Discovering Tests\n'));

	const testPatterns = [
		'**/*.test.ts',
		'**/*.spec.ts',
		'tests/**/*.ts',
		'src/**/*.test.svelte'
	];

	for (const pattern of testPatterns) {
		const files = await glob(pattern, { cwd: rootDir, ignore: ['node_modules/**'] });
		inventory.tests.push(...files.map(f => f.replace(/\\/g, '/')));
	}

	console.log(chalk.green(`  ✅ Found ${inventory.tests.length} test files\n`));
}

/**
 * Generate comprehensive report
 */
function generateReport() {
	console.log(chalk.yellow('📍 Step 6: Generating Report\n'));

	let report = '# 📋 Phase 74: Complete Route Inventory\n\n';
	report += `Generated: ${new Date().toISOString()}\n\n`;

	// Summary
	report += '## 📊 Summary\n\n';
	report += `- **Active Routes:** ${inventory.active.length}\n`;
	report += `- **Parked Routes:** ${inventory.parked.length}\n`;
	report += `- **Duplicate Paths:** ${inventory.duplicates.length}\n`;
	report += `- **API Endpoints:** ${inventory.apis.length}\n`;
	report += `- **Test Files:** ${inventory.tests.length}\n`;
	report += `- **Files with Missing Imports:** ${inventory.missingImports.length}\n\n`;

	// Active Routes by Type
	report += '## 📄 Active Routes by Type\n\n';
	const byType = {};
	inventory.active.forEach(r => {
		byType[r.type] = (byType[r.type] || 0) + 1;
	});
	Object.entries(byType).forEach(([type, count]) => {
		report += `- **${type}:** ${count}\n`;
	});
	report += '\n';

	// Duplicates
	if (inventory.duplicates.length > 0) {
		report += '## ⚠️ Duplicate Routes\n\n';
		inventory.duplicates.forEach(dup => {
			report += `### \`${dup.path}\`\n\n`;
			dup.routes.forEach(r => {
				report += `- [${r.location}] \`${r.file}\` (${(r.size / 1024).toFixed(1)} KB)\n`;
			});
			report += '\n';
		});
	}

	// Active Routes List
	report += '## ✅ Active Routes\n\n';
	report += '| Path | Type | File | Size |\n';
	report += '|------|------|------|------|\n';
	inventory.active.forEach(route => {
		const sizeKB = (route.size / 1024).toFixed(1);
		report += `| ${route.path} | ${route.type} | ${route.file} | ${sizeKB} KB |\n`;
	});
	report += '\n';

	// Parked Routes
	if (inventory.parked.length > 0) {
		report += '## ⏸️ Parked Routes\n\n';
		report += '| File | Size |\n';
		report += '|------|------|\n';
		inventory.parked.forEach(route => {
			const sizeKB = (route.size / 1024).toFixed(1);
			report += `| ${route.file} | ${sizeKB} KB |\n`;
		});
		report += '\n';
	}

	// API Endpoints
	if (inventory.apis.length > 0) {
		report += '## 🔌 API Endpoints\n\n';
		report += '| Path | Methods | Error Handling | Tested |\n';
		report += '|------|---------|----------------|--------|\n';
		inventory.apis.forEach(api => {
			const methods = api.methods.join(', ') || 'None';
			const errorHandling = api.hasErrorHandling ? '✅' : '❌';
			const tested = api.tested ? '✅' : '❌';
			report += `| ${api.path} | ${methods} | ${errorHandling} | ${tested} |\n`;
		});
		report += '\n';
	}

	// Missing Imports
	if (inventory.missingImports.length > 0) {
		report += '## ❌ Missing Imports\n\n';
		inventory.missingImports.forEach(item => {
			report += `### \`${item.file}\`\n\n`;
			item.missing.forEach(imp => {
				report += `- \`$lib/${imp}\`\n`;
			});
			report += '\n';
		});
	}

	// Save report
	const reportPath = path.join(rootDir, 'reports/phase74/route-inventory.md');
	fs.mkdirSync(path.dirname(reportPath), { recursive: true });
	fs.writeFileSync(reportPath, report);

	// Save JSON
	const jsonPath = path.join(rootDir, 'reports/phase74/route-inventory.json');
	fs.writeFileSync(jsonPath, JSON.stringify(inventory, null, 2));

	console.log(chalk.green(`  ✅ Report saved: ${reportPath}\n`));
	console.log(chalk.blue(`  📄 JSON saved: ${jsonPath}\n`));

	return reportPath;
}

/**
 * Helper functions
 */

function extractRoutePath(file) {
	const match = file.match(/src\/routes\/(.+?)\/\+/);
	if (!match) return '/';
	return '/' + match[1].replace(/\\/g, '/');
}

function extractRouteType(file) {
	if (file.includes('+page.svelte')) return 'page.svelte';
	if (file.includes('+page.ts')) return 'page.ts';
	if (file.includes('+page.server.ts')) return 'page.server';
	if (file.includes('+layout.svelte')) return 'layout.svelte';
	if (file.includes('+layout.ts')) return 'layout.ts';
	if (file.includes('+layout.server.ts')) return 'layout.server';
	if (file.includes('+server.ts')) return 'server';
	if (file.includes('+error.svelte')) return 'error';
	return 'unknown';
}

function extractApiPath(file) {
	const match = file.match(/src\/routes\/api\/(.+?)\/\+server/);
	return match ? '/api/' + match[1].replace(/\\/g, '/') : '/api';
}

function extractApiMethods(filePath) {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const methods = [];
		if (content.includes('export async function GET')) methods.push('GET');
		if (content.includes('export async function POST')) methods.push('POST');
		if (content.includes('export async function PUT')) methods.push('PUT');
		if (content.includes('export async function DELETE')) methods.push('DELETE');
		if (content.includes('export async function PATCH')) methods.push('PATCH');
		return methods;
	} catch {
		return [];
	}
}

function checkIfTested(file) {
	const testFile = file.replace('+server.ts', '+server.test.ts');
	return fs.existsSync(path.join(rootDir, testFile));
}

function hasErrorHandling(filePath) {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		return content.includes('try') && content.includes('catch');
	} catch {
		return false;
	}
}

/**
 * Main execution
 */
async function main() {
	const startTime = Date.now();

	await discoverRoutes();
	findDuplicates();
	await checkMissingImports();
	await discoverAPIs();
	await discoverTests();
	const reportPath = generateReport();

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);

	console.log(chalk.green.bold('✅ Phase 74 Complete!\n'));
	console.log(chalk.cyan(`   Duration: ${duration}s`));
	console.log(chalk.blue(`\n   📋 View report: ${reportPath}\n`));
}

main().catch(error => {
	console.error(chalk.red('\n❌ Error:'), error.message);
	process.exit(1);
});
