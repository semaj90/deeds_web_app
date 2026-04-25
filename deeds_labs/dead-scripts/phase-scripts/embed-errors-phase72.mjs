#!/usr/bin/env node
/**
 * Generate Embeddings for Phase 72 TypeScript Errors
 *
 * Processes all 16,444 TypeScript errors through embeddinggemma:latest
 * - Batch processing (100 errors at a time)
 * - Auto-tagging by error category
 * - Stores vectors to Qdrant collection
 * - Monitors progress and provides statistics
 *
 * Usage: node embed-errors-phase72.mjs [--batch 100] [--limit 1000]
 */

import { createHash } from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Load .env.phase72
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

// Configuration from environment
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'phase72_error_patterns';
let BATCH_SIZE = parseInt(process.env.PHASE72_BATCH_SIZE || '100', 10);

// Parse arguments
const args = process.argv.slice(2);
let limit = 16444;
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--limit' && args[i + 1]) {
		limit = parseInt(args[i + 1], 10);
	}
	if (args[i] === '--batch' && args[i + 1]) {
		BATCH_SIZE = parseInt(args[i + 1], 10);
	}
}

console.log('\n🧠 Phase 72 - Generating Error Embeddings\n');
console.log(`📝 Configuration:`);
console.log(`   OLLAMA_URL: ${OLLAMA_URL}`);
console.log(`   Embedding Model: ${OLLAMA_EMBEDDING_MODEL}`);
console.log(`   Qdrant Collection: ${QDRANT_COLLECTION}`);
console.log(`   Batch Size: ${BATCH_SIZE}`);
console.log(`   Limit: ${limit} errors\n`);

/**
 * Categorize error by message pattern
 */
function categorizeError(errorMsg) {
	const msg = (errorMsg || '').toLowerCase();

	if (msg.includes('semicolon') || msg.includes(';')) return 'syntax-semicolon';
	if (msg.includes('type')) return 'type-error';
	if (msg.includes('import') || msg.includes('export')) return 'module-import';
	if (msg.includes('expected')) return 'syntax-expected';
	if (msg.includes('cannot find')) return 'resolution-error';
	if (msg.includes('declared')) return 'declaration-error';
	if (msg.includes('return')) return 'return-type';
	if (msg.includes('property')) return 'property-access';
	if (msg.includes('generic')) return 'generic-type';
	if (msg.includes('union')) return 'union-type';

	return 'misc-error';
}

/**
 * Draw progress bar
 */
function drawProgressBar(current, total, startTime) {
	const width = 30;
	const percentage = Math.min(100, (current / total) * 100);
	const progress = Math.round((width * percentage) / 100);
	const empty = width - progress;
	const bar = '█'.repeat(progress) + '░'.repeat(empty);

	const elapsed = (Date.now() - startTime) / 1000;
	const rate = current > 0 ? current / elapsed : 0;
	const remaining = rate > 0 ? (total - current) / rate : 0;
	const eta = remaining > 0 ? `${remaining.toFixed(0)}s` : '0s';

	process.stdout.write(`\r[${bar}] ${percentage.toFixed(1)}% | ETA: ${eta} | ${current}/${total} `);
}

/**
 * Generate embedding for text via Ollama
 */
async function generateEmbedding(text) {
	try {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_EMBEDDING_MODEL,
				prompt: text
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!response.ok) {
			// If 404, maybe model not found, try pulling?
			// Or maybe context length exceeded?
			// Just return null for now to keep going
			return null;
		}

		const data = await response.json();
		return data.embedding;
	} catch (error) {
		// console.warn(`⚠️  Embedding generation failed: ${error.message}`);
		return null;
	}
}

/**
 * Generate error signature for deduplication
 */
function computeErrorSignature(error) {
	const normalized = (error.message || '')
		.replace(/\((\d+),(\d+)\)/g, '(X,Y)')
		.replace(/\d+/g, 'N')
		.toLowerCase();

	return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Batch insert points to Qdrant
 */
async function insertToQdrant(points) {
	try {
		const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				points: points
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.warn(`⚠️  Qdrant insert failed: ${error.message}`);
		return null;
	}
}

/**
 * Main embedding generation loop
 */
async function generateEmbeddings() {
	try {
		const errorFile = path.join(__dirname, '..', 'reports', 'latest', 'errors.jsonl');
		if (!fs.existsSync(errorFile)) {
			throw new Error(`Error file not found: ${errorFile}`);
		}

		console.log(`📖 Reading errors from: ${errorFile}`);

		const errors = [];
		const fileStream = fs.createReadStream(errorFile);
		const rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});

		for await (const line of rl) {
			if (line.trim()) {
				try {
					errors.push(JSON.parse(line));
				} catch (e) {
					// Ignore parse errors
				}
			}
			if (errors.length >= limit) break;
		}

		console.log(`📊 Processing ${errors.length} errors in batches of ${BATCH_SIZE}\n`);

		let totalEmbedded = 0;
		let successCount = 0;
		let failCount = 0;
		const startTime = Date.now();

		// Process in batches
		for (let batchStart = 0; batchStart < errors.length; batchStart += BATCH_SIZE) {
			const batchEnd = Math.min(batchStart + BATCH_SIZE, errors.length);
			const batch = errors.slice(batchStart, batchEnd);

			console.log(`\n⏳ Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: Processing ${batch.length} errors...`);

			const points = [];
			let batchSuccess = 0;

			// Generate embeddings for each error
			for (let i = 0; i < batch.length; i++) {
				const error = batch[i];
				const errorText = `${error.message} in ${error.file}:${error.line}`;

				// Generate embedding
				const embedding = await generateEmbedding(errorText);

				if (embedding && embedding.length === 768) {
					const category = categorizeError(error.message);
					const sig = computeErrorSignature(error);

					points.push({
						id: totalEmbedded + i,
						vector: embedding,
						payload: {
							file: error.file,
							line: error.line,
							error_code: error.code,
							message: error.message,
							category: category,
							severity: error.severity || 'error',
							auto_tag: category,
							kag_hit: false,
							verified: false,
							signature: sig,
							tool: error.tool || 'tsc'
						}
					});

					batchSuccess++;
				} else {
					failCount++;
				}

				// Update progress bar
				drawProgressBar(totalEmbedded + i + 1, errors.length, startTime);

				// Small delay to avoid rate limiting
				if (i % 10 === 9) {
					await new Promise(resolve => setTimeout(resolve, 20));
				}
			}

			console.log(`\n   ✅ Generated ${batchSuccess} embeddings (${batch.length - batchSuccess} failed)`);

			// Insert batch to Qdrant
			if (points.length > 0) {
				console.log(`   📤 Inserting ${points.length} points to Qdrant...`);

				const result = await insertToQdrant(points);
				if (result) {
					successCount += points.length;
					console.log(`   ✅ Batch inserted successfully`);
				} else {
					failCount += points.length;
					console.log(`   ❌ Batch insertion failed`);
				}
			}

			totalEmbedded += batch.length;

			// Force GC if available
			if (global.gc) {
				global.gc();
			}
		}

		const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

		console.log(`\n📊 Embedding Generation Complete\n`);
		console.log(`   Total Processed: ${totalEmbedded}`);
		console.log(`   Successfully Embedded: ${successCount}`);
		console.log(`   Failed: ${failCount}`);
		console.log(`   Success Rate: ${((successCount / totalEmbedded) * 100).toFixed(1)}%`);
		console.log(`   Total Time: ${elapsedTime}s`);
		console.log(`   Avg Time/Error: ${((elapsedTime * 1000) / totalEmbedded).toFixed(2)}ms\n`);

		console.log(`🎉 Embeddings ready for vector search!\n`);
		console.log(`📍 Next steps:`);
		console.log(`   1. Run: npm run phase72:verify-embeddings`);
		console.log(`   2. Run: npm run phase72:fix-batch`);
		console.log(`   3. Monitor: npm run phase72:stats\n`);

	} catch (error) {
		console.error(`\n❌ Error during embedding generation:`);
		console.error(`   ${error.message}\n`);
		process.exit(1);
	}
}

generateEmbeddings().catch(console.error);
