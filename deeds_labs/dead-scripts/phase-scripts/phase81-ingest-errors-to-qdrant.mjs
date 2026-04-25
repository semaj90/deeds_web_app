#!/usr/bin/env node
/**
 * Phase 81: Ingest TS Errors into Qdrant (Semantic Search)
 *
 * Architecture:
 * - Qdrant: Semantic search (primary ANN) with full payload
 * - embeddinggemma: 768-dimensional embeddings
 * - PostgreSQL: Deferred until auth issue resolved
 *
 * Payload Design:
 * - Qdrant: { id, kind, path, ts_code, message, message_hash, cluster_id, line, col }
 */

import crypto from 'crypto';
import fs from 'fs';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('🧠 Phase 81: Ingesting TS Errors into Qdrant\n');

// Load TSC summary
const summaryPath = path.join(ROOT, 'reports/tsc-summary.json');
if (!fs.existsSync(summaryPath)) {
	console.error('❌ reports/tsc-summary.json not found. Run phase81-tsc-summarize.mjs first');
	process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
console.log(`📊 Total TS errors: ${summary.tsErrorCount}`);
console.log(`📝 Sample errors: ${summary.sample?.length || 0}\n`);

// Configuration
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'phase81_ts_errors';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const BATCH_SIZE = 50;

const ollama = new Ollama({ host: 'http://localhost:11434' });

async function main() {
	// Helper: Generate message hash
	function messageHash(error) {
		return crypto.createHash('sha256')
			.update(`${error.code}:${error.msg}`)
			.digest('hex')
			.slice(0, 16);
	}

	// Helper: Assign cluster ID (simplified - based on error code)
	function assignCluster(error) {
		const codeMap = {
			'TS1005': 'syntax-comma',
			'TS1128': 'syntax-declaration',
			'TS1109': 'syntax-expression',
			'TS2304': 'import-missing',
			'TS2339': 'type-property',
			'TS2345': 'type-argument',
			'TS2322': 'type-assignment'
		};
		return codeMap[error.code] || 'unknown';
	}

// Step 1: Create Qdrant collection
console.log('1️⃣  Creating Qdrant collection...');
try {
	const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vectors: {
				size: 768,
				distance: 'Cosine'
			}
		})
	});

	if (response.ok) {
		console.log(`   ✅ Created collection: ${COLLECTION_NAME}\n`);
	} else {
		const error = await response.json();
		if (error.status?.error?.includes('already exists')) {
			console.log(`   ✅ Collection already exists\n`);
		} else {
			console.error(`   ❌ Failed:`, error);
			process.exit(1);
		}
	}
} catch (error) {
	console.error(`   ❌ Qdrant error:`, error.message);
	process.exit(1);
}

// Step 2: Process errors in batches
console.log('2️⃣  Processing errors...');
const errors = summary.sample || [];
let processed = 0;
let inserted = 0;

for (let i = 0; i < errors.length; i += BATCH_SIZE) {
	const batch = errors.slice(i, i + BATCH_SIZE);

	console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(errors.length / BATCH_SIZE)}...`);

	// Generate embeddings for batch
	const texts = batch.map(e =>
		`TypeScript Error ${e.code} in ${e.file}:${e.line}:${e.col}: ${e.msg}`
	);

	const embeddings = [];
	for (const text of texts) {
		try {
			const response = await ollama.embeddings({
				model: EMBEDDING_MODEL,
				prompt: text
			});
			embeddings.push(response.embedding);
		} catch (error) {
			console.error(`   ⚠️  Embedding failed: ${error.message}`);
			embeddings.push(null);
		}
	}

	// Insert into Qdrant
	const qdrantPoints = [];

	for (let j = 0; j < batch.length; j++) {
		const error = batch[j];
		const embedding = embeddings[j];

		if (!embedding) continue;

		const hash = messageHash(error);
		const cluster = assignCluster(error);

		// Generate unique ID for Qdrant point
		const pointId = inserted + j + 1;

		// Prepare Qdrant point with full payload
		qdrantPoints.push({
			id: pointId,
			vector: embedding,
			payload: {
				kind: 'ts_error',
				path: error.file,
				ts_code: error.code,
				message: error.msg,
				message_hash: hash,
				cluster_id: cluster,
				line: error.line,
				col: error.col
			}
		});
	}

	// Batch insert to Qdrant
	if (qdrantPoints.length > 0) {
		try {
			const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ points: qdrantPoints })
			});

			if (!response.ok) {
				const error = await response.json();
				console.error(`   ⚠️  Qdrant insert failed:`, error);
			} else {
				inserted += qdrantPoints.length;
			}
		} catch (error) {
			console.error(`   ⚠️  Qdrant error:`, error.message);
		}
	}

	processed += batch.length;
	console.log(`   ✅ Processed ${processed}/${errors.length} errors, inserted ${inserted}\n`);
}

// Step 3: Verify
console.log('3️⃣  Verifying insertion...');
try {
	// Check Qdrant
	const qdrantResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
	const qdrantData = await qdrantResponse.json();
	console.log(`   ✅ Qdrant: ${qdrantData.result.points_count} points`);
	console.log('');
} catch (error) {
	console.error(`   ❌ Verification failed:`, error.message);
}

console.log('✅ Phase 81: Error corpus ingestion complete!\n');
console.log('📊 Summary:');
console.log(`   - Processed: ${processed} errors`);
console.log(`   - Inserted: ${inserted} errors`);
console.log(`   - Qdrant collection: ${COLLECTION_NAME}\n`);
console.log('🔍 Next steps:');
console.log(`   - Test search: node scripts/phase81-search-similar-errors.mjs`);
console.log(`   - View in Qdrant: http://localhost:6333/dashboard#/collections/${COLLECTION_NAME}\n`);
}

main().catch(error => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
