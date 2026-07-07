#!/usr/bin/env node
/**
 * load-autoencoder-weights-to-redis.mjs
 *
 * Load trained autoencoder weights from disk (.npy files) into Redis.
 * This unblocks Phase 3b2.5 (correlation benchmark re-validation).
 *
 * Weights on disk (trained 2026-06-19):
 *   - W_enc_768_128.npy  [128, 768]
 *   - b_enc_128.npy      [128]
 *   - W_enc_128_64.npy   [64, 128]
 *   - b_enc_64.npy       [64]
 *   - W_dec_64_128.npy   [128, 64]
 *   - b_dec_128.npy      [128]
 *   - W_dec_128_768.npy  [768, 128]
 *   - b_dec_768.npy      [768]
 *   - ae_meta.json       metadata (timestamp, epochs, val_loss)
 *
 * Output (Redis hashes):
 *   - ace:autoencoder:weights   {W1, b1, W2, b2}
 *   - ace:autoencoder:meta      {trainedAt, bestLoss, ...}
 *
 * Usage:
 *   node scripts/atlas/load-autoencoder-weights-to-redis.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const MODEL_DIR = path.join(ROOT, 'models', 'autoencoder');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load single .npy file and return Float32Array
 * Simple format: [magic][version][shape][data]
 */
function loadNpy(filePath) {
	const buffer = fs.readFileSync(filePath);
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	// NPY magic: 0x93 'N' 'U' 'M' 'P' 'Y'
	if (view.getUint8(0) !== 0x93 ||
		view.getUint8(1) !== 78 ||  // 'N'
		view.getUint8(2) !== 85 ||  // 'U'
		view.getUint8(3) !== 77 ||  // 'M'
		view.getUint8(4) !== 80 ||  // 'P'
		view.getUint8(5) !== 89) {  // 'Y'
		throw new Error(`Invalid NPY file: ${filePath}`);
	}

	const version = view.getUint8(6);
	let headerLen;
	let dataOffset;

	if (version === 1) {
		headerLen = view.getUint16(8, true);
		dataOffset = 10 + headerLen;
	} else if (version === 3) {
		headerLen = view.getUint32(8, true);
		dataOffset = 12 + headerLen;
	} else {
		throw new Error(`Unsupported NPY version: ${version}`);
	}

	// Remaining bytes are float32 data (assumed little-endian)
	const remaining = buffer.length - dataOffset;
	if (remaining % 4 !== 0) {
		throw new Error(`NPY data not aligned to float32: ${remaining} bytes at offset ${dataOffset}`);
	}

	const count = remaining / 4;
	const floats = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		floats[i] = view.getFloat32(dataOffset + i * 4, true);
	}

	return floats;
}

/**
 * Format Float32Array as CSV string for Redis storage
 */
function serializeWeights(floats) {
	return Array.from(floats).join(',');
}

/**
 * Load all weight files and metadata
 */
async function loadAllWeights() {
	if (VERBOSE) console.log(`📂 Loading weights from ${MODEL_DIR}`);

	// Check files exist
	const requiredFiles = [
		'W_enc_768_128.npy',
		'b_enc_128.npy',
		'W_enc_128_64.npy',
		'b_enc_64.npy',
		'W_dec_64_128.npy',
		'b_dec_128.npy',
		'W_dec_128_768.npy',
		'b_dec_768.npy',
		'ae_meta.json'
	];

	for (const file of requiredFiles) {
		const filePath = path.join(MODEL_DIR, file);
		if (!fs.existsSync(filePath)) {
			throw new Error(`Missing weight file: ${filePath}`);
		}
	}

	// Load .npy files
	const W_enc_768_128 = loadNpy(path.join(MODEL_DIR, 'W_enc_768_128.npy'));
	const b_enc_128 = loadNpy(path.join(MODEL_DIR, 'b_enc_128.npy'));
	const W_enc_128_64 = loadNpy(path.join(MODEL_DIR, 'W_enc_128_64.npy'));
	const b_enc_64 = loadNpy(path.join(MODEL_DIR, 'b_enc_64.npy'));
	const W_dec_64_128 = loadNpy(path.join(MODEL_DIR, 'W_dec_64_128.npy'));
	const b_dec_128 = loadNpy(path.join(MODEL_DIR, 'b_dec_128.npy'));
	const W_dec_128_768 = loadNpy(path.join(MODEL_DIR, 'W_dec_128_768.npy'));
	const b_dec_768 = loadNpy(path.join(MODEL_DIR, 'b_dec_768.npy'));

	// Load metadata
	const metaPath = path.join(MODEL_DIR, 'ae_meta.json');
	const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

	if (VERBOSE) {
		console.log(`✅ Loaded 8 weight files:`);
		console.log(`   W_enc_768_128: ${W_enc_768_128.length} floats (${W_enc_768_128.length * 4} bytes)`);
		console.log(`   b_enc_128: ${b_enc_128.length} floats`);
		console.log(`   W_enc_128_64: ${W_enc_128_64.length} floats`);
		console.log(`   b_enc_64: ${b_enc_64.length} floats`);
		console.log(`   W_dec_64_128: ${W_dec_64_128.length} floats`);
		console.log(`   b_dec_128: ${b_dec_128.length} floats`);
		console.log(`   W_dec_128_768: ${W_dec_128_768.length} floats`);
		console.log(`   b_dec_768: ${b_dec_768.length} floats`);
		console.log(`✅ Loaded metadata: trained ${meta.timestamp}, val_loss=${meta.best_val_loss}`);
	}

	return {
		W1: W_enc_768_128,
		b1: b_enc_128,
		W2: W_enc_128_64,
		b2: b_enc_64,
		W3: W_dec_64_128,
		b3: b_dec_128,
		W4: W_dec_128_768,
		b4: b_dec_768,
		meta
	};
}

/**
 * Write to Redis
 */
async function writeToRedis(weights) {
	const redis = new Redis({
		host: process.env.REDIS_HOST || '127.0.0.1',
		port: parseInt(process.env.REDIS_PORT || '6379'),
		password: process.env.REDIS_PASSWORD || 'redis',
		lazyConnect: true,
		enableOfflineQueue: false,
		retryStrategy: () => null
	});

	try {
		await redis.connect();
		if (VERBOSE) console.log('✅ Connected to Redis');

		if (DRY_RUN) {
			console.log('\n🔍 DRY-RUN: Would write the following to Redis:\n');
			console.log('ace:autoencoder:weights hash:');
			console.log(`  W1: ${weights.W1.length} floats (${serializeWeights(weights.W1).slice(0, 100)}...)`);
			console.log(`  b1: ${weights.b1.length} floats`);
			console.log(`  W2: ${weights.W2.length} floats`);
			console.log(`  b2: ${weights.b2.length} floats`);
			console.log(`  W3: ${weights.W3.length} floats`);
			console.log(`  b3: ${weights.b3.length} floats`);
			console.log(`  W4: ${weights.W4.length} floats`);
			console.log(`  b4: ${weights.b4.length} floats`);

			console.log('\nace:autoencoder:meta hash:');
			console.log(`  trainedAt: ${weights.meta.timestamp}`);
			console.log(`  bestLoss: ${weights.meta.best_val_loss}`);
			console.log(`  epochs: ${weights.meta.epochs_run}`);
			console.log(`  n_train: ${weights.meta.n_train}`);
			console.log(`  n_val: ${weights.meta.n_val}`);

			console.log('\n✅ Dry-run complete. Use --apply to write to Redis.\n');
			return;
		}

		// Write weights hash
		const weightsMap = {
			W1: serializeWeights(weights.W1),
			b1: serializeWeights(weights.b1),
			W2: serializeWeights(weights.W2),
			b2: serializeWeights(weights.b2),
			W3: serializeWeights(weights.W3),
			b3: serializeWeights(weights.b3),
			W4: serializeWeights(weights.W4),
			b4: serializeWeights(weights.b4)
		};

		await redis.del('ace:autoencoder:weights');
		await redis.hset('ace:autoencoder:weights', weightsMap);
		if (VERBOSE) console.log('✅ Wrote ace:autoencoder:weights hash');

		// Write metadata hash
		const metaMap = {
			trainedAt: weights.meta.timestamp,
			bestLoss: weights.meta.best_val_loss.toString(),
			epochs: weights.meta.epochs_run.toString(),
			n_train: weights.meta.n_train.toString(),
			n_val: weights.meta.n_val.toString(),
			cuda: weights.meta.cuda ? 'true' : 'false',
			device: weights.meta.device
		};

		await redis.del('ace:autoencoder:meta');
		await redis.hset('ace:autoencoder:meta', metaMap);
		if (VERBOSE) console.log('✅ Wrote ace:autoencoder:meta hash');

		// Set TTL (24 hours)
		await redis.expire('ace:autoencoder:weights', 86400);
		await redis.expire('ace:autoencoder:meta', 86400);
		if (VERBOSE) console.log('✅ Set TTL: 24 hours');

		// Verify
		const count = await redis.hlen('ace:autoencoder:weights');
		console.log(`\n✅ SUCCESS: Loaded ${count} weight fields into Redis`);
		console.log(`   - ace:autoencoder:weights (hash, 8 fields, TTL 24h)`);
		console.log(`   - ace:autoencoder:meta (hash, 8 fields, TTL 24h)`);
		console.log(`\n🎯 Next: npm run atlas:benchmark:correlation:dry\n`);

	} finally {
		if (redis.isOpen) {
			await redis.quit();
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	console.log('🚀 Phase 3b2.4: Load Autoencoder Weights to Redis\n');

	try {
		const weights = await loadAllWeights();
		await writeToRedis(weights);
	} catch (err) {
		console.error(`\n❌ Error: ${err.message}\n`);
		process.exit(1);
	}
}

main();
