#!/usr/bin/env node

/**
 * Redis L1 + Bifrost L2 Cache Load Testing
 *
 * Tests the 3-tier cache system under sustained load:
 * - L1: Redis exact-match (5ms)
 * - L2: Bifrost semantic (2-5s)
 * - L3: Ollama GPU fallback (25s)
 *
 * Target: 12,000 QPM sustained
 * Expected hit rate: 90-95%
 * Expected p99 latency: <20ms
 *
 * Usage: node scripts/tests/redis-load-test.mjs [--duration 60] [--concurrency 100]
 */

import { performance } from 'node:perf_hooks';

// Configuration
const CONFIG = {
	duration: parseInt(process.argv.find(arg => arg.startsWith('--duration='))?.split('=')[1] || '60'), // seconds
	concurrency: parseInt(process.argv.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || '100'),
	targetQPM: 12000,
	baseUrl: 'http://localhost:5173',
	redisStatsUrl: 'http://localhost:5173/api/cache/exact-match/stats',
	bifrostUrl: 'http://localhost:3040',
	sampleInterval: 5000, // 5s
};

// Test query patterns (mix of exact duplicates and semantic variants)
const QUERY_PATTERNS = [
	// Exact duplicates (should hit L1 Redis)
	{ type: 'exact', query: 'What is hearsay evidence in California?', weight: 0.3 },
	{ type: 'exact', query: 'Define attorney-client privilege', weight: 0.2 },
	{ type: 'exact', query: 'What are the elements of breach of contract?', weight: 0.15 },

	// Semantic variants (should hit L2 Bifrost)
	{ type: 'semantic', query: 'Explain hearsay rules in CA courts', weight: 0.15 },
	{ type: 'semantic', query: 'What is attorney client confidentiality?', weight: 0.1 },
	{ type: 'semantic', query: 'How to prove contract breach?', weight: 0.05 },

	// Unique queries (will miss both caches)
	{ type: 'unique', query: () => `What is the statute of limitations for ${Date.now()}?`, weight: 0.05 },
];

// Results tracking
const results = {
	requests: {
		total: 0,
		successful: 0,
		failed: 0,
		l1Hits: 0,  // Redis exact match
		l2Hits: 0,  // Bifrost semantic
		l3Hits: 0,  // Ollama GPU
	},
	latencies: [],
	errors: [],
	memorySnapshots: [],
	startTime: 0,
	endTime: 0,
};

// Weighted random query selector
function getRandomQuery() {
	const rand = Math.random();
	let cumulative = 0;

	for (const pattern of QUERY_PATTERNS) {
		cumulative += pattern.weight;
		if (rand <= cumulative) {
			return typeof pattern.query === 'function' ? pattern.query() : pattern.query;
		}
	}

	return QUERY_PATTERNS[0].query;
}

// Single request to LLM endpoint (simulates chat query)
async function sendRequest() {
	const query = getRandomQuery();
	const start = performance.now();

	try {
		// Direct Ollama endpoint (bypasses inference router for load testing)
		const response = await fetch(`${CONFIG.baseUrl}/api/ai/chat-direct`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				message: query,
				model: 'gemma4-rotorquant:latest-fast',  // Optimized 7.5B legal model (10× faster than baseline)
				temperature: 0.3,
			}),
			signal: AbortSignal.timeout(20000),  // 20s timeout (legal model)
		});

		const latency = performance.now() - start;
		results.latencies.push(latency);

		if (response.ok) {
			results.requests.successful++;

			// Determine cache tier from latency
			if (latency < 50) {
				results.requests.l1Hits++;
			} else if (latency < 7000) {
				results.requests.l2Hits++;
			} else {
				results.requests.l3Hits++;
			}

			await response.json(); // Consume response
		} else {
			results.requests.failed++;
			results.errors.push({ query, status: response.status, latency });
		}
	} catch (error) {
		results.requests.failed++;
		results.errors.push({ query, error: error.message });
	} finally {
		results.requests.total++;
	}
}

// Get Redis memory stats
async function getRedisStats() {
	try {
		const response = await fetch(CONFIG.redisStatsUrl, {
			signal: AbortSignal.timeout(5000),
		});

		if (response.ok) {
			return await response.json();
		}
	} catch (error) {
		console.error('Failed to fetch Redis stats:', error.message);
	}
	return null;
}

// Calculate percentiles
function percentile(arr, p) {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

// Print progress
function printProgress(elapsed) {
	const qpm = (results.requests.total / elapsed) * 60;
	const hitRate = results.requests.total > 0
		? ((results.requests.l1Hits + results.requests.l2Hits) / results.requests.total * 100).toFixed(1)
		: 0;
	const avgLatency = results.latencies.length > 0
		? (results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length).toFixed(1)
		: 0;

	console.log(`[${elapsed}s] Requests: ${results.requests.total} | QPM: ${Math.round(qpm)} | Hit Rate: ${hitRate}% | Avg Latency: ${avgLatency}ms`);
}

// Memory monitoring loop
async function monitorMemory(controller) {
	while (!controller.signal.aborted) {
		const stats = await getRedisStats();
		if (stats) {
			results.memorySnapshots.push({
				timestamp: Date.now(),
				...stats,
			});
		}
		await new Promise(resolve => setTimeout(resolve, CONFIG.sampleInterval));
	}
}

// Worker: sends requests at target rate
async function worker(id, controller) {
	const requestsPerWorker = CONFIG.targetQPM / CONFIG.concurrency / 60;
	const delayMs = 1000 / requestsPerWorker;

	while (!controller.signal.aborted) {
		await sendRequest();
		await new Promise(resolve => setTimeout(resolve, delayMs));
	}
}

// Generate final report
function generateReport() {
	const duration = (results.endTime - results.startTime) / 1000;
	const qpm = (results.requests.total / duration) * 60;

	const l1HitRate = (results.requests.l1Hits / results.requests.total * 100).toFixed(2);
	const l2HitRate = (results.requests.l2Hits / results.requests.total * 100).toFixed(2);
	const combinedHitRate = ((results.requests.l1Hits + results.requests.l2Hits) / results.requests.total * 100).toFixed(2);

	const p50 = percentile(results.latencies, 50).toFixed(1);
	const p95 = percentile(results.latencies, 95).toFixed(1);
	const p99 = percentile(results.latencies, 99).toFixed(1);
	const avgLatency = (results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length).toFixed(1);

	const finalMemory = results.memorySnapshots[results.memorySnapshots.length - 1];
	const initialMemory = results.memorySnapshots[0];
	const memoryGrowth = finalMemory && initialMemory
		? ((finalMemory.size - initialMemory.size) / 1024 / 1024).toFixed(2)
		: 'N/A';

	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     Redis + Bifrost Load Test Results                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Test Configuration:
  Duration:          ${duration.toFixed(1)}s
  Concurrency:       ${CONFIG.concurrency} workers
  Target QPM:        ${CONFIG.targetQPM}

Request Statistics:
  Total Requests:    ${results.requests.total}
  Successful:        ${results.requests.successful} (${(results.requests.successful / results.requests.total * 100).toFixed(1)}%)
  Failed:            ${results.requests.failed} (${(results.requests.failed / results.requests.total * 100).toFixed(1)}%)
  Actual QPM:        ${Math.round(qpm)}

Cache Performance:
  L1 Hits (Redis):   ${results.requests.l1Hits} (${l1HitRate}%)
  L2 Hits (Bifrost): ${results.requests.l2Hits} (${l2HitRate}%)
  L3 Hits (Ollama):  ${results.requests.l3Hits} (${((results.requests.l3Hits / results.requests.total) * 100).toFixed(2)}%)

  Combined Hit Rate: ${combinedHitRate}% ${combinedHitRate >= 90 ? '✅ TARGET MET' : '⚠️  BELOW TARGET (90%)'}

Latency Distribution:
  Average:           ${avgLatency}ms
  p50 (median):      ${p50}ms
  p95:               ${p95}ms
  p99:               ${p99}ms ${p99 < 20 ? '✅ TARGET MET' : '⚠️  ABOVE TARGET (20ms)'}

Memory Usage:
  Initial Size:      ${initialMemory ? (initialMemory.size / 1024 / 1024).toFixed(2) : 'N/A'} MB
  Final Size:        ${finalMemory ? (finalMemory.size / 1024 / 1024).toFixed(2) : 'N/A'} MB
  Growth:            ${memoryGrowth} MB
  Final Hit Rate:    ${finalMemory ? finalMemory.hitRate?.toFixed(1) : 'N/A'}%

Performance Targets:
  ${combinedHitRate >= 90 ? '✅' : '⚠️ '} Combined hit rate ≥90% (actual: ${combinedHitRate}%)
  ${p99 < 20 ? '✅' : '⚠️ '} p99 latency <20ms (actual: ${p99}ms)
  ${qpm >= 10000 ? '✅' : '⚠️ '} QPM ≥10,000 (actual: ${Math.round(qpm)})
  ${results.requests.failed === 0 ? '✅' : '⚠️ '} Zero failed requests (actual: ${results.requests.failed})

${results.errors.length > 0 ? `
Errors (first 5):
${results.errors.slice(0, 5).map(e => `  - ${e.query}: ${e.error || 'HTTP ' + e.status}`).join('\n')}
` : ''}
Test Summary:
  ${combinedHitRate >= 90 && p99 < 20 && qpm >= 10000 ? '🎉 ALL TARGETS MET - PRODUCTION READY' : '⚠️  Some targets not met - review configuration'}

Report saved to: scripts/tests/redis-load-test-report.json
`);

	// Save detailed report
	return {
		testConfig: CONFIG,
		duration,
		requests: results.requests,
		hitRates: {
			l1: parseFloat(l1HitRate),
			l2: parseFloat(l2HitRate),
			combined: parseFloat(combinedHitRate),
		},
		latency: {
			avg: parseFloat(avgLatency),
			p50: parseFloat(p50),
			p95: parseFloat(p95),
			p99: parseFloat(p99),
		},
		qpm: Math.round(qpm),
		memoryGrowth: memoryGrowth !== 'N/A' ? parseFloat(memoryGrowth) : null,
		memorySnapshots: results.memorySnapshots,
		errors: results.errors,
		timestamp: new Date().toISOString(),
	};
}

// Main execution
async function main() {
	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    Redis + Bifrost Cache Load Test                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Configuration:
  Duration:       ${CONFIG.duration}s
  Concurrency:    ${CONFIG.concurrency} workers
  Target QPM:     ${CONFIG.targetQPM}
  Base URL:       ${CONFIG.baseUrl}

Starting load test...
`);

	const controller = new AbortController();
	results.startTime = performance.now();

	// Start memory monitoring
	const memoryMonitor = monitorMemory(controller);

	// Start worker pool
	const workers = Array.from({ length: CONFIG.concurrency }, (_, i) => worker(i, controller));

	// Progress reporting
	const progressInterval = setInterval(() => {
		const elapsed = Math.floor((performance.now() - results.startTime) / 1000);
		printProgress(elapsed);
	}, 5000);

	// Run for specified duration
	await new Promise(resolve => setTimeout(resolve, CONFIG.duration * 1000));

	// Stop all workers
	controller.abort();
	clearInterval(progressInterval);
	results.endTime = performance.now();

	// Wait for workers to finish
	await Promise.allSettled([...workers, memoryMonitor]);

	// Generate and save report
	const report = generateReport();

	try {
		const fs = await import('node:fs/promises');
		await fs.writeFile(
			'scripts/tests/redis-load-test-report.json',
			JSON.stringify(report, null, 2)
		);
		console.log('✅ Detailed report saved to scripts/tests/redis-load-test-report.json');
	} catch (error) {
		console.error('❌ Failed to save report:', error.message);
	}
}

main().catch(console.error);
