import type { RequestHandler } from './$types';
import { ollamaBreaker, qdrantBreaker, redisBreaker } from '$lib/server/circuit-breaker.js';

/**
 * Prometheus-compatible metrics endpoint.
 * Returns metrics in text/plain exposition format.
 *
 * Usage: curl http://localhost:5173/api/metrics
 * Scrape interval: 15-30s recommended
 */

// In-memory counters (reset on server restart)
let requestCount = 0;
let errorCount = 0;

export function _incrementRequestCount(): void { requestCount++; }
export function _incrementErrorCount(): void { errorCount++; }

export const GET: RequestHandler = async () => {
	const uptime = process.uptime();
	const mem = process.memoryUsage();

	const ollamaStatus = ollamaBreaker.getStatus();
	const qdrantStatus = qdrantBreaker.getStatus();
	const redisStatus = redisBreaker.getStatus();

	const lines = [
		'# HELP process_uptime_seconds Node.js process uptime in seconds',
		'# TYPE process_uptime_seconds gauge',
		`process_uptime_seconds ${uptime.toFixed(1)}`,
		'',
		'# HELP process_memory_heap_used_bytes Heap memory used',
		'# TYPE process_memory_heap_used_bytes gauge',
		`process_memory_heap_used_bytes ${mem.heapUsed}`,
		'',
		'# HELP process_memory_rss_bytes Resident set size',
		'# TYPE process_memory_rss_bytes gauge',
		`process_memory_rss_bytes ${mem.rss}`,
		'',
		'# HELP process_memory_external_bytes External memory (native addons)',
		'# TYPE process_memory_external_bytes gauge',
		`process_memory_external_bytes ${mem.external}`,
		'',
		'# HELP http_requests_total Total HTTP requests (since restart)',
		'# TYPE http_requests_total counter',
		`http_requests_total ${requestCount}`,
		'',
		'# HELP http_errors_total Total HTTP errors (since restart)',
		'# TYPE http_errors_total counter',
		`http_errors_total ${errorCount}`,
		'',
		'# HELP circuit_breaker_state Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
		'# TYPE circuit_breaker_state gauge',
		`circuit_breaker_state{service="ollama"} ${stateToNum(ollamaStatus.state)}`,
		`circuit_breaker_state{service="qdrant"} ${stateToNum(qdrantStatus.state)}`,
		`circuit_breaker_state{service="redis"} ${stateToNum(redisStatus.state)}`,
		'',
		'# HELP circuit_breaker_failures Total failures per breaker',
		'# TYPE circuit_breaker_failures gauge',
		`circuit_breaker_failures{service="ollama"} ${ollamaStatus.failures}`,
		`circuit_breaker_failures{service="qdrant"} ${qdrantStatus.failures}`,
		`circuit_breaker_failures{service="redis"} ${redisStatus.failures}`,
		''
	];

	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
			'Cache-Control': 'no-cache'
		}
	});
};

function stateToNum(state: string): number {
	switch (state) {
		case 'CLOSED': return 0;
		case 'HALF_OPEN': return 1;
		case 'OPEN': return 2;
		default: return -1;
	}
}
