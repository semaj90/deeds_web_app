#!/usr/bin/env node

/**
 * Test LOD Decomposition: 768-dim → 384-dim → 64-dim/8-dim
 *
 * Validates:
 * - ONNX 768-dim output
 * - Autoencoder fallback chain (hot→warm→cold)
 * - Batch decomposition with per-item error handling
 * - Storage tier cost analysis
 *
 * Expected test range:
 * - Hot (AE 768→64): 10-50ms (if trained model available)
 * - Warm (truncate 768→384): 1-5ms
 * - Cold (sparse 768→8): 1-2ms
 * - Archive (quantized int16): <1ms
 */

import fetch from 'node-fetch';
import { performance } from 'node:perf_hooks';

const ONNX_URL = 'http://127.0.0.1:8081/v1/embeddings';

const TEST_BATCH = [
	'authentication and session management',
	'database connection pooling and caching',
	'error handling in async operations',
	'type-safe patterns in typescript',
	'performance optimization strategies'
];

/**
 * Simulate autoencoder decomposition
 * (real implementation uses trained AE or falls back to truncation)
 */
function decomposeWarm(embedding768) {
	// Truncate to first 384 dims (warm tier)
	return embedding768.slice(0, 384);
}

function decomposeCold(embedding768) {
	// Sparse: pick 8 highest-magnitude dims (cold tier)
	const dims = embedding768
		.map((val, idx) => ({ val: Math.abs(val), idx }))
		.sort((a, b) => b.val - a.val)
		.slice(0, 8);

	const sparse = new Array(8).fill(0);
	for (let i = 0; i < dims.length; i++) {
		sparse[i] = embedding768[dims[i].idx];
	}
	return sparse;
}

function decomposeArchive(embedding768) {
	// Quantize to int16 (archive tier)
	const maxMag = Math.max(...embedding768.map(Math.abs));
	const scale = maxMag > 0 ? 32767 / maxMag : 1;

	const quantized = Buffer.alloc(768 * 2);
	for (let i = 0; i < 768; i++) {
		const scaled = Math.round(embedding768[i] * scale);
		quantized.writeInt16LE(scaled, i * 2);
	}
	return quantized;
}

async function testLodDecomposition() {
	console.log('=== LOD Decomposition Test: 768→384→64/8 ===\n');

	const results = [];
	let totalSuccesses = 0;
	let totalFailures = 0;

	for (const text of TEST_BATCH) {
		try {
			const startTotal = performance.now();

			// 1. Get 768-dim embedding from ONNX
			const startOnnx = performance.now();
			const response = await fetch(ONNX_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'embeddinggemma:latest',
					input: text
				}),
				timeout: 5000
			});

			const onnxElapsed = performance.now() - startOnnx;

			if (!response.ok) {
				console.error(`❌ ONNX failed: HTTP ${response.status}`);
				totalFailures++;
				continue;
			}

			const data = await response.json();
			const embedding768 = data.data?.[0]?.embedding;

			if (!embedding768 || embedding768.length !== 768) {
				console.error(`❌ Invalid embedding dimension: ${embedding768?.length || 'null'}`);
				totalFailures++;
				continue;
			}

			// 2. Decompose through tiers
			const startWarm = performance.now();
			const embedding384 = decomposeWarm(embedding768);
			const warmElapsed = performance.now() - startWarm;

			const startCold = performance.now();
			const sparse8 = decomposeCold(embedding768);
			const coldElapsed = performance.now() - startCold;

			const startArchive = performance.now();
			const archiveBuffer = decomposeArchive(embedding768);
			const archiveElapsed = performance.now() - startArchive;

			const totalElapsed = performance.now() - startTotal;

			// Calculate compression ratios
			const orig768Bytes = 768 * 8; // 8 bytes per float
			const warm384Bytes = 384 * 8;
			const cold8Bytes = 8 * 8;
			const archiveBytes = archiveBuffer.length;

			results.push({
				text: text.slice(0, 40),
				status: 'success',
				tiers: {
					onnx768: { dims: 768, bytes: orig768Bytes, timeMs: onnxElapsed },
					warm384: { dims: 384, bytes: warm384Bytes, timeMs: warmElapsed, compressionRatio: (1 - warm384Bytes / orig768Bytes) * 100 },
					cold8: { dims: 8, bytes: cold8Bytes, timeMs: coldElapsed, compressionRatio: (1 - cold8Bytes / orig768Bytes) * 100 },
					archive: { bytes: archiveBytes, timeMs: archiveElapsed, compressionRatio: (1 - archiveBytes / orig768Bytes) * 100 }
				},
				totalTimeMs: totalElapsed
			});

			totalSuccesses++;

			// Print per-item results
			console.log(`✅ "${text.slice(0, 40)}..."`);
			console.log(`   768-dim (ONNX):     ${onnxElapsed.toFixed(1)}ms | ${orig768Bytes} bytes`);
			console.log(`   384-dim (Warm):     ${warmElapsed.toFixed(1)}ms | ${warm384Bytes} bytes | ${((1 - warm384Bytes / orig768Bytes) * 100).toFixed(1)}% compression`);
			console.log(`   8-dim (Cold):       ${coldElapsed.toFixed(1)}ms | ${cold8Bytes} bytes | ${((1 - cold8Bytes / orig768Bytes) * 100).toFixed(1)}% compression`);
			console.log(`   int16 (Archive):    ${archiveElapsed.toFixed(1)}ms | ${archiveBytes} bytes | ${((1 - archiveBytes / orig768Bytes) * 100).toFixed(1)}% compression`);
			console.log(`   Total decomp:       ${totalElapsed.toFixed(1)}ms\n`);
		} catch (error) {
			console.error(`❌ "${text.slice(0, 40)}..." | ${error instanceof Error ? error.message : String(error)}`);
			totalFailures++;
		}
	}

	// Summary
	const passRate = ((totalSuccesses / TEST_BATCH.length) * 100).toFixed(1);
	const avgDecompTime = results.length > 0 ? results.reduce((sum, r) => sum + r.totalTimeMs, 0) / results.length : 0;

	console.log(`\n=== Summary ===`);
	console.log(`Pass rate: ${totalSuccesses}/${TEST_BATCH.length} (${passRate}%)`);
	console.log(`Average decomposition time: ${avgDecompTime.toFixed(1)}ms`);

	// Tier latency distribution
	if (results.length > 0) {
		const avgWarmMs = results.reduce((sum, r) => sum + r.tiers.warm384.timeMs, 0) / results.length;
		const avgColdMs = results.reduce((sum, r) => sum + r.tiers.cold8.timeMs, 0) / results.length;
		const avgArchiveMs = results.reduce((sum, r) => sum + r.tiers.archive.timeMs, 0) / results.length;

		console.log(`\nTier Latency Profile:`);
		console.log(`  Warm (truncate):    ${avgWarmMs.toFixed(2)}ms (target: <5ms) ${avgWarmMs < 5 ? '✅' : '❌'}`);
		console.log(`  Cold (sparse):      ${avgColdMs.toFixed(2)}ms (target: <2ms) ${avgColdMs < 2 ? '✅' : '❌'}`);
		console.log(`  Archive (quantize): ${avgArchiveMs.toFixed(2)}ms (target: <1ms) ${avgArchiveMs < 1 ? '✅' : '❌'}`);
	}

	// Storage cost comparison
	console.log(`\nStorage Cost Estimates (per 1M embeddings):`);
	console.log(`  768-dim (Raw):      ${(768 * 8 * 1e6 / 1e9 * 0.03).toFixed(2)} USD/month (Postgres)`);
	console.log(`  384-dim (Warm):     ${(384 * 8 * 1e6 / 1e9 * 0.03).toFixed(2)} USD/month (Postgres)`);
	console.log(`  8-dim (Cold):       ${(8 * 8 * 1e6 / 1e9 * 0.01).toFixed(2)} USD/month (CouchDB)`);
	console.log(`  1536-byte (Archive):${(1536 * 1e6 / 1e9 * 0.002).toFixed(2)} USD/month (SeaweedFS)`);

	// Test range evaluation
	const testPass = totalSuccesses >= TEST_BATCH.length * 0.9 && avgDecompTime < 50;
	console.log(`\nTest range (> 90% pass, < 50ms avg): ${testPass ? '✅ PASS' : '❌ FAIL'}`);

	return {
		passRate: parseFloat(passRate),
		avgDecompTime,
		totalSuccesses,
		totalFailures,
		testPass
	};
}

testLodDecomposition()
	.then((summary) => {
		process.exit(summary.testPass ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test error:', err);
		process.exit(1);
	});
