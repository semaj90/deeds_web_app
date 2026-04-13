#!/usr/bin/env node

/**
 * Redis L1 Cache Performance Test
 *
 * Tests Redis exact-match cache performance using the embedding endpoint
 * (much faster than LLM chat, better for cache testing)
 *
 * Target: Validate L1 cache hit rate and latency
 * Expected: >90% hit rate for repeated queries, <10ms latency
 */

import { performance } from 'node:perf_hooks';

const CONFIG = {
	duration: parseInt(process.argv.find(arg => arg.startsWith('--duration='))?.split('=')[1] || '60'),
	concurrency: parseInt(process.argv.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || '50'),
	baseUrl: 'http://localhost:11434',
};

// Test queries (repeat same queries to test cache hits)
const TEST_QUERIES = [
	'hearsay evidence',
	'attorney-client privilege',
	'breach of contract',
	'statute of limitations',
	'discovery process',
	'summary judgment',
	'negligence elements',
	'burden of proof',
];

const results = {
	requests: { total: 0, successful: 0, failed: 0 },
	latencies: [],
	startTime: 0,
	endTime: 0,
};

// Single embedding request
async function sendRequest() {
	const query = TEST_QUERIES[Math.floor(Math.random() * TEST_QUERIES.length)];
	const start = performance.now();

	try {
		const response = await fetch(`${CONFIG.baseUrl}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				input: query,
			}),
			signal: AbortSignal.timeout(10000),
		});

		const latency = performance.now() - start;
		results.latencies.push(latency);

		if (response.ok) {
			results.requests.successful++;
			await response.json();
		} else {
			results.requests.failed++;
		}
	} catch (error) {
		results.requests.failed++;
	} finally {
		results.requests.total++;
	}
}

// Worker loop
async function worker(id, controller) {
	const requestsPerSecond = (CONFIG.concurrency * 100) / CONFIG.concurrency;
	const delayMs = 1000 / requestsPerSecond;

	while (!controller.signal.aborted) {
		await sendRequest();
		await new Promise(resolve => setTimeout(resolve, delayMs));
	}
}

// Calculate stats
function percentile(arr, p) {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

// Main
async function main() {
	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      Redis Cache Performance Test                             ║
║                        (Embedding Endpoint)                                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Configuration:
  Duration:       ${CONFIG.duration}s
  Concurrency:    ${CONFIG.concurrency} workers
  Endpoint:       ${CONFIG.baseUrl}/api/embed
  Model:          embeddinggemma:latest

Starting test...
`);

	const controller = new AbortController();
	results.startTime = performance.now();

	// Start workers
	const workers = Array.from({ length: CONFIG.concurrency }, (_, i) => worker(i, controller));

	// Progress reporting
	const progressInterval = setInterval(() => {
		const elapsed = Math.floor((performance.now() - results.startTime) / 1000);
		const qpm = (results.requests.total / elapsed) * 60;
		const avgLatency = results.latencies.length > 0
			? (results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length).toFixed(1)
			: 0;
		console.log(`[${elapsed}s] Requests: ${results.requests.total} | QPM: ${Math.round(qpm)} | Avg Latency: ${avgLatency}ms`);
	}, 5000);

	// Run for duration
	await new Promise(resolve => setTimeout(resolve, CONFIG.duration * 1000));
	controller.abort();
	clearInterval(progressInterval);
	results.endTime = performance.now();

	await Promise.allSettled(workers);

	// Calculate stats
	const duration = (results.endTime - results.startTime) / 1000;
	const qpm = (results.requests.total / duration) * 60;
	const p50 = percentile(results.latencies, 50).toFixed(1);
	const p95 = percentile(results.latencies, 95).toFixed(1);
	const p99 = percentile(results.latencies, 99).toFixed(1);
	const avgLatency = (results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length).toFixed(1);

	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          Test Results                                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Duration:          ${duration.toFixed(1)}s
Total Requests:    ${results.requests.total}
Successful:        ${results.requests.successful} (${(results.requests.successful / results.requests.total * 100).toFixed(1)}%)
Failed:            ${results.requests.failed}
QPM:               ${Math.round(qpm)}

Latency:
  Average:         ${avgLatency}ms
  p50 (median):    ${p50}ms
  p95:             ${p95}ms
  p99:             ${p99}ms

Performance:
  ${results.requests.successful > 0 ? '✅' : '❌'} Requests completed
  ${p99 < 100 ? '✅' : '⚠️ '} p99 latency ${p99}ms (target: <100ms)
  ${qpm >= 1000 ? '✅' : '⚠️ '} QPM ${Math.round(qpm)} (target: ≥1000)

Note: This tests embedding performance, not full LLM chat.
For cache hit rate testing, run multiple times and compare latencies.
First run: Cold cache (slower)
Second run: Warm cache (faster with hits)
`);
}

main().catch(console.error);
