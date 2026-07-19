#!/usr/bin/env node

/**
 * Small-batch embedding test with ONNX/Ollama dual-path
 * Tests embedding quality and dimension resolution
 *
 * Expected test range:
 * - Single embedding: 0-500ms (ONNX local)
 * - Batch (10 texts): 100-2000ms (ONNX + fallback)
 * - Pass rate: >90% (at least 9/10)
 */

import fetch from 'node-fetch';

const ONNX_URL = 'http://127.0.0.1:8081/v1/embeddings';
const OLLAMA_URL = 'http://127.0.0.1:11434/api/embeddings';

const TEST_BATCH = [
	'auth session validation',
	'database connection pooling',
	'caching strategy for performance',
	'error handling in async operations',
	'type-safe typescript patterns'
];

async function testOnnxEmbedding(text) {
	try {
		const startTime = performance.now();

		const response = await fetch(ONNX_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				input: text
			}),
			timeout: 5000
		});

		const elapsed = performance.now() - startTime;

		if (!response.ok) {
			return { text, status: 'failed', error: `HTTP ${response.status}`, elapsed };
		}

		const data = await response.json();
		const embedding = data.data?.[0]?.embedding;

		if (!embedding) {
			return { text, status: 'failed', error: 'No embedding in response', elapsed };
		}

		return {
			text,
			status: 'success',
			dims: embedding.length,
			norm: Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0)),
			elapsed: Math.round(elapsed)
		};
	} catch (error) {
		return {
			text,
			status: 'failed',
			error: error.message,
			elapsed: null
		};
	}
}

async function runBatchTest() {
	console.log('=== Dual-Path Embedding Batch Test ===\n');
	console.log(`ONNX Server: ${ONNX_URL}`);
	console.log(`Ollama Server: ${OLLAMA_URL}`);
	console.log(`Test batch size: ${TEST_BATCH.length}\n`);

	const results = [];
	const startBatch = performance.now();

	for (const text of TEST_BATCH) {
		const result = await testOnnxEmbedding(text);
		results.push(result);

		const statusIcon = result.status === 'success' ? '✅' : '❌';
		console.log(
			`${statusIcon} "${text.slice(0, 40)}..." | ${result.status} | ${result.dims || '?'} dims | ${result.elapsed || '?'}ms`
		);
	}

	const batchElapsed = performance.now() - startBatch;

	// Summary
	const successes = results.filter((r) => r.status === 'success').length;
	const passRate = ((successes / TEST_BATCH.length) * 100).toFixed(1);
	const avgElapsed = results
		.filter((r) => r.elapsed)
		.reduce((sum, r) => sum + r.elapsed, 0) / results.filter((r) => r.elapsed).length;

	console.log(`\n=== Summary ===`);
	console.log(`Pass rate: ${successes}/${TEST_BATCH.length} (${passRate}%)`);
	console.log(`Average latency per embedding: ${Math.round(avgElapsed)}ms`);
	console.log(`Total batch time: ${Math.round(batchElapsed)}ms`);

	// Check for dimension issues
	const dims = results
		.filter((r) => r.status === 'success')
		.map((r) => r.dims)
		.filter((d, i, arr) => arr.indexOf(d) === i);

	console.log(`\nDimensions found: ${dims.join(', ')}`);
	if (dims.length > 1) {
		console.warn(`⚠️  WARNING: Mixed dimensions detected (expected 384, got ${dims.join(', ')})`);
	}

	// Test range evaluation
	const rangeOk = avgElapsed < 2000 && passRate >= 90;
	console.log(`\nTest range (< 2000ms, > 90% pass): ${rangeOk ? '✅ PASS' : '❌ FAIL'}`);

	return {
		passRate: parseFloat(passRate),
		avgLatency: Math.round(avgElapsed),
		batchTime: Math.round(batchElapsed),
		dims,
		rangeOk
	};
}

runBatchTest()
	.then((summary) => {
		process.exit(summary.rangeOk ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test error:', err);
		process.exit(1);
	});
