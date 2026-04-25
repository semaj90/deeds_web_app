#!/usr/bin/env node
/**
 * Phase 72 - OPTIMIZED Batch Embedding Generator
 *
 * FEATURES:
 * - Batch size: 2000 errors (vs 100)
 * - CUDA acceleration ready
 * - Comprehensive session logs
 * - Auto-generates copilot.md summaries
 * - Memory-efficient streaming
 * - Resume capability (skips existing vectors)
 *
 * Usage:
 *   node scripts/embed-errors-batch-optimized.mjs --batch 2000 --limit 16436
 *   node scripts/embed-errors-batch-optimized.mjs --cuda  # Use CUDA if available
 */

import { createHash } from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

// Parse arguments
const args = process.argv.slice(2);
const useCuda = args.includes('--cuda');
const batchSize = args.includes('--batch') ? parseInt(args[args.indexOf('--batch') + 1], 10) : 2000;
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 16436;

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'phase72_error_patterns';
const CUDA_SERVICE_URL = process.env.CUDA_SERVICE_URL || 'http://localhost:8099';

// Setup session logging
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const sessionDir = path.join(__dirname, '..', 'phase72_logs', `embedding_${timestamp}`);
fs.mkdirSync(sessionDir, { recursive: true });

const logFile = path.join(sessionDir, 'embedding.log');
const statsFile = path.join(sessionDir, 'embedding_stats.json');
const copilotSummary = path.join(sessionDir, 'copilot_summary.md');

function log(message) {
	const msg = `[${new Date().toISOString()}] ${message}`;
	fs.appendFileSync(logFile, msg + '\n');
	console.log(message);
}

log('\n🚀 Phase 72 - Optimized Batch Embedding Generation\n');
log(`📊 Configuration:`);
log(`   Batch Size: ${batchSize.toLocaleString()} errors`);
log(`   Limit: ${limit.toLocaleString()} errors`);
log(`   CUDA: ${useCuda ? 'ENABLED' : 'DISABLED'}`);
log(`   Model: ${OLLAMA_EMBEDDING_MODEL}`);
log(`   Qdrant: ${QDRANT_COLLECTION}`);
log(`   Session: ${sessionDir}\n`);

const stats = {
	startTime: Date.now(),
	totalErrors: 0,
	totalEmbedded: 0,
	successCount: 0,
	failCount: 0,
	skipCount: 0,
	batchesProcessed: 0,
	errorsByCategory: {},
	avgEmbeddingTime: 0,
	usedCuda: useCuda
};

/**
 * Categorize error
 */
function categorizeError(errorMsg) {
	const msg = (errorMsg || '').toLowerCase();
	if (msg.includes("';' expected")) return 'syntax-semicolon';
	if (msg.includes('declaration or statement expected')) return 'syntax-declaration';
	if (msg.includes('type') && msg.includes('not assignable')) return 'type-mismatch';
	if (msg.includes('cannot find name')) return 'undeclared-identifier';
	if (msg.includes('property') && msg.includes('does not exist')) return 'property-missing';
	if (msg.includes('import') || msg.includes('export')) return 'module-import';
	return 'misc-error';
}

/**
 * Progress bar (TTY-safe)
 */
function drawProgressBar(current, total, label = 'Progress') {
	if (!process.stdout.isTTY || !process.stdout.clearLine) {
		const pct = Math.floor((current / total) * 100);
		if (pct % 10 === 0 && pct > 0) {
			log(`   ${label}: ${pct}% (${current.toLocaleString()}/${total.toLocaleString()})`);
		}
		return;
	}

	const width = 40;
	const pct = Math.min(100, (current / total) * 100);
	const filled = Math.round((width * pct) / 100);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

	process.stdout.clearLine(0);
	process.stdout.cursorTo(0);
	process.stdout.write(`${label}: [${bar}] ${pct.toFixed(1)}% (${current.toLocaleString()}/${total.toLocaleString()})`);
}

/**
 * Generate embedding (with CUDA fallback)
 */
async function generateEmbedding(text) {
	const startTime = Date.now();

	try {
		// Try CUDA service first if enabled
		if (useCuda) {
			try {
				const response = await fetch(`${CUDA_SERVICE_URL}/api/embed`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ text }),
					signal: AbortSignal.timeout(5000)
				});

				if (response.ok) {
					const data = await response.json();
					stats.avgEmbeddingTime += (Date.now() - startTime);
					return data.embedding;
				}
			} catch (cudaError) {
				// Fall back to Ollama
			}
		}

		// Ollama embedding
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_EMBEDDING_MODEL,
				prompt: text
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const data = await response.json();
		stats.avgEmbeddingTime += (Date.now() - startTime);
		return data.embedding;
	} catch (error) {
		log(`⚠️  Embedding failed: ${error.message}`);
		return null;
	}
}

/**
 * Batch insert to Qdrant
 */
async function insertToQdrant(points) {
	try {
		const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ points }),
			signal: AbortSignal.timeout(60000) // 60s for large batches
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
		}

		return await response.json();
	} catch (error) {
		log(`⚠️  Qdrant insert failed: ${error.message}`);
		return null;
	}
}

/**
 * Check if vector exists in Qdrant
 */
async function checkExistingVectors(ids) {
	try {
		const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, with_payload: false, with_vector: false }),
			signal: AbortSignal.timeout(10000)
		});

		if (!response.ok) return new Set();

		const data = await response.json();
		return new Set((data.result || []).map(p => p.id));
	} catch {
		return new Set();
	}
}

/**
 * Generate copilot.md summary
 */
function generateCopilotSummary() {
	const duration = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
	const avgTime = (stats.avgEmbeddingTime / Math.max(1, stats.successCount)).toFixed(0);

	const summary = `# Phase 72 - Embedding Generation Summary

**Session:** ${timestamp}
**Duration:** ${duration} minutes
**Status:** ${stats.failCount === 0 ? '✅ SUCCESS' : '⚠️ PARTIAL SUCCESS'}

## Performance Metrics

| Metric | Value |
|--------|-------|
| Total Errors Processed | ${stats.totalErrors.toLocaleString()} |
| Embeddings Generated | ${stats.successCount.toLocaleString()} |
| Failed | ${stats.failCount.toLocaleString()} |
| Skipped (existing) | ${stats.skipCount.toLocaleString()} |
| Batches Processed | ${stats.batchesProcessed} |
| Avg Time per Embedding | ${avgTime}ms |
| CUDA Acceleration | ${stats.usedCuda ? '✅ Used' : '❌ Not used'} |

## Error Categories

${Object.entries(stats.errorsByCategory)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 10)
	.map(([cat, count]) => `- **${cat}**: ${count.toLocaleString()} errors`)
	.join('\n')}

## Next Steps

1. **Run Smart Fixer:**
   \`\`\`bash
   node scripts/smart-error-fixer-phase72.mjs --batch 100
   \`\`\`

2. **Test Semantic Search:**
   \`\`\`bash
   node scripts/test-error-search.mjs "Cannot find name"
   \`\`\`

3. **Verify Qdrant Collection:**
   \`\`\`bash
   curl ${QDRANT_URL}/collections/${QDRANT_COLLECTION}
   \`\`\`

## Session Files

- **Log:** \`${logFile}\`
- **Stats:** \`${statsFile}\`
- **Errors:** \`reports/latest/errors.jsonl\`

---
*Generated by Phase 72 Optimized Batch Embedding System*
`;

	fs.writeFileSync(copilotSummary, summary);
	log(`\n📝 Copilot summary written to: ${copilotSummary}`);
}

/**
 * Main execution
 */
async function main() {
	try {
		const errorFile = path.join(__dirname, '..', 'reports', 'latest', 'errors.jsonl');
		if (!fs.existsSync(errorFile)) {
			throw new Error(`Error file not found: ${errorFile}\nRun: node scripts/generate-errors-jsonl.mjs --tool both`);
		}

		log(`📖 Loading errors from: ${errorFile}\n`);

		// Load errors
		const errors = [];
		const fileStream = fs.createReadStream(errorFile);
		const rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});

		for await (const line of rl) {
			if (line.trim()) {
				try {
					const error = JSON.parse(line);
					errors.push(error);
					stats.errorsByCategory[error.category || 'uncategorized'] =
						(stats.errorsByCategory[error.category || 'uncategorized'] || 0) + 1;
				} catch (e) {
					// Ignore parse errors
				}
			}
			if (errors.length >= limit) break;
		}

		stats.totalErrors = errors.length;
		log(`✅ Loaded ${errors.length.toLocaleString()} errors\n`);

		// Process in batches
		const totalBatches = Math.ceil(errors.length / batchSize);

		for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
			const batchStart = batchIdx * batchSize;
			const batchEnd = Math.min(batchStart + batchSize, errors.length);
			const batch = errors.slice(batchStart, batchEnd);

			log(`\n📦 Batch ${batchIdx + 1}/${totalBatches}: Processing ${batch.length.toLocaleString()} errors`);

			// Check existing vectors
			const ids = batch.map((err, idx) => `error_${batchStart + idx}`);
			const existing = await checkExistingVectors(ids);

			if (existing.size > 0) {
				log(`   ℹ️  Skipping ${existing.size} existing vectors`);
				stats.skipCount += existing.size;
			}

			// Generate embeddings
			const points = [];
			for (let i = 0; i < batch.length; i++) {
				const error = batch[i];
				const pointId = ids[i];

				if (existing.has(pointId)) {
					continue; // Skip existing
				}

				const text = `Error ${error.code} in ${error.file}:${error.line} - ${error.message}`;
				const embedding = await generateEmbedding(text);

				if (embedding) {
					points.push({
						id: pointId,
						vector: embedding,
						payload: {
							file: error.file,
							line: error.line,
							column: error.column,
							code: error.code,
							message: error.message,
							category: error.category || categorizeError(error.message),
							tool: error.tool || 'tsc',
							severity: error.severity || 'error',
							hash: error.hash || createHash('sha256').update(text).digest('hex').slice(0, 16)
						}
					});

					stats.successCount++;
					drawProgressBar(stats.successCount + stats.skipCount, errors.length, '   Embedding');
				} else {
					stats.failCount++;
				}
			}

			if (points.length > 0) {
				process.stdout.write('\n');
				log(`   💾 Inserting ${points.length.toLocaleString()} vectors to Qdrant...`);

				const result = await insertToQdrant(points);
				if (result) {
					log(`   ✅ Batch ${batchIdx + 1} inserted successfully`);
				} else {
					log(`   ❌ Batch ${batchIdx + 1} insertion failed`);
				}
			}

			stats.batchesProcessed++;

			// Save progress
			fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
		}

		// Final summary
		const duration = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
		stats.avgEmbeddingTime = (stats.avgEmbeddingTime / Math.max(1, stats.successCount)).toFixed(0);

		process.stdout.write('\n\n');
		log('═'.repeat(60));
		log('\n✅ Embedding Generation Complete!\n');
		log(`📊 Results:`);
		log(`   Total Processed: ${stats.totalErrors.toLocaleString()}`);
		log(`   Embedded: ${stats.successCount.toLocaleString()}`);
		log(`   Failed: ${stats.failCount}`);
		log(`   Skipped: ${stats.skipCount}`);
		log(`   Duration: ${duration} minutes`);
		log(`   Avg Time: ${stats.avgEmbeddingTime}ms per embedding\n`);

		// Generate summaries
		fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
		generateCopilotSummary();

		log(`📂 Session files:`);
		log(`   - Stats: ${statsFile}`);
		log(`   - Log: ${logFile}`);
		log(`   - Copilot Summary: ${copilotSummary}\n`);
		log('═'.repeat(60) + '\n');

		process.exit(0);

	} catch (error) {
		log(`\n❌ FATAL ERROR: ${error.message}`);
		log(error.stack);
		process.exit(1);
	}
}

main();
