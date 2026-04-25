#!/usr/bin/env node
/**
 * Generate errors.jsonl with CHUNKED STREAMING + LOGGING
 *
 * Processes TypeScript and Svelte errors in chunks with real-time streaming
 * - Configurable chunk size (default 1000 errors)
 * - Comprehensive logging to phase72_logs/
 * - Pattern analysis and recommendations
 * - Progress monitoring with ETA
 *
 * Usage:
 *   node scripts/generate-errors-chunked.mjs --tool both
 *   node scripts/generate-errors-chunked.mjs --tool tsc --chunk-size 500
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
const tool = args.includes('--tool') ? args[args.indexOf('--tool') + 1] : 'both';
const chunkSize = args.includes('--chunk-size') ? parseInt(args[args.indexOf('--chunk-size') + 1], 10) : 1000;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

// Setup directories
const outputDir = path.join(__dirname, '..', 'reports', 'latest');
const logsDir = path.join(__dirname, '..', 'phase72_logs');
const sessionLogDir = path.join(logsDir, `session_${timestamp}`);
const outputFile = path.join(outputDir, 'errors.jsonl');
const logFile = path.join(sessionLogDir, 'generation.log');
const statsFile = path.join(sessionLogDir, 'stats.json');
const recommendationsFile = path.join(sessionLogDir, 'recommendations.md');

// Create directories
[outputDir, logsDir, sessionLogDir].forEach(dir => {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
});

// Initialize log stream
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
function log(message) {
	const timestamp = new Date().toISOString();
	logStream.write(`[${timestamp}] ${message}\n`);
	console.log(message);
}

log('\n🚀 Phase 72 - Chunked Error Generation Started');
log(`🔧 Tool: ${tool}`);
log(`📦 Chunk Size: ${chunkSize} errors`);
log(`📂 Session Log: ${sessionLogDir}\n`);

// Statistics tracking
const stats = {
	startTime: Date.now(),
	tool,
	chunkSize,
	totalErrors: 0,
	tscErrors: 0,
	svelteErrors: 0,
	chunksProcessed: 0,
	errorsByCategory: {},
	errorsByFile: {},
	errorsBySeverity: { error: 0, warning: 0 }
};

/**
 * Categorize error for pattern analysis
 */
function categorizeError(errorMsg) {
	const msg = (errorMsg || '').toLowerCase();

	if (msg.includes('semicolon') || msg.includes(';')) return 'syntax-semicolon';
	if (msg.includes('type') && msg.includes('not assignable')) return 'type-mismatch';
	if (msg.includes('import') || msg.includes('export')) return 'module-import';
	if (msg.includes('cannot find name')) return 'undeclared-identifier';
	if (msg.includes('property') && msg.includes('does not exist')) return 'property-missing';
	if (msg.includes('expected')) return 'syntax-expected';
	if (msg.includes('return type')) return 'return-type';
	if (msg.includes('generic')) return 'generic-type';
	if (msg.includes('union')) return 'union-type';
	if (msg.includes('async') || msg.includes('promise')) return 'async-await';

	return 'misc-error';
}

/**
 * Parse TypeScript error line
 */
function parseTscLine(line) {
	// Match: src/file.ts(123,45): error TS1234: Message
	const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
	if (!match) return null;

	const [, file, lineNum, column, severity, code, message] = match;
	const category = categorizeError(message);

	stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;
	stats.errorsByFile[file] = (stats.errorsByFile[file] || 0) + 1;
	stats.errorsBySeverity[severity]++;

	return {
		file: file.replace(/\\/g, '/'),
		line: parseInt(lineNum, 10),
		column: parseInt(column, 10),
		code,
		message: message.trim(),
		severity,
		category,
		tool: 'tsc',
		timestamp: new Date().toISOString(),
		hash: createHash('sha256').update(`${file}:${lineNum}:${message}`).digest('hex').slice(0, 16)
	};
}

/**
 * Parse Svelte-check error line
 */
function parsesvelteLine(line) {
	// Match: Error: Message (src/file.svelte:123:45)
	const match1 = line.match(/^(Error|Warning):\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
	if (match1) {
		const [, severity, message, file, lineNum, column] = match1;
		const category = categorizeError(message);

		stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;
		stats.errorsByFile[file] = (stats.errorsByFile[file] || 0) + 1;
		stats.errorsBySeverity[severity.toLowerCase()]++;

		return {
			file: file.replace(/\\/g, '/'),
			line: parseInt(lineNum, 10),
			column: parseInt(column, 10),
			code: 'SVELTE',
			message: message.trim(),
			severity: severity.toLowerCase(),
			category,
			tool: 'svelte-check',
			timestamp: new Date().toISOString(),
			hash: createHash('sha256').update(`${file}:${lineNum}:${message}`).digest('hex').slice(0, 16)
		};
	}

	// Match: src/file.svelte:123:45 Error: Message
	const match2 = line.match(/^(.+?):(\d+):(\d+)\s+(Error|Warning):\s+(.+)$/);
	if (match2) {
		const [, file, lineNum, column, severity, message] = match2;
		const category = categorizeError(message);

		stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;
		stats.errorsByFile[file] = (stats.errorsByFile[file] || 0) + 1;
		stats.errorsBySeverity[severity.toLowerCase()]++;

		return {
			file: file.replace(/\\/g, '/'),
			line: parseInt(lineNum, 10),
			column: parseInt(column, 10),
			code: 'SVELTE',
			message: message.trim(),
			severity: severity.toLowerCase(),
			category,
			tool: 'svelte-check',
			timestamp: new Date().toISOString(),
			hash: createHash('sha256').update(`${file}:${lineNum}:${message}`).digest('hex').slice(0, 16)
		};
	}

	return null;
}

/**
 * Process errors in chunks with streaming
 */
async function processChunked(command, args, parser) {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			cwd: path.join(__dirname, '..'),
			shell: true
		});

		let buffer = '';
		let currentChunk = [];
		let chunkCount = 0;
		const writeStream = fs.createWriteStream(outputFile, { flags: 'a' });

		proc.stdout.on('data', (data) => {
			buffer += data.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const error = parser(line);
				if (error) {
					currentChunk.push(error);
					stats.totalErrors++;

					// Process chunk when full
					if (currentChunk.length >= chunkSize) {
						chunkCount++;
						log(`📦 Chunk ${chunkCount}: Processing ${currentChunk.length} errors`);

						currentChunk.forEach(err => {
							writeStream.write(JSON.stringify(err) + '\n');
						});

						stats.chunksProcessed++;
						currentChunk = [];
					}
				}
			}
		});

		proc.stderr.on('data', (data) => {
			buffer += data.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const error = parser(line);
				if (error) {
					currentChunk.push(error);
					stats.totalErrors++;

					if (currentChunk.length >= chunkSize) {
						chunkCount++;
						log(`📦 Chunk ${chunkCount}: Processing ${currentChunk.length} errors`);

						currentChunk.forEach(err => {
							writeStream.write(JSON.stringify(err) + '\n');
						});

						stats.chunksProcessed++;
						currentChunk = [];
					}
				}
			}
		});

		proc.on('close', () => {
			// Write remaining errors
			if (currentChunk.length > 0) {
				chunkCount++;
				log(`📦 Final Chunk ${chunkCount}: Processing ${currentChunk.length} errors`);

				currentChunk.forEach(err => {
					writeStream.write(JSON.stringify(err) + '\n');
				});

				stats.chunksProcessed++;
			}

			writeStream.end();
			resolve();
		});

		proc.on('error', reject);
	});
}

/**
 * Generate recommendations based on error patterns
 */
function generateRecommendations() {
	const recommendations = [];

	// Top error categories
	const sortedCategories = Object.entries(stats.errorsByCategory)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10);

	recommendations.push('# Phase 72 Error Pattern Analysis\n');
	recommendations.push(`Generated: ${new Date().toISOString()}\n`);
	recommendations.push(`Total Errors: ${stats.totalErrors}\n`);
	recommendations.push(`Processing Time: ${((Date.now() - stats.startTime) / 1000).toFixed(2)}s\n\n`);

	recommendations.push('## Top Error Categories\n');
	sortedCategories.forEach(([category, count], i) => {
		const percentage = ((count / stats.totalErrors) * 100).toFixed(1);
		recommendations.push(`${i + 1}. **${category}**: ${count} errors (${percentage}%)\n`);
	});

	recommendations.push('\n## Recommendations by Category\n\n');

	// Category-specific recommendations
	const categoryAdvice = {
		'type-mismatch': '🔧 **Type Mismatch**: Review type definitions and ensure correct type assertions. Consider using union types or type guards.',
		'undeclared-identifier': '🔧 **Undeclared Identifiers**: Add missing imports or declare variables. Check for typos in variable names.',
		'property-missing': '🔧 **Missing Properties**: Update interfaces to include required properties or use optional chaining (?.).',
		'module-import': '🔧 **Import Issues**: Verify import paths and ensure modules are properly exported. Check tsconfig.json paths.',
		'syntax-semicolon': '🔧 **Syntax Errors**: Add missing semicolons or fix syntax. Consider enabling ESLint auto-fix.',
		'async-await': '🔧 **Async/Await**: Ensure async functions are properly awaited and return types are correct.',
		'generic-type': '🔧 **Generic Types**: Provide type arguments for generics or use type inference where possible.'
	};

	sortedCategories.forEach(([category]) => {
		if (categoryAdvice[category]) {
			recommendations.push(`### ${category}\n${categoryAdvice[category]}\n\n`);
		}
	});

	// Files with most errors
	const sortedFiles = Object.entries(stats.errorsByFile)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20);

	recommendations.push('## Files with Most Errors (Top 20)\n\n');
	sortedFiles.forEach(([file, count], i) => {
		recommendations.push(`${i + 1}. \`${file}\`: ${count} errors\n`);
	});

	recommendations.push('\n## Next Steps\n\n');
	recommendations.push('1. 🧠 **Generate Embeddings**: `node scripts/embed-errors-phase72.mjs --limit 1000`\n');
	recommendations.push('2. 🔍 **Run Smart Fixer**: `node scripts/smart-error-fixer-phase72.mjs --batch 100`\n');
	recommendations.push('3. 📊 **Review Statistics**: Check `phase72_logs/` for detailed metrics\n');
	recommendations.push('4. 🎯 **Target High-Impact Files**: Focus on files with >50 errors first\n');

	return recommendations.join('');
}

/**
 * Main execution
 */
async function main() {
	const startTime = Date.now();

	try {
		// Clear existing output
		if (fs.existsSync(outputFile)) {
			fs.unlinkSync(outputFile);
			log('🗑️  Cleared existing errors.jsonl');
		}

		// Run TypeScript check
		if (tool === 'tsc' || tool === 'both') {
			log('\n⏳ Running TypeScript check (streaming)...');
			await processChunked('npx', ['tsc', '--noEmit', '--pretty', 'false'], parseTscLine);
			stats.tscErrors = stats.totalErrors;
			log(`✅ TypeScript: ${stats.tscErrors} errors processed\n`);
		}

		// Run Svelte check
		if (tool === 'svelte-check' || tool === 'both') {
			const tscCount = stats.totalErrors;
			log('\n⏳ Running Svelte check (streaming)...');
			await processChunked('npx', ['svelte-check', '--output', 'machine'], parseSvelteLine);
			stats.svelteErrors = stats.totalErrors - tscCount;
			log(`✅ Svelte: ${stats.svelteErrors} errors processed\n`);
		}

		// Save statistics
		stats.endTime = Date.now();
		stats.duration = ((stats.endTime - stats.startTime) / 1000).toFixed(2);
		fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));

		// Generate recommendations
		const recommendations = generateRecommendations();
		fs.writeFileSync(recommendationsFile, recommendations);

		// Final summary
		log('\n' + '═'.repeat(60));
		log('\n✅ Error Generation Complete!\n');
		log(`📊 Statistics:`);
		log(`   Total Errors: ${stats.totalErrors}`);
		log(`   - TypeScript: ${stats.tscErrors}`);
		log(`   - Svelte: ${stats.svelteErrors}`);
		log(`   Chunks Processed: ${stats.chunksProcessed}`);
		log(`   Duration: ${stats.duration}s\n`);
		log(`📂 Output Files:`);
		log(`   - Errors: ${outputFile}`);
		log(`   - Stats: ${statsFile}`);
		log(`   - Recommendations: ${recommendationsFile}`);
		log(`   - Log: ${logFile}\n`);
		log('═'.repeat(60) + '\n');

		logStream.end();
		process.exit(0);

	} catch (error) {
		log(`\n❌ Error: ${error.message}`);
		logStream.end();
		process.exit(1);
	}
}

main();
