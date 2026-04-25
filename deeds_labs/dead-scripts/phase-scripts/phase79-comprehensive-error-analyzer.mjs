#!/usr/bin/env node
/**
 * Phase 79: Comprehensive Error Analyzer
 *
 * Scans all 12,121+ files, ranks top 1,000 fixes by impact, and organizes
 * by category (routes, APIs, gRPC, protobuf, etc.) similar to Phase 66-79.
 *
 * Features:
 * - Full workspace error scanning with svelte-check
 * - Categorization by file type (routes, API, gRPC, services, components)
 * - Impact scoring (frequency × cascade × criticality)
 * - Top 1,000 ranked fixes with automation patterns
 * - Export to JSON and Markdown reports
 *
 * Usage:
 *   node scripts/phase79-comprehensive-error-analyzer.mjs
 *   node scripts/phase79-comprehensive-error-analyzer.mjs --top=500
 *   node scripts/phase79-comprehensive-error-analyzer.mjs --category=routes
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const TOP_N = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] || '1000', 10);
const CATEGORY_FILTER = args.find(a => a.startsWith('--category='))?.split('=')[1];

// ============================================================================
// FILE CATEGORIZATION
// ============================================================================

const FILE_CATEGORIES = {
	routes: {
		patterns: [
			/src\/routes\/.*\+page\.svelte$/,
			/src\/routes\/.*\+page\.ts$/,
			/src\/routes\/.*\+layout\.svelte$/,
			/src\/routes\/.*\+layout\.ts$/
		],
		weight: 10, // High criticality - user-facing
		description: 'SvelteKit Routes (Pages & Layouts)'
	},
	'routes-server': {
		patterns: [
			/src\/routes\/.*\+page\.server\.ts$/,
			/src\/routes\/.*\+layout\.server\.ts$/,
			/src\/routes\/.*\+server\.ts$/
		],
		weight: 9,
		description: 'SvelteKit Server Routes & Endpoints'
	},
	'api-endpoints': {
		patterns: [
			/src\/routes\/api\/.*\+server\.ts$/,
			/src\/routes\/api\/.*\.ts$/
		],
		weight: 9,
		description: 'REST API Endpoints'
	},
	grpc: {
		patterns: [
			/src\/lib\/grpc\/.*/,
			/src\/grpc\/.*/,
			/\.proto$/
		],
		weight: 7,
		description: 'gRPC Services & Protobuf'
	},
	protobuf: {
		patterns: [
			/src\/proto\/.*/,
			/src\/lib\/proto\/.*/,
			/\.proto$/
		],
		weight: 7,
		description: 'Protocol Buffers'
	},
	flatbuffers: {
		patterns: [
			/src\/flatbuf\/.*/,
			/src\/lib\/flatbuf\/.*/,
			/\.fbs$/
		],
		weight: 6,
		description: 'FlatBuffers'
	},
	quic: {
		patterns: [
			/quic/i,
			/src\/lib\/quic\/.*/
		],
		weight: 5,
		description: 'QUIC Protocol Handlers'
	},
	services: {
		patterns: [
			/src\/lib\/server\/services\/.*/,
			/src\/lib\/services\/.*/
		],
		weight: 8,
		description: 'Backend Services & Business Logic'
	},
	components: {
		patterns: [
			/src\/lib\/components\/.*\.svelte$/,
			/src\/lib\/components\/.*\.ts$/
		],
		weight: 6,
		description: 'UI Components'
	},
	stores: {
		patterns: [
			/src\/lib\/stores\/.*/
		],
		weight: 7,
		description: 'State Management (Stores)'
	},
	database: {
		patterns: [
			/src\/lib\/server\/db\/.*/,
			/src\/lib\/db\/.*/,
			/drizzle\/.*/,
			/migrations\/.*/
		],
		weight: 10,
		description: 'Database Layer (Drizzle ORM)'
	},
	auth: {
		patterns: [
			/src\/lib\/server\/auth\/.*/,
			/src\/lib\/server\/lucia/,
			/src\/routes\/.*auth.*/
		],
		weight: 10,
		description: 'Authentication & Authorization'
	},
	workers: {
		patterns: [
			/workers\/.*/,
			/\.worker\.ts$/
		],
		weight: 5,
		description: 'Web Workers & Background Jobs'
	},
	gpu: {
		patterns: [
			/src\/lib\/gpu\/.*/,
			/src\/lib\/components\/.*gpu.*/i
		],
		weight: 4,
		description: 'GPU Acceleration & WebGPU'
	},
	utils: {
		patterns: [
			/src\/lib\/utils\/.*/,
			/src\/lib\/helpers\/.*/
		],
		weight: 5,
		description: 'Utilities & Helpers'
	},
	types: {
		patterns: [
			/src\/lib\/types\/.*/,
			/\.d\.ts$/
		],
		weight: 6,
		description: 'Type Definitions'
	},
	tests: {
		patterns: [
			/\.test\.ts$/,
			/\.spec\.ts$/,
			/tests\/.*/
		],
		weight: 2,
		description: 'Test Files'
	}
};

// ============================================================================
// ERROR PATTERN SCORING
// ============================================================================

const ERROR_PATTERNS = {
	// High-frequency root causes (Phase 66-79 style)
	'import-errors': {
		patterns: [
			/Cannot find module/,
			/Module '".*"' has no exported member/,
			/import type.*cannot be used as a value/
		],
		cascadeMultiplier: 5, // Each import error affects downstream
		description: 'Import/Module Resolution Errors'
	},
	'type-errors': {
		patterns: [
			/Type '.*' is not assignable to type/,
			/Property '.*' does not exist on type/,
			/Argument of type '.*' is not assignable/
		],
		cascadeMultiplier: 3,
		description: 'Type Mismatch Errors'
	},
	'undefined-variables': {
		patterns: [
			/Cannot find name '.*'/,
			/'.*' is not defined/
		],
		cascadeMultiplier: 4,
		description: 'Undefined Variables/Functions'
	},
	'syntax-errors': {
		patterns: [
			/';' expected/,
			/'}' expected/,
			/Expression expected/,
			/Declaration expected/
		],
		cascadeMultiplier: 10, // Syntax errors block entire file
		description: 'Syntax Errors'
	},
	'generic-errors': {
		patterns: [
			/Type parameter.*has no default/,
			/Generic type.*requires.*type argument/
		],
		cascadeMultiplier: 2,
		description: 'Generic Type Errors'
	},
	'async-errors': {
		patterns: [
			/'await' expressions are only allowed/,
			/Type 'Promise.*' is not assignable/
		],
		cascadeMultiplier: 3,
		description: 'Async/Promise Errors'
	},
	'null-safety': {
		patterns: [
			/Object is possibly 'null'/,
			/Object is possibly 'undefined'/,
			/Cannot invoke an object which is possibly/
		],
		cascadeMultiplier: 1,
		description: 'Null/Undefined Safety'
	}
};

// ============================================================================
// MAIN ANALYZER
// ============================================================================

async function runComprehensiveAnalysis() {
	console.log('🔍 Phase 79: Comprehensive Error Analysis\n');
	console.log(`📊 Target: Top ${TOP_N} fixes ranked by impact`);
	if (CATEGORY_FILTER) {
		console.log(`🎯 Filter: ${CATEGORY_FILTER} category only`);
	}
	console.log('');

	// Step 1: Run svelte-check and capture all errors
	console.log('📁 Step 1/4: Scanning workspace with svelte-check...');
	const errors = await collectAllErrors();
	console.log(`   ✅ Found ${errors.length} total errors\n`);

	// Step 2: Categorize by file type
	console.log('📂 Step 2/4: Categorizing errors by file type...');
	const categorized = categorizeErrors(errors);
	console.log(`   ✅ Organized into ${Object.keys(categorized).length} categories\n`);

	// Step 3: Score and rank by impact
	console.log('📈 Step 3/4: Scoring errors by impact...');
	const scored = scoreErrors(categorized);
	const ranked = scored.sort((a, b) => b.impactScore - a.impactScore).slice(0, TOP_N);
	console.log(`   ✅ Ranked top ${ranked.length} highest-impact errors\n`);

	// Step 4: Generate reports
	console.log('📝 Step 4/4: Generating reports...');
	await generateReports(ranked, categorized);
	console.log('   ✅ Reports generated\n');

	// Summary
	printSummary(ranked, categorized);
}

async function collectAllErrors() {
	try {
		// Use human-readable output for better error parsing
		const output = execSync('npx svelte-check 2>&1', {
			cwd: ROOT,
			encoding: 'utf8',
			maxBuffer: 50 * 1024 * 1024, // 50MB buffer
			stdio: 'pipe'
		});

		return parseHumanReadableErrors(output);
	} catch (error) {
		// svelte-check exits with code 1 when errors exist
		if (error.stdout || error.stderr) {
			const output = (error.stdout || '') + (error.stderr || '');
			return parseHumanReadableErrors(output);
		}
		console.error('❌ Failed to run svelte-check:', error.message);
		return [];
	}
}

function parseHumanReadableErrors(output) {
	const errors = [];
	const lines = output.split('\n');
	let currentFile = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Extract file path (format: /path/to/file.ts:line:column)
		const fileMatch = line.match(/^([^\s]+\.(ts|svelte|js)):(\d+):(\d+)$/);
		if (fileMatch) {
			currentFile = {
				path: fileMatch[1],
				line: parseInt(fileMatch[3], 10),
				column: parseInt(fileMatch[4], 10)
			};
			continue;
		}

		// Extract error message (format: Error: message (ts(####)))
		if (line.trim().startsWith('Error:') && currentFile) {
			const errorMatch = line.match(/Error:\s*(.+?)\s*\(ts\((\d+)\)\)/);
			if (errorMatch) {
				errors.push({
					file: currentFile.path,
					line: currentFile.line,
					column: currentFile.column,
					message: errorMatch[1].trim(),
					code: errorMatch[2]
				});
				currentFile = null; // Reset for next error
			}
		}
	}

	return errors;
}

function categorizeErrors(errors) {
	const categorized = {};

	for (const error of errors) {
		const category = determineCategory(error.file);
		if (!categorized[category]) {
			categorized[category] = [];
		}
		categorized[category].push(error);
	}

	return categorized;
}

function determineCategory(filePath) {
	for (const [categoryName, categoryInfo] of Object.entries(FILE_CATEGORIES)) {
		for (const pattern of categoryInfo.patterns) {
			if (pattern.test(filePath)) {
				return categoryName;
			}
		}
	}
	return 'other';
}

function scoreErrors(categorized) {
	const scored = [];

	for (const [category, errors] of Object.entries(categorized)) {
		const categoryWeight = FILE_CATEGORIES[category]?.weight || 1;

		// Group by file to detect high-error files
		const fileGroups = {};
		for (const error of errors) {
			if (!fileGroups[error.file]) {
				fileGroups[error.file] = [];
			}
			fileGroups[error.file].push(error);
		}

		// Score each file's errors
		for (const [file, fileErrors] of Object.entries(fileGroups)) {
			// Detect error patterns
			const patternScores = {};
			for (const error of fileErrors) {
				for (const [patternName, patternInfo] of Object.entries(ERROR_PATTERNS)) {
					for (const regex of patternInfo.patterns) {
						if (regex.test(error.message)) {
							if (!patternScores[patternName]) {
								patternScores[patternName] = {
									count: 0,
									multiplier: patternInfo.cascadeMultiplier,
									description: patternInfo.description
								};
							}
							patternScores[patternName].count++;
						}
					}
				}
			}

			// Calculate impact score
			const errorCount = fileErrors.length;
			const cascadeScore = Object.values(patternScores).reduce((sum, p) => sum + (p.count * p.multiplier), 0);
			const impactScore = (errorCount * categoryWeight) + cascadeScore;

			scored.push({
				file,
				category,
				errorCount,
				impactScore,
				categoryWeight,
				patterns: patternScores,
				errors: fileErrors,
				priority: getPriority(impactScore)
			});
		}
	}

	return scored;
}

function getPriority(impactScore) {
	if (impactScore > 100) return 'P0 - Critical';
	if (impactScore > 50) return 'P1 - High';
	if (impactScore > 20) return 'P2 - Medium';
	return 'P3 - Low';
}

async function generateReports(ranked, categorized) {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
	const reportsDir = path.join(ROOT, 'reports', 'phase79-analysis');
	await fs.mkdir(reportsDir, { recursive: true });

	// JSON Report
	const jsonReport = {
		timestamp,
		totalErrors: ranked.reduce((sum, r) => sum + r.errorCount, 0),
		totalFiles: ranked.length,
		topN: TOP_N,
		categories: Object.keys(categorized).map(cat => ({
			name: cat,
			count: categorized[cat].length,
			weight: FILE_CATEGORIES[cat]?.weight || 1,
			description: FILE_CATEGORIES[cat]?.description || 'Other'
		})),
		rankedFiles: ranked
	};

	await fs.writeFile(
		path.join(reportsDir, `comprehensive-analysis-${timestamp}.json`),
		JSON.stringify(jsonReport, null, 2)
	);

	// Markdown Report
	const markdown = generateMarkdownReport(ranked, categorized, timestamp);
	await fs.writeFile(
		path.join(reportsDir, `comprehensive-analysis-${timestamp}.md`),
		markdown
	);

	console.log(`   📄 JSON: reports/phase79-analysis/comprehensive-analysis-${timestamp}.json`);
	console.log(`   📄 MD:   reports/phase79-analysis/comprehensive-analysis-${timestamp}.md`);
}

function generateMarkdownReport(ranked, categorized, timestamp) {
	let md = `# Phase 79: Comprehensive Error Analysis\n\n`;
	md += `**Generated:** ${timestamp}\n`;
	md += `**Total Errors:** ${ranked.reduce((sum, r) => sum + r.errorCount, 0)}\n`;
	md += `**Files Analyzed:** ${ranked.length}\n\n`;

	// Category Breakdown
	md += `## 📊 Category Breakdown\n\n`;
	md += `| Category | Files | Errors | Weight | Description |\n`;
	md += `|----------|-------|--------|--------|-------------|\n`;

	for (const [category, errors] of Object.entries(categorized)) {
		const files = new Set(errors.map(e => e.file)).size;
		const weight = FILE_CATEGORIES[category]?.weight || 1;
		const desc = FILE_CATEGORIES[category]?.description || 'Other';
		md += `| ${category} | ${files} | ${errors.length} | ${weight} | ${desc} |\n`;
	}
	md += `\n`;

	// Top Priority Files
	md += `## 🔥 Top ${Math.min(50, ranked.length)} Priority Files\n\n`;
	md += `| Rank | File | Category | Errors | Impact | Priority | Top Patterns |\n`;
	md += `|------|------|----------|--------|--------|----------|-------------|\n`;

	ranked.slice(0, 50).forEach((item, idx) => {
		const topPatterns = Object.entries(item.patterns)
			.sort((a, b) => b[1].count - a[1].count)
			.slice(0, 2)
			.map(([name, info]) => `${name}(${info.count})`)
			.join(', ');

		md += `| ${idx + 1} | \`${item.file}\` | ${item.category} | ${item.errorCount} | ${Math.round(item.impactScore)} | ${item.priority} | ${topPatterns || 'N/A'} |\n`;
	});
	md += `\n`;

	// Pattern Distribution
	md += `## 🎯 Error Pattern Distribution\n\n`;
	const allPatterns = {};
	for (const item of ranked) {
		for (const [patternName, info] of Object.entries(item.patterns)) {
			if (!allPatterns[patternName]) {
				allPatterns[patternName] = { count: 0, files: 0, description: info.description };
			}
			allPatterns[patternName].count += info.count;
			allPatterns[patternName].files++;
		}
	}

	md += `| Pattern | Occurrences | Files | Description |\n`;
	md += `|---------|-------------|-------|-------------|\n`;
	Object.entries(allPatterns)
		.sort((a, b) => b[1].count - a[1].count)
		.forEach(([name, info]) => {
			md += `| ${name} | ${info.count} | ${info.files} | ${info.description} |\n`;
		});
	md += `\n`;

	// Recommended Actions
	md += `## ✅ Recommended Action Plan\n\n`;
	md += `### Immediate (P0 - Critical)\n`;
	const p0 = ranked.filter(r => r.priority === 'P0 - Critical');
	if (p0.length > 0) {
		p0.slice(0, 10).forEach((item, idx) => {
			md += `${idx + 1}. **${item.file}** (${item.errorCount} errors)\n`;
			md += `   - Category: ${item.category}\n`;
			md += `   - Impact Score: ${Math.round(item.impactScore)}\n\n`;
		});
	} else {
		md += `✅ No P0 critical issues!\n\n`;
	}

	md += `### High Priority (P1)\n`;
	const p1 = ranked.filter(r => r.priority === 'P1 - High');
	md += `- ${p1.length} files require attention\n`;
	md += `- Focus on routes, API endpoints, and database layers\n\n`;

	md += `### Medium Priority (P2)\n`;
	const p2 = ranked.filter(r => r.priority === 'P2 - Medium');
	md += `- ${p2.length} files for follow-up\n\n`;

	md += `### Automation Opportunities\n`;
	md += `Based on pattern analysis, consider creating auto-fixers for:\n`;
	Object.entries(allPatterns)
		.sort((a, b) => b[1].count - a[1].count)
		.slice(0, 5)
		.forEach(([name, info]) => {
			md += `- **${name}**: ${info.count} occurrences across ${info.files} files\n`;
		});

	return md;
}

function printSummary(ranked, categorized) {
	console.log('═'.repeat(80));
	console.log('📊 COMPREHENSIVE ERROR ANALYSIS COMPLETE');
	console.log('═'.repeat(80));
	console.log('');

	// Top categories
	console.log('📂 Top Categories by Error Count:');
	Object.entries(categorized)
		.sort((a, b) => b[1].length - a[1].length)
		.slice(0, 5)
		.forEach(([cat, errors], idx) => {
			const desc = FILE_CATEGORIES[cat]?.description || 'Other';
			console.log(`   ${idx + 1}. ${cat.padEnd(20)} ${String(errors.length).padStart(5)} errors - ${desc}`);
		});
	console.log('');

	// Priority breakdown
	const p0 = ranked.filter(r => r.priority === 'P0 - Critical').length;
	const p1 = ranked.filter(r => r.priority === 'P1 - High').length;
	const p2 = ranked.filter(r => r.priority === 'P2 - Medium').length;
	const p3 = ranked.filter(r => r.priority === 'P3 - Low').length;

	console.log('🎯 Priority Distribution:');
	console.log(`   P0 (Critical): ${p0} files`);
	console.log(`   P1 (High):     ${p1} files`);
	console.log(`   P2 (Medium):   ${p2} files`);
	console.log(`   P3 (Low):      ${p3} files`);
	console.log('');

	// Top 3 files
	console.log('🔥 Top 3 Files by Impact:');
	ranked.slice(0, 3).forEach((item, idx) => {
		console.log(`   ${idx + 1}. ${item.file}`);
		console.log(`      Errors: ${item.errorCount}, Impact: ${Math.round(item.impactScore)}, Category: ${item.category}`);
	});
	console.log('');

	console.log('💡 Next Steps:');
	console.log('   1. Review generated reports in reports/phase79-analysis/');
	console.log('   2. Focus on P0 critical files first');
	console.log('   3. Create automation patterns for high-frequency errors');
	console.log('   4. Run pattern fixer with targeted fixes');
	console.log('');
}

// ============================================================================
// RUN
// ============================================================================

runComprehensiveAnalysis().catch(console.error);
