#!/usr/bin/env node

/**
 * Phase 79: Streaming Comprehensive Error Analyzer
 *
 * Handles 16,733+ TypeScript errors with memory-efficient streaming
 * Categories: routes, API endpoints, gRPC, protobuf, flatbuffers, QUIC, etc.
 *
 * Usage:
 *   node scripts/phase79-streaming-error-analyzer.mjs
 */

import { spawn } from 'child_process';
import { createWriteStream, mkdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(ROOT, 'reports', 'phase79-analysis');
const TOP_N = 1000;

// Ensure reports directory exists
mkdirSync(REPORTS_DIR, { recursive: true });

// File categories with weights
const FILE_CATEGORIES = {
	routes: { patterns: [/\+page\.svelte$/, /\+page\.ts$/, /\+layout\.ts$/, /\+layout\.svelte$/], weight: 10, description: 'SvelteKit Routes' },
	'routes-server': { patterns: [/\+page\.server\.ts$/, /\+layout\.server\.ts$/], weight: 9, description: 'Server-Side Routes' },
	'api-endpoints': { patterns: [/src\/routes\/api\/.*\+server\.ts$/], weight: 9, description: 'API Endpoints' },
	grpc: { patterns: [/src\/lib\/grpc\/.*/, /\.proto$/], weight: 7, description: 'gRPC Services' },
	protobuf: { patterns: [/src\/proto\/.*/, /\.proto$/], weight: 7, description: 'Protocol Buffers' },
	flatbuffers: { patterns: [/\.fbs$/], weight: 6, description: 'FlatBuffers' },
	quic: { patterns: [/quic/i], weight: 5, description: 'QUIC Protocol' },
	services: { patterns: [/src\/lib\/server\/services\/.*/], weight: 8, description: 'Backend Services' },
	components: { patterns: [/src\/lib\/components\/.*\.svelte$/], weight: 6, description: 'Svelte Components' },
	stores: { patterns: [/src\/lib\/stores\/.*/], weight: 7, description: 'Svelte Stores' },
	database: { patterns: [/drizzle\/.*/, /src\/lib\/server\/db\/.*/], weight: 10, description: 'Database Layer' },
	auth: { patterns: [/lucia/, /auth/], weight: 10, description: 'Authentication' },
	workers: { patterns: [/\.worker\./, /src\/lib\/workers\/.*/], weight: 5, description: 'Web Workers' },
	gpu: { patterns: [/gpu/i, /cuda/i, /webgpu/i], weight: 4, description: 'GPU Computing' },
	utils: { patterns: [/src\/lib\/utils\/.*/], weight: 4, description: 'Utility Functions' },
	types: { patterns: [/\.d\.ts$/, /types\/.*/], weight: 6, description: 'Type Definitions' },
	tests: { patterns: [/\.test\./, /\.spec\./], weight: 3, description: 'Tests' },
	other: { patterns: [/.*/], weight: 1, description: 'Other Files' }
};

// Error patterns with cascade multipliers
const ERROR_PATTERNS = {
	'import-errors': {
		patterns: [
			/Cannot find module/,
			/Module .* has no exported member/,
			/Could not resolve/
		],
		cascadeMultiplier: 5
	},
	'type-errors': {
		patterns: [
			/Type .* is not assignable to type/,
			/Property .* does not exist on type/,
			/Argument of type .* is not assignable/
		],
		cascadeMultiplier: 3
	},
	'undefined-variables': {
		patterns: [
			/Cannot find name/,
			/'.*' is not defined/,
			/Binding element .* implicitly has/
		],
		cascadeMultiplier: 4
	},
	'syntax-errors': {
		patterns: [
			/';' expected/,
			/'}' expected/,
			/Expression expected/
		],
		cascadeMultiplier: 10
	},
	'generic-errors': {
		patterns: [
			/Type parameter.*has no default/,
			/Generic type.*requires.*type argument/
		],
		cascadeMultiplier: 2
	},
	'async-errors': {
		patterns: [
			/'await' expressions are only allowed/,
			/Type 'Promise.*' is not assignable/
		],
		cascadeMultiplier: 2
	},
	'other-errors': {
		patterns: [/.*/],
		cascadeMultiplier: 1
	}
};

class StreamingErrorAnalyzer {
	constructor() {
		this.errorsByFile = new Map();
		this.totalErrors = 0;
		this.categoryCounts = new Map();
		this.currentFile = null;
		this.buffer = '';
	}

	processLine(line) {
		// Detect file path (format: /path/to/file.ts:line:column)
		const fileMatch = line.match(/^([^\s]+\.(ts|svelte|js)):(\d+):(\d+)$/);
		if (fileMatch) {
			this.currentFile = {
				path: fileMatch[1].replace(/\\/g, '/'),
				line: parseInt(fileMatch[3], 10),
				column: parseInt(fileMatch[4], 10)
			};
			return;
		}

		// Detect error message (format: Error: message (ts(####)))
		if (line.trim().startsWith('Error:') && this.currentFile) {
			const errorMatch = line.match(/Error:\s*(.+?)\s*\(ts\((\d+)\)\)/);
			if (errorMatch) {
				const error = {
					file: this.currentFile.path,
					line: this.currentFile.line,
					column: this.currentFile.column,
					message: errorMatch[1].trim(),
					code: errorMatch[2]
				};

				this.addError(error);
				this.currentFile = null;
			}
		}
	}

	addError(error) {
		this.totalErrors++;

		if (!this.errorsByFile.has(error.file)) {
			this.errorsByFile.set(error.file, []);
		}
		this.errorsByFile.get(error.file).push(error);

		// Update category counts
		const category = this.determineCategory(error.file);
		this.categoryCounts.set(category, (this.categoryCounts.get(category) || 0) + 1);
	}

	determineCategory(filePath) {
		const normalized = filePath.replace(/\\/g, '/');

		for (const [categoryName, { patterns }] of Object.entries(FILE_CATEGORIES)) {
			for (const pattern of patterns) {
				if (pattern.test(normalized)) {
					return categoryName;
				}
			}
		}

		return 'other';
	}

	getErrorType(message) {
		for (const [typeName, { patterns }] of Object.entries(ERROR_PATTERNS)) {
			for (const pattern of patterns) {
				if (pattern.test(message)) {
					return typeName;
				}
			}
		}
		return 'other-errors';
	}

	calculateImpactScore(filePath, errorCount) {
		const category = this.determineCategory(filePath);
		const categoryWeight = FILE_CATEGORIES[category]?.weight || 1;

		// Calculate cascade score based on error types
		let cascadeScore = 0;
		const errors = this.errorsByFile.get(filePath) || [];

		for (const error of errors) {
			const errorType = this.getErrorType(error.message);
			const multiplier = ERROR_PATTERNS[errorType]?.cascadeMultiplier || 1;
			cascadeScore += multiplier;
		}

		return (errorCount * categoryWeight) + cascadeScore;
	}

	getPriority(impactScore) {
		if (impactScore >= 100) return 'P0';
		if (impactScore >= 50) return 'P1';
		if (impactScore >= 20) return 'P2';
		return 'P3';
	}

	generateReport() {
		console.log('\n📊 Generating reports...');

		const fileScores = [];
		for (const [filePath, errors] of this.errorsByFile.entries()) {
			const impactScore = this.calculateImpactScore(filePath, errors.length);
			const priority = this.getPriority(impactScore);
			const category = this.determineCategory(filePath);

			fileScores.push({
				file: filePath,
				errorCount: errors.length,
				category,
				impactScore,
				priority,
				errors: errors.slice(0, 5) // Include first 5 errors for context
			});
		}

		// Sort by impact and take top N
		const topFiles = fileScores.sort((a, b) => b.impactScore - a.impactScore).slice(0, TOP_N);

		// Generate JSON report
		const jsonReport = {
			timestamp: new Date().toISOString(),
			summary: {
				totalErrors: this.totalErrors,
				filesAffected: this.errorsByFile.size,
				categoryCount: this.categoryCounts.size,
				topN: TOP_N
			},
			categoryDistribution: Object.fromEntries(this.categoryCounts),
			priorityDistribution: this.getPriorityDistribution(topFiles),
			topFiles
		};

		const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
		const jsonPath = join(REPORTS_DIR, `comprehensive-analysis-${timestamp}.json`);
		const mdPath = join(REPORTS_DIR, `comprehensive-analysis-${timestamp}.md`);

		// Write JSON
		const jsonStream = createWriteStream(jsonPath);
		jsonStream.write(JSON.stringify(jsonReport, null, 2));
		jsonStream.end();

		// Write Markdown
		const mdStream = createWriteStream(mdPath);
		this.writeMarkdownReport(mdStream, jsonReport, topFiles);
		mdStream.end();

		console.log(`   📄 JSON: ${relative(ROOT, jsonPath)}`);
		console.log(`   📄 MD:   ${relative(ROOT, mdPath)}\n`);

		this.printSummary(jsonReport);
	}

	getPriorityDistribution(files) {
		const dist = { P0: 0, P1: 0, P2: 0, P3: 0 };
		for (const file of files) {
			dist[file.priority]++;
		}
		return dist;
	}

	writeMarkdownReport(stream, report, topFiles) {
		stream.write(`# Phase 79: Comprehensive Error Analysis\n\n`);
		stream.write(`**Generated**: ${new Date(report.timestamp).toLocaleString()}\n\n`);

		stream.write(`## Summary\n\n`);
		stream.write(`- **Total Errors**: ${report.summary.totalErrors.toLocaleString()}\n`);
		stream.write(`- **Files Affected**: ${report.summary.filesAffected.toLocaleString()}\n`);
		stream.write(`- **Categories**: ${report.summary.categoryCount}\n`);
		stream.write(`- **Top Files Analyzed**: ${report.summary.topN}\n\n`);

		stream.write(`## Priority Distribution\n\n`);
		stream.write(`| Priority | Count | Description |\n`);
		stream.write(`|----------|-------|-------------|\n`);
		stream.write(`| P0 | ${report.priorityDistribution.P0} | Critical (Impact ≥ 100) |\n`);
		stream.write(`| P1 | ${report.priorityDistribution.P1} | High (Impact ≥ 50) |\n`);
		stream.write(`| P2 | ${report.priorityDistribution.P2} | Medium (Impact ≥ 20) |\n`);
		stream.write(`| P3 | ${report.priorityDistribution.P3} | Low (Impact < 20) |\n\n`);

		stream.write(`## Category Distribution\n\n`);
		stream.write(`| Category | Errors |\n`);
		stream.write(`|----------|--------|\n`);
		for (const [category, count] of Object.entries(report.categoryDistribution).sort((a, b) => b[1] - a[1])) {
			const desc = FILE_CATEGORIES[category]?.description || category;
			stream.write(`| ${desc} | ${count.toLocaleString()} |\n`);
		}
		stream.write(`\n`);

		stream.write(`## Top ${Math.min(50, topFiles.length)} Highest-Impact Files\n\n`);
		for (let i = 0; i < Math.min(50, topFiles.length); i++) {
			const file = topFiles[i];
			stream.write(`### ${i + 1}. ${file.file}\n\n`);
			stream.write(`- **Priority**: ${file.priority}\n`);
			stream.write(`- **Impact Score**: ${file.impactScore}\n`);
			stream.write(`- **Error Count**: ${file.errorCount}\n`);
			stream.write(`- **Category**: ${FILE_CATEGORIES[file.category]?.description || file.category}\n\n`);

			if (file.errors.length > 0) {
				stream.write(`**Sample Errors**:\n\n`);
				for (const error of file.errors.slice(0, 3)) {
					stream.write(`- Line ${error.line}: ${error.message}\n`);
				}
				stream.write(`\n`);
			}
		}
	}

	printSummary(report) {
		console.log('📊 COMPREHENSIVE ERROR ANALYSIS COMPLETE\n');
		console.log(`Total Errors: ${report.summary.totalErrors.toLocaleString()}`);
		console.log(`Files Affected: ${report.summary.filesAffected.toLocaleString()}\n`);

		console.log('Priority Distribution:');
		console.log(`  P0 (Critical): ${report.priorityDistribution.P0} files`);
		console.log(`  P1 (High):     ${report.priorityDistribution.P1} files`);
		console.log(`  P2 (Medium):   ${report.priorityDistribution.P2} files`);
		console.log(`  P3 (Low):      ${report.priorityDistribution.P3} files\n`);

		console.log('🎯 Next Steps:');
		console.log('   1. Review generated reports in reports/phase79-analysis/');
		console.log('   2. Focus on P0 critical files first');
		console.log('   3. Create automation patterns for high-frequency errors');
		console.log('   4. Run pattern fixer with targeted fixes');
	}
}

async function main() {
	console.log('🔍 Phase 79: Comprehensive Error Analysis (Streaming)\n');
	console.log(`📊 Target: Top ${TOP_N} fixes ranked by impact\n`);
	console.log('📁 Scanning workspace with svelte-check...\n');

	const analyzer = new StreamingErrorAnalyzer();

	const child = spawn('npx', ['svelte-check'], {
		cwd: ROOT,
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: true
	});

	let lineBuffer = '';

	child.stdout.on('data', (data) => {
		lineBuffer += data.toString();
		const lines = lineBuffer.split('\n');
		lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

		for (const line of lines) {
			analyzer.processLine(line);
		}

		// Progress indicator
		if (analyzer.totalErrors > 0 && analyzer.totalErrors % 1000 === 0) {
			process.stdout.write(`\r   Processed ${analyzer.totalErrors.toLocaleString()} errors...`);
		}
	});

	child.stderr.on('data', (data) => {
		lineBuffer += data.toString();
		const lines = lineBuffer.split('\n');
		lineBuffer = lines.pop() || '';

		for (const line of lines) {
			analyzer.processLine(line);
		}
	});

	child.on('close', (code) => {
		// Process final line if exists
		if (lineBuffer) {
			analyzer.processLine(lineBuffer);
		}

		console.log(`\r   ✅ Found ${analyzer.totalErrors.toLocaleString()} total errors\n`);

		analyzer.generateReport();
	});
}

main().catch(console.error);
