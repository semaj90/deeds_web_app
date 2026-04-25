#!/usr/bin/env node

/**
 * Phase 79: Qdrant Vector Indexing
 *
 * Indexes errors into Qdrant for semantic search:
 * - Generates embeddings via Ollama (embeddinggemma:latest)
 * - Stores in Qdrant collection with metadata
 * - Enables RAG/agentic retrieval of similar errors
 *
 * Usage:
 *   node scripts/error-index-qdrant.mjs --run <runId>
 *   node scripts/error-index-qdrant.mjs --run manual-20251225 --recreate
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const LOGS_DIR = join(ROOT, 'logs', 'errors');

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const COLLECTION_NAME = 'phase79_errors';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const VECTOR_SIZE = 768; // embeddinggemma:latest actual dimension
const EMBEDDING_CACHE_PREFIX = 'emb:phase79:';

// Redis client (lazy init)
let redis = null;
async function getRedis() {
	if (redis) return redis;
	try {
		const { default: Redis } = await import('ioredis');
		redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
		await redis.connect();
		console.log('   📦 Redis connected for embedding cache');
		return redis;
	} catch (e) {
		console.warn('   ⚠️  Redis unavailable, running without cache');
		return null;
	}
}

// Parse CLI args
const args = process.argv.slice(2);
const RUN_ID = args.find(a => a.startsWith('--run='))?.split('=')[1];
const RECREATE = args.includes('--recreate');
const BATCH_SIZE = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '50', 10);

if (!RUN_ID) {
	console.error('❌ Usage: node error-index-qdrant.mjs --run <runId> [--recreate] [--batch 50]');
	process.exit(1);
}

console.log('🔮 Phase 79: Qdrant Vector Indexing\n');
console.log(`   Run ID: ${RUN_ID}`);
console.log(`   Ollama: ${OLLAMA_URL}`);
console.log(`   Qdrant: ${QDRANT_URL}`);
console.log(`   Model: ${EMBEDDING_MODEL}`);
console.log(`   Batch: ${BATCH_SIZE}\n`);

/**
 * Load errors from JSONL
 */
function loadErrors(runId) {
	const runFile = join(LOGS_DIR, `${runId}.jsonl`);
	const lines = readFileSync(runFile, 'utf8').trim().split('\n');
	return lines.map(line => JSON.parse(line));
}

/**
 * Generate embedding via Ollama (with Redis cache)
 */
async function generateEmbedding(text) {
	// Check Redis cache first
	const cacheKey = EMBEDDING_CACHE_PREFIX + createHash('md5').update(text).digest('hex');
	const r = await getRedis();
	if (r) {
		try {
			const cached = await r.get(cacheKey);
			if (cached) {
				return JSON.parse(cached);
			}
		} catch (e) { /* ignore cache errors */ }
	}

	// Call Ollama
	const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
			prompt: text
		})
	});

	if (!response.ok) {
		throw new Error(`Ollama embedding failed: ${response.statusText}`);
	}

	const data = await response.json();
	const embedding = data.embedding;

	// Cache in Redis (24h TTL)
	if (r && embedding) {
		try {
			await r.setex(cacheKey, 86400, JSON.stringify(embedding));
		} catch (e) { /* ignore cache errors */ }
	}

	return embedding;
}

/**
 * Create Qdrant collection
 */
async function createCollection(recreate = false) {
	// Check if collection exists
	const existsRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);

	if (existsRes.ok && !recreate) {
		console.log(`✅ Collection "${COLLECTION_NAME}" already exists\n`);
		return;
	}

	// Delete if recreating
	if (existsRes.ok && recreate) {
		console.log(`🗑️  Deleting existing collection...`);
		await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, { method: 'DELETE' });
	}

	// Create new collection
	console.log(`📦 Creating collection "${COLLECTION_NAME}"...`);
	const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vectors: {
				size: VECTOR_SIZE,
				distance: 'Cosine'
			}
		})
	});

	if (!createRes.ok) {
		throw new Error(`Failed to create collection: ${createRes.statusText}`);
	}

	console.log(`✅ Collection created\n`);
}
/**
 * Format milliseconds to human readable time
 */
function formatTime(ms) {
	if (ms < 1000) return `${ms}ms`;
	const secs = Math.floor(ms / 1000);
	if (secs < 60) return `${secs}s`;
	const mins = Math.floor(secs / 60);
	const remainSecs = secs % 60;
	if (mins < 60) return `${mins}m ${remainSecs}s`;
	const hours = Math.floor(mins / 60);
	const remainMins = mins % 60;
	return `${hours}h ${remainMins}m`;
}

/**
 * Render progress bar
 */
function renderProgress(current, total, startTime, cacheHits = 0) {
	const pct = Math.round((current / total) * 100);
	const filled = Math.round(pct / 2);
	const empty = 50 - filled;
	const bar = '█'.repeat(filled) + '░'.repeat(empty);

	const elapsed = Date.now() - startTime;
	const rate = current / (elapsed / 1000); // items per second
	const remaining = total - current;
	const eta = rate > 0 ? Math.round((remaining / rate) * 1000) : 0;

	const cacheInfo = cacheHits > 0 ? ` | Cache: ${cacheHits}` : '';
	process.stdout.write(`\r   [${bar}] ${pct}% (${current}/${total}) | ETA: ${formatTime(eta)}${cacheInfo}   `);
}

/**
 * Index errors in batches
 */
async function indexErrors(errors, batchSize) {
	console.log(`📊 Indexing ${errors.length} errors in batches of ${batchSize}...\n`);

	let indexed = 0;
	let cacheHits = 0;
	const startTime = Date.now();
	const batches = [];

	// Split into batches
	for (let i = 0; i < errors.length; i += batchSize) {
		batches.push(errors.slice(i, i + batchSize));
	}

	for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
		const batch = batches[batchIdx];

		// Update progress bar
		renderProgress(indexed, errors.length, startTime, cacheHits);

		// Generate embeddings
		const points = [];
		for (const error of batch) {
			const domains = error.domains || [];

			// Create rich text representation for embedding
			const text = [
				`File: ${error.file}`,
				`Rel: ${error.projectRootRel || error.file}`,
				`Error Code: ${error.code}`,
				`Rule: ${error.ruleId || 'unknown'}`,
				`Message: ${error.message}`,
				`Severity: ${error.severity || 'error'}`,
				`Pattern: ${error.patternId}`,
				`Domains: ${domains.join(', ')}`,
				error.snippet ? `Snippet: ${error.snippet}` : ''
			].filter(Boolean).join('\n');

			try {
				const embedding = await generateEmbedding(text);

				const pointId = error.errorId || error.fingerprint || `${RUN_ID}-${batchIdx}-${points.length}`;

				points.push({
					id: pointId,
					vector: embedding,
					payload: {
						errorId: pointId,
						fingerprint: error.fingerprint,
						runId: error.runId,
						commit: error.commit,
						timestamp: error.timestamp,
						file: error.file,
						projectRootRel: error.projectRootRel || error.file,
						line: error.line,
						column: error.column,
						code: error.code,
						ruleId: error.ruleId || error.code,
						severity: error.severity || 'error',
						message: error.message,
						patternId: error.patternId,
						priority: error.priority,
						severityWeight: error.severityWeight,
						domains,
						snippet: error.snippet
					}
				});
			} catch (err) {
				console.warn(`   ⚠️  Failed to embed error ${error.fingerprint}: ${err.message}`);
			}
		}

		// Upsert batch to Qdrant
		if (points.length > 0) {
			const upsertRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ points })
			});

			if (!upsertRes.ok) {
				process.stdout.write(`\n   ❌ Batch ${batchIdx + 1} failed: ${upsertRes.statusText}\n`);
				continue;
			}

			indexed += points.length;
		}
	}

	// Final progress bar
	renderProgress(indexed, errors.length, startTime, cacheHits);

	const elapsed = Date.now() - startTime;
	const rate = (indexed / (elapsed / 1000)).toFixed(1);
	console.log(`\n\n✅ Indexing complete!`);
	console.log(`   📊 Indexed: ${indexed}/${errors.length} errors`);
	console.log(`   ⏱️  Elapsed: ${formatTime(elapsed)}`);
	console.log(`   🚀 Rate: ${rate} errors/sec`);
	if (cacheHits > 0) {
		console.log(`   💾 Cache hits: ${cacheHits}`);
	}
	console.log('');
}

/**
 * Verify indexing
 */
async function verifyIndexing() {
	const infoRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);

	if (!infoRes.ok) {
		throw new Error(`Failed to get collection info: ${infoRes.statusText}`);
	}

	const data = await infoRes.json();
	console.log(`📊 Collection Stats:`);
	console.log(`   Points: ${data.result.points_count}`);
	console.log(`   Vectors: ${data.result.vectors_count}`);
	console.log(`   Status: ${data.result.status}\n`);
}

/**
 * Main execution
 */
async function main() {
	// Load errors
	const errors = loadErrors(RUN_ID);
	console.log(`✅ Loaded ${errors.length} errors\n`);

	// Create collection
	await createCollection(RECREATE);

	// Index errors
	await indexErrors(errors, BATCH_SIZE);

	// Verify
	await verifyIndexing();

	console.log(`✅ Qdrant indexing complete!\n`);
	console.log(`💡 Next steps:`);
	console.log(`   1. node scripts/error-search.mjs --query "database type errors"`);
	console.log(`   2. node scripts/error-search.mjs --query "import issues" --top 10`);
	console.log(`   3. node scripts/phase79-agentic-fixer.mjs --use-rag`);
}

main().catch(error => {
	console.error('❌ Indexing failed:', error.message);
	process.exit(1);
});
