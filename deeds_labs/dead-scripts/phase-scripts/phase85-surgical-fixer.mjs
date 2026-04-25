#!/usr/bin/env node
/**
 * Phase 85 Surgical Fixer
 *
 * Methodology:
 * 1. Target top 10 error-dense files
 * 2. Fix ONLY the first TS error in each file
 * 3. Re-measure TSC baseline after each fix
 * 4. Repeat until file drops from Top 10
 *
 * Pattern Sources:
 * - Phase 85 knowledge base (Qdrant)
 * - Semantic error search results
 * - Manual surgical patterns
 */

import { spawn } from 'child_process';
import fs from 'fs';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const QDRANT_URL = 'http://localhost:6333';
const KNOWLEDGE_COLLECTION = 'phase72_ast_knowledge_base';
const EMBEDDING_MODEL = 'embeddinggemma:latest';

const ollama = new Ollama({ host: 'http://localhost:11434' });

console.log('🔧 Phase 85: Surgical Error Fixer\n');

// Load current TSC summary
const summaryPath = path.join(ROOT, 'reports/tsc-summary.json');
if (!fs.existsSync(summaryPath)) {
	console.error('❌ reports/tsc-summary.json not found. Run phase81-tsc-summarize.mjs first');
	process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const topFiles = summary.topFiles || [];

console.log(`📊 Current baseline: ${summary.tsErrorCount} errors`);
console.log(`📁 Top 10 error-dense files:\n`);

topFiles.slice(0, 10).forEach((file, i) => {
	const fileName = file.key || file.file;
	const errorCount = file.count;
	console.log(`   ${i + 1}. ${fileName} (${errorCount} errors)`);
});
console.log('');

// Surgical fix patterns (from Phase 85 knowledge)
const SURGICAL_PATTERNS = [
	{
		name: 'Object Spread Comma',
		pattern: /\{\s*\.\.\.(\w+):\s*(\w+)/g,
		replacement: '{ ...$1, $2',
		description: 'Fix { ...obj: prop } → { ...obj, prop }'
	},
	{
		name: 'Method Signature Comma',
		pattern: /(\w+)\(([^)]+)\),\s*(\w+):/g,
		replacement: '$1($2, $3:',
		description: 'Fix method(param), type: ReturnType → method(param, type: ReturnType'
	},
	{
		name: 'Ternary Semicolon',
		pattern: /\?\s*([^;:]+);\s*:/g,
		replacement: '? $1 :',
		description: 'Fix x ? value; : fallback → x ? value : fallback'
	},
	{
		name: 'Arrow Function Semicolon',
		pattern: /=>\s*([^;{]+);\s*$/gm,
		replacement: '=> $1',
		description: 'Fix (x) => expr; → (x) => expr'
	},
	{
		name: 'Missing Comma in Object',
		pattern: /(\w+):\s*([^,}\n]+)\s+(\w+):/g,
		replacement: '$1: $2, $3:',
		description: 'Fix { a: 1 b: 2 } → { a: 1, b: 2 }'
	}
];

async function getFirstError(filePath) {
	return new Promise((resolve, reject) => {
		const tsc = spawn('npx', ['tsc', '--noEmit', filePath], {
			cwd: ROOT,
			shell: true
		});

		let output = '';
		tsc.stdout.on('data', data => output += data.toString());
		tsc.stderr.on('data', data => output += data.toString());

		tsc.on('close', () => {
			const lines = output.split('\n');
			const errorPattern = /^(.+)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

			for (const line of lines) {
				const match = line.match(errorPattern);
				if (match) {
					resolve({
						file: match[1],
						line: parseInt(match[2]),
						col: parseInt(match[3]),
						code: match[4],
						msg: match[5]
					});
					return;
				}
			}
			resolve(null);
		});

		tsc.on('error', reject);
	});
}

async function readFileContext(filePath, line, contextLines = 15) {
	const fullPath = path.join(ROOT, filePath);
	if (!fs.existsSync(fullPath)) return null;

	const content = fs.readFileSync(fullPath, 'utf8');
	const lines = content.split('\n');

	const start = Math.max(0, line - contextLines);
	const end = Math.min(lines.length, line + contextLines);

	return {
		fullContent: content,
		lines: lines.slice(start, end),
		startLine: start + 1,
		endLine: end + 1,
		errorLine: line
	};
}

async function searchKnowledgeForFix(errorMsg) {
	console.log('   🔍 Searching Phase 85 knowledge...');

	const response = await ollama.embeddings({
		model: EMBEDDING_MODEL,
		prompt: `Fix TypeScript error: ${errorMsg}`
	});

	const searchResponse = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: response.embedding,
			limit: 3,
			with_payload: true
		})
	});

	const data = await searchResponse.json();
	return data.result || [];
}

async function applySurgicalFix(filePath, error, context) {
	console.log(`\n   📝 Error at ${filePath}:${error.line}:${error.col}`);
	console.log(`   Code: ${error.code}`);
	console.log(`   Message: ${error.msg}\n`);

	// Show context
	console.log('   Context:');
	context.lines.forEach((line, i) => {
		const lineNum = context.startLine + i;
		const marker = lineNum === error.line ? '→' : ' ';
		console.log(`   ${marker} ${lineNum.toString().padStart(4, ' ')} | ${line}`);
	});
	console.log('');

	// Search for matching pattern
	const knowledgeResults = await searchKnowledgeForFix(error.msg);

	if (knowledgeResults.length > 0) {
		console.log('   💡 Knowledge base suggestions:');
		knowledgeResults.forEach((hit, i) => {
			const p = hit.payload;
			console.log(`      ${i + 1}. ${p.category || 'Fix'} (score: ${hit.score.toFixed(4)})`);
			console.log(`         ${p.text?.substring(0, 80) || p.content?.substring(0, 80)}...\n`);
		});
	}

	// Try surgical patterns
	let fixed = false;
	const fullPath = path.join(ROOT, filePath);

	for (const pattern of SURGICAL_PATTERNS) {
		const content = context.fullContent;
		const newContent = content.replace(pattern.pattern, pattern.replacement);

		if (newContent !== content) {
			console.log(`   ✅ Applied pattern: ${pattern.name}`);
			console.log(`      ${pattern.description}\n`);

			fs.writeFileSync(fullPath, newContent, 'utf8');
			fixed = true;
			break;
		}
	}

	if (!fixed) {
		console.log('   ⚠️  No matching pattern found - manual intervention needed\n');
	}

	return fixed;
}

async function runTSCBaseline() {
	return new Promise((resolve, reject) => {
		const tsc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
			cwd: ROOT,
			shell: true,
			maxBuffer: 50 * 1024 * 1024
		});

		let output = '';
		tsc.stdout.on('data', data => output += data.toString());
		tsc.stderr.on('data', data => output += data.toString());

		tsc.on('close', () => {
			const errorPattern = /^(.+)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
			const errors = output.split('\n')
				.filter(line => errorPattern.test(line))
				.length;
			resolve(errors);
		});

		tsc.on('error', reject);
	});
}

async function surgicalFixRound(fileIndex) {
	const targetFile = topFiles[fileIndex];
	if (!targetFile) {
		console.log('✅ All top 10 files processed!\n');
		return false;
	}

	const filePath = targetFile.key || targetFile.file;
	const errorCount = targetFile.count;

	console.log(`\n${'='.repeat(80)}`);
	console.log(`Round ${fileIndex + 1}: ${filePath} (${errorCount} errors)`);
	console.log('='.repeat(80));

	// Get first error in file
	const firstError = await getFirstError(filePath);

	if (!firstError) {
		console.log('   ✅ No errors found in this file (may have been fixed)\n');
		return true; // Move to next file
	}

	// Read context
	const context = await readFileContext(filePath, firstError.line);

	if (!context) {
		console.log('   ❌ Could not read file context\n');
		return true; // Move to next file
	}

	// Apply surgical fix
	const fixed = await applySurgicalFix(filePath, firstError, context);

	if (fixed) {
		// Re-measure baseline
		console.log('   🔄 Re-measuring TSC baseline...');
		const newErrorCount = await runTSCBaseline();
		const reduction = summary.tsErrorCount - newErrorCount;

		console.log(`   📊 Baseline: ${summary.tsErrorCount} → ${newErrorCount} (${reduction >= 0 ? '-' : '+'}${Math.abs(reduction)} errors)\n`);

		// Update summary
		summary.tsErrorCount = newErrorCount;
		fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
	}

	return true; // Continue to next round
}

async function main() {
	const targetFiles = parseInt(process.argv[2]) || 10;
	const maxRounds = parseInt(process.argv[3]) || 20;

	console.log(`🎯 Target: Fix first error in top ${targetFiles} files`);
	console.log(`🔄 Max rounds: ${maxRounds}\n`);

	let round = 0;
	let fileIndex = 0;

	while (round < maxRounds && fileIndex < targetFiles) {
		const shouldContinue = await surgicalFixRound(fileIndex);

		if (!shouldContinue) break;

		fileIndex++;
		round++;

		// Small delay to prevent overwhelming the system
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	console.log('\n' + '='.repeat(80));
	console.log('📊 Phase 85 Surgical Fixing Complete');
	console.log('='.repeat(80));

	// Final baseline
	console.log('\n🔄 Running final TSC baseline...');
	const finalCount = await runTSCBaseline();

	console.log(`\n✅ Final Results:`);
	console.log(`   Initial: ${topFiles.reduce((sum, f) => sum + f.count, 0)} errors in top ${targetFiles} files`);
	console.log(`   Final baseline: ${finalCount} total errors`);
	console.log(`   Rounds completed: ${round}\n`);

	console.log('🔍 Next steps:');
	console.log('   1. Review changes: git diff');
	console.log('   2. Update baseline: node scripts/phase81-tsc-summarize.mjs');
	console.log('   3. Continue surgical fixes or move to Wave 2 (import hygiene)\n');
}

main().catch(error => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
