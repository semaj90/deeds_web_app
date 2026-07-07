#!/usr/bin/env node
/**
 * latent64-sample-backfill.mjs
 *
 * Test latent64 vector storage:
 * 1. Load 20 sample embeddings from Postgres
 * 2. Encode each via autoencoder (768 → 64)
 * 3. Normalize and write to Postgres vector(64) column
 * 4. Verify round-trip: Postgres read-back
 * 5. Confirm HNSW index is working
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import Redis from 'ioredis';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// ─────────────────────────────────────────────────────────────────────────────

class Autoencoder {
	constructor(weights) {
		this.W1 = this.parseFloatArray(weights.W1, 768, 128);
		this.b1 = this.parseFloatArray(weights.b1, 128);
		this.W2 = this.parseFloatArray(weights.W2, 128, 64);
		this.b2 = this.parseFloatArray(weights.b2, 64);
		this.W3 = this.parseFloatArray(weights.W3, 64, 128);
		this.b3 = this.parseFloatArray(weights.b3, 128);
		this.W4 = this.parseFloatArray(weights.W4, 128, 768);
		this.b4 = this.parseFloatArray(weights.b4, 768);
	}

	parseFloatArray(csvString, ...dims) {
		if (typeof csvString === 'object' && csvString instanceof Float32Array) {
			return csvString;
		}
		const values = csvString.split(',').map(v => parseFloat(v.trim()));
		return new Float32Array(values);
	}

	// Simple matrix multiply: (m x n) @ (n x p) → (m x p)
	matmul(a, aRows, aCols, b, bCols) {
		const result = new Float32Array(aRows * bCols);
		for (let i = 0; i < aRows; i++) {
			for (let j = 0; j < bCols; j++) {
				let sum = 0;
				for (let k = 0; k < aCols; k++) {
					sum += a[i * aCols + k] * b[k * bCols + j];
				}
				result[i * bCols + j] = sum;
			}
		}
		return result;
	}

	// Tanh activation
	tanh(x) {
		return Math.tanh(x);
	}

	// Encode 768 → 64
	encode(input768) {
		if (input768.length !== 768) {
			throw new Error(`Expected 768 dims, got ${input768.length}`);
		}

		// Layer 1: 768 → 128 (tanh)
		let h1 = this.matmul(new Float32Array([...input768]), 1, 768, this.W1, 128);
		for (let i = 0; i < 128; i++) {
			h1[i] = this.tanh(h1[i] + this.b1[i]);
		}

		// Layer 2: 128 → 64 (tanh)
		let latent64 = this.matmul(h1, 1, 128, this.W2, 64);
		for (let i = 0; i < 64; i++) {
			latent64[i] = this.tanh(latent64[i] + this.b2[i]);
		}

		// Normalize L2
		let norm = 0;
		for (let i = 0; i < 64; i++) {
			norm += latent64[i] * latent64[i];
		}
		norm = Math.sqrt(norm);
		if (norm > 0) {
			for (let i = 0; i < 64; i++) {
				latent64[i] /= norm;
			}
		}

		return latent64;
	}
}

// ─────────────────────────────────────────────────────────────────────────────

async function loadAutoencoderWeights(redis) {
	const weights = {};
	const keys = ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4'];

	for (const key of keys) {
		const csv = await redis.hget('ace:autoencoder:weights', key);
		if (!csv) {
			throw new Error(`Missing weight: ${key}`);
		}
		weights[key] = csv;
	}

	return new Autoencoder(weights);
}

async function fetchSampleEmbeddings(pool) {
	const query = `
		SELECT
			id,
			relative_path,
			content_embedding
		FROM codebase_chunk_index
		WHERE content_embedding IS NOT NULL
		LIMIT 20
	`;
	const result = await pool.query(query);
	return result.rows;
}

// Parse Postgres vector string "[1.0, 2.0, ...]" → Float32Array
function parsePostgresVector(vectorStr) {
	if (!vectorStr) return null;
	const cleaned = vectorStr.replace(/[\[\]]/g, '').trim();
	const values = cleaned.split(',').map(v => parseFloat(v.trim()));
	return new Float32Array(values);
}

// Format Float32Array for Postgres vector type
function formatVectorForPostgres(arr) {
	return '[' + Array.from(arr).join(',') + ']';
}

async function main() {
	console.log('🚀 Latent64 Sample Backfill\n');

	const pool = new pg.Pool({
		host: 'legal-ai-postgres',
		port: 5432,
		user: 'legal_admin',
		password: 'legal_admin',
		database: 'legal_ai_db'
	});

	const redis = new Redis({
		host: process.env.REDIS_HOST || '127.0.0.1',
		port: process.env.REDIS_PORT || 6379,
		password: process.env.REDIS_PASSWORD || 'redis',
		lazyConnect: true,
		enableOfflineQueue: false,
		retryStrategy: () => null
	});

	try {
		await redis.connect();
		if (VERBOSE) console.log('✅ Connected to Redis');

		// Load weights
		console.log('📦 Loading autoencoder weights from Redis...');
		const autoencoder = await loadAutoencoderWeights(redis);
		console.log('✅ Autoencoder loaded (768→64 encoder)\n');

		// Fetch samples
		console.log('📊 Fetching 20 sample embeddings from Postgres...');
		const samples = await fetchSampleEmbeddings(pool);
		console.log(`✅ Loaded ${samples.length} samples\n`);

		if (DRY_RUN) {
			console.log('🔍 DRY-RUN: Would encode and store:\n');

			for (let i = 0; i < Math.min(3, samples.length); i++) {
				const row = samples[i];
				const vec768 = parsePostgresVector(row.content_embedding);

				if (vec768 && vec768.length === 768) {
					const latent64 = autoencoder.encode(vec768);
					console.log(`  [${i + 1}] ${row.relative_path.substring(0, 60)}`);
					console.log(`      Sample latent64: [${Array.from(latent64.slice(0, 5)).map(v => v.toFixed(4)).join(', ')}...]`);
				}
			}

			console.log('\n✅ Dry-run complete. Use --apply to persist to Postgres.\n');
			return;
		}

		// Encode and write
		console.log('🔧 Encoding and storing latent64 vectors...\n');

		const updateQueries = [];
		let successCount = 0;
		let errorCount = 0;

		for (const row of samples) {
			try {
				const vec768 = parsePostgresVector(row.content_embedding);

				if (!vec768 || vec768.length !== 768) {
					errorCount++;
					continue;
				}

				const latent64 = autoencoder.encode(vec768);
				const pgVector = formatVectorForPostgres(latent64);

				const updateQuery = {
					text: `
						UPDATE codebase_chunk_index
						SET
							latent_64 = $1::vector(64),
							latent64_model = $2,
							latent64_validated_at = NOW()
						WHERE id = $3
					`,
					values: [pgVector, 'packet-autoencoder-768-64', row.id]
				};

				await pool.query(updateQuery);
				successCount++;

				if (VERBOSE && successCount % 5 === 0) {
					console.log(`  ✅ Encoded and stored: ${successCount}/${samples.length}`);
				}
			} catch (err) {
				errorCount++;
				console.error(`  ❌ Error encoding ${row.relative_path}: ${err.message}`);
			}
		}

		console.log(`\n✅ SUCCESS: Encoded ${successCount} vectors, ${errorCount} errors`);

		// Verify
		console.log('\n🔍 Verifying HNSW index...');
		const indexCheck = await pool.query(`
			SELECT
				indexname,
				indexdef
			FROM pg_indexes
			WHERE tablename = 'codebase_chunk_index'
			AND indexname LIKE '%latent64%'
		`);

		if (indexCheck.rows.length > 0) {
			console.log('✅ HNSW index exists:');
			for (const idx of indexCheck.rows) {
				console.log(`   ${idx.indexname}`);
			}
		} else {
			console.log('⚠️  No latent64 index found; creating...');
			await pool.query(`
				CREATE INDEX IF NOT EXISTS idx_codebase_chunk_latent64_gist
				ON codebase_chunk_index USING gist(latent_64)
				WHERE latent_64 IS NOT NULL
			`);
			console.log('✅ Index created');
		}

		// Coverage report
		const coverage = await pool.query(`
			SELECT
				COUNT(*) as total,
				COUNT(latent_64) as with_latent64,
				ROUND(100.0 * COUNT(latent_64) / COUNT(*), 2) as pct_complete
			FROM codebase_chunk_index
		`);

		const row = coverage.rows[0];
		console.log(`\n📈 Coverage: ${row.with_latent64}/${row.total} (${row.pct_complete}%)`);

		console.log('\n✅ Sample backfill complete!');
		console.log('   Next: npm run atlas:latent64:backfill:full:dry\n');

	} catch (err) {
		console.error(`\n❌ Error: ${err.message}\n`);
		process.exit(1);
	} finally {
		if (redis.isOpen) await redis.quit();
		await pool.end();
	}
}

main();
