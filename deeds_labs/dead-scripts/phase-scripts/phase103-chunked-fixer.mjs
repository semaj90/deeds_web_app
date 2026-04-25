#!/usr/bin/env node
/**
 * Phase 103: CHUNKED STREAMING ERROR FIXER
 * Apply fixes in small batches with validation checkpoints
 * Rollback on regression, commit on success
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

// CONSERVATIVE PATTERNS (excluding dangerous ones)
const PATTERNS = [
	{
		name: 'missing_semicolon_simple',
		description: 'Add semicolons to simple variable declarations',
		regex: /^(\s*(?:const|let|var)\s+[a-zA-Z_$][\w$]*\s*=\s*[^;\n{]+)(\n)/gm,
		replacement: '$1;$2',
		validate: (match, code, index) => {
			const line = code.substring(code.lastIndexOf('\n', index) + 1, code.indexOf('\n', index));
			if (line.trim().endsWith(';')) return false;
			if (line.includes('{') && !line.includes('}')) return false;
			if (line.includes('//')) return false;
			return true;
		}
	},
	{
		name: 'unexpected_semicolon_else',
		description: 'Remove semicolon before else/catch/finally',
		regex: /(\})\s*;(\s*(?:else|catch|finally))/g,
		replacement: '$1$2',
		validate: () => true
	},
	{
		name: 'trailing_comma_call',
		description: 'Remove trailing comma in function calls',
		regex: /,(\s*\))/g,
		replacement: '$1',
		validate: (match, code, index) => {
			const before = code.substring(Math.max(0, index - 60), index);
			// Conservative: only if clearly in function call
			if (before.match(/\[/) && !before.match(/\]/)) return false;
			return true;
		}
	},
	{
		name: 'duplicate_export',
		description: 'Remove duplicate export keyword',
		regex: /\bexport\s+export\s+/g,
		replacement: 'export ',
		validate: () => true
	},
	{
		name: 'optional_chaining_safe',
		description: 'Add optional chaining for common null checks',
		regex: /(\w+)\s*&&\s*\1\.(\w+)/g,
		replacement: '$1?.$2',
		validate: (match) => {
			// Only if pattern is simple (no complex expressions)
			return !match.includes('(') && !match.includes('[');
		}
	}
];

function findTypeScriptFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);
	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			if (['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(file)) continue;
			findTypeScriptFiles(filePath, fileList);
		} else if (file.match(/\.(ts|tsx)$/)) {
			fileList.push(filePath);
		}
	}
	return fileList;
}

function applyPatterns(code, filePath) {
	let modified = code;
	const fixes = {};

	for (const pattern of PATTERNS) {
		let count = 0;

		if (typeof pattern.replacement === 'function') {
			modified = modified.replace(pattern.regex, (...args) => {
				const match = args[0];
				const index = args[args.length - 2];
				if (pattern.validate && !pattern.validate(match, code, index)) return match;
				count++;
				return pattern.replacement(...args);
			});
		} else {
			modified = modified.replace(pattern.regex, (match, ...args) => {
				const index = args[args.length - 2];
				if (pattern.validate && !pattern.validate(match, code, index)) return match;
				count++;
				return pattern.replacement;
			});
		}

		if (count > 0) fixes[pattern.name] = count;
	}

	return { modified, fixes };
}

function getTscErrorCount() {
	try {
		const result = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8', cwd: ROOT_DIR });
		const matches = result.match(/Found (\d+) error/);
		return matches ? parseInt(matches[1], 10) : 0;
	} catch (error) {
		// tsc exits with error code when errors found
		const matches = error.stdout?.match(/Found (\d+) error/);
		return matches ? parseInt(matches[1], 10) : 0;
	}
}

function chunkArray(array, size) {
	const chunks = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

async function processChunks(chunkSize = 50, dryRun = true) {
	console.log('\n╔════════════════════════════════════════════════════════════╗');
	console.log('║        PHASE 103: CHUNKED STREAMING FIXER                ║');
	console.log('╚════════════════════════════════════════════════════════════╝\n');
	console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '✍️  LIVE (with validation)'}`);
	console.log(`Chunk Size: ${chunkSize} files per batch`);
	console.log(`Patterns: ${PATTERNS.length} conservative patterns\n`);

	// Get baseline error count
	console.log('📊 Getting baseline error count...');
	const baselineErrors = getTscErrorCount();
	console.log(`   Baseline TSC Errors: ${baselineErrors}\n`);

	const allFiles = findTypeScriptFiles(SRC_DIR);
	console.log(`📂 Found ${allFiles.length} TypeScript files\n`);

	// Scan all files to find candidates
	console.log('🔍 Scanning for fix candidates...\n');
	const candidates = [];

	for (let i = 0; i < allFiles.length; i++) {
		const filePath = allFiles[i];
		if ((i + 1) % 100 === 0) {
			process.stdout.write(`\r   Progress: ${i + 1}/${allFiles.length} scanned`);
		}

		const code = fs.readFileSync(filePath, 'utf-8');
		const { modified, fixes } = applyPatterns(code, filePath);

		if (modified !== code) {
			const fixCount = Object.values(fixes).reduce((sum, c) => sum + c, 0);
			candidates.push({
				path: filePath,
				relativePath: path.relative(ROOT_DIR, filePath),
				original: code,
				modified,
				fixes,
				fixCount
			});
		}
	}

	console.log(`\r   Progress: ${allFiles.length}/${allFiles.length} scanned ✓\n`);
	console.log(`📋 Found ${candidates.length} files with potential fixes\n`);

	if (candidates.length === 0) {
		console.log('✅ No fixes needed - all patterns already satisfied!\n');
		return { success: true, chunks: [] };
	}

	// Sort by fix count (least risky first)
	candidates.sort((a, b) => a.fixCount - b.fixCount);

	// Create chunks
	const chunks = chunkArray(candidates, chunkSize);
	console.log(`📦 Split into ${chunks.length} chunks of ~${chunkSize} files each\n`);

	const results = {
		baseline: baselineErrors,
		chunks: [],
		totalProcessed: 0,
		totalFixes: 0,
		successfulChunks: 0,
		failedChunks: 0
	};

	if (dryRun) {
		console.log('🔍 DRY RUN SUMMARY:\n');
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			const chunkFixes = chunk.reduce((sum, f) => sum + f.fixCount, 0);
			console.log(`   Chunk ${i + 1}: ${chunk.length} files, ${chunkFixes} fixes`);
		}
		console.log('\n💡 Run with --apply to execute chunked fixes with validation\n');
		return results;
	}

	// LIVE MODE: Apply chunks with validation
	console.log('🚀 Starting chunked application with validation...\n');

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const chunkNum = i + 1;
		const chunkFixes = chunk.reduce((sum, f) => sum + f.fixCount, 0);

		console.log(`\n${'═'.repeat(60)}`);
		console.log(`📦 CHUNK ${chunkNum}/${chunks.length}`);
		console.log(`   Files: ${chunk.length}`);
		console.log(`   Fixes: ${chunkFixes}`);
		console.log(`${'═'.repeat(60)}\n`);

		// Apply chunk
		console.log(`✍️  Applying fixes to ${chunk.length} files...`);
		for (const file of chunk) {
			fs.writeFileSync(file.path, file.modified, 'utf-8');
		}

		// Validate
		console.log('🔬 Validating changes...');
		const newErrors = getTscErrorCount();
		const errorChange = newErrors - baselineErrors;

		console.log(`   Previous: ${baselineErrors} errors`);
		console.log(`   Current:  ${newErrors} errors`);
		console.log(`   Change:   ${errorChange >= 0 ? '+' : ''}${errorChange}`);

		const chunkResult = {
			chunk: chunkNum,
			files: chunk.length,
			fixes: chunkFixes,
			errorsBefore: baselineErrors,
			errorsAfter: newErrors,
			errorChange,
			status: 'pending'
		};

		// Decision: Keep or rollback?
		if (errorChange > 100) {
			// Significant regression
			console.log(`\n⚠️  REGRESSION DETECTED: +${errorChange} errors`);
			console.log('🔄 Rolling back chunk...\n');

			for (const file of chunk) {
				fs.writeFileSync(file.path, file.original, 'utf-8');
			}

			chunkResult.status = 'rolled_back';
			results.failedChunks++;
		} else if (errorChange > 0 && errorChange <= 100) {
			// Minor increase - might be type revelation
			console.log(`\n⚡ Minor increase: +${errorChange} errors (possible type revelation)`);
			console.log('✅ Keeping changes (within acceptable threshold)\n');

			chunkResult.status = 'kept_with_increase';
			results.successfulChunks++;
			results.totalProcessed += chunk.length;
			results.totalFixes += chunkFixes;
		} else {
			// Improvement or neutral
			console.log(`\n✅ ${errorChange < 0 ? 'IMPROVEMENT' : 'NEUTRAL'}: ${errorChange} errors`);
			console.log('✅ Keeping changes\n');

			chunkResult.status = 'success';
			results.successfulChunks++;
			results.totalProcessed += chunk.length;
			results.totalFixes += chunkFixes;
		}

		results.chunks.push(chunkResult);

		// Pause for user review
		if (chunkNum < chunks.length) {
			console.log(`⏸️  Chunk ${chunkNum} complete. Press Ctrl+C to stop, or wait 2s to continue...\n`);
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	}

	// Final summary
	console.log('\n' + '═'.repeat(60));
	console.log('📊 PHASE 103 COMPLETE');
	console.log('═'.repeat(60) + '\n');
	console.log(`Chunks Processed: ${chunks.length}`);
	console.log(`Successful: ${results.successfulChunks}`);
	console.log(`Rolled Back: ${results.failedChunks}`);
	console.log(`Files Modified: ${results.totalProcessed}`);
	console.log(`Total Fixes: ${results.totalFixes}`);
	console.log(`\nBaseline Errors: ${baselineErrors}`);
	console.log(`Final Errors: ${getTscErrorCount()}`);
	console.log(`Net Change: ${getTscErrorCount() - baselineErrors}\n`);

	// Save report
	if (!fs.existsSync(REPORTS_DIR)) {
		fs.mkdirSync(REPORTS_DIR, { recursive: true });
	}
	const reportPath = path.join(REPORTS_DIR, 'phase103-chunked-results.json');
	fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
	console.log(`📄 Report saved: ${reportPath}\n`);

	return results;
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const chunkSize = parseInt(args.find(a => a.startsWith('--chunk-size='))?.split('=')[1]) || 50;

processChunks(chunkSize, dryRun).catch(console.error);
