#!/usr/bin/env node
/**
 * Cache Warm-Up CLI Script
 *
 * Runs the cache warm-up script to pre-populate Redis L1 and Bifrost L2 caches
 * with responses to 100+ common legal queries via HTTP API.
 *
 * Prerequisites: SvelteKit dev server must be running on http://localhost:5173
 *
 * Usage:
 *   node scripts/cache-warmup.mjs [options]
 *
 * Options:
 *   --batch-size <n>     Number of queries to process in parallel (default: 5)
 *   --delay <ms>         Delay between batches in milliseconds (default: 1000)
 *   --model <name>       LLM model to use (default: gemma4-legal-iq4xs-direct.gguf)
 *   --domain <name>      Warm up specific domain only (evidence, civil-procedure, torts, contracts, criminal)
 *   --dry-run            Log queries without calling LLM
 *   --url <url>          API base URL (default: http://localhost:5173)
 *   --help               Show this help message
 *
 * Examples:
 *   # Warm up all queries with defaults
 *   node scripts/cache-warmup.mjs
 *
 *   # Warm up with faster batching
 *   node scripts/cache-warmup.mjs --batch-size 10 --delay 500
 *
 *   # Warm up evidence domain only
 *   node scripts/cache-warmup.mjs --domain evidence
 *
 *   # Dry run to see what would be processed
 *   node scripts/cache-warmup.mjs --dry-run
 *
 *   # Use different model
 *   node scripts/cache-warmup.mjs --model gemma3:270m
 *
 *   # Use custom API URL
 *   node scripts/cache-warmup.mjs --url http://localhost:3000
 */

import { parseArgs } from 'node:util';

const HELP_TEXT = `
Cache Warm-Up CLI Script

Pre-populates Redis L1 and Bifrost L2 caches with 100+ common legal queries.

Prerequisites:
  SvelteKit dev server must be running on http://localhost:5173

Usage:
  node scripts/cache-warmup.mjs [options]

Options:
  --batch-size <n>     Number of queries to process in parallel (default: 5)
  --delay <ms>         Delay between batches in milliseconds (default: 1000)
  --model <name>       LLM model to use (default: gemma4-legal-iq4xs-direct.gguf)
  --domain <name>      Warm up specific domain only:
                       - evidence
                       - civil-procedure
                       - torts
                       - contracts
                       - criminal
  --dry-run            Log queries without calling LLM
  --url <url>          API base URL (default: http://localhost:5173)
  --help               Show this help message

Examples:
  # Warm up all queries with defaults
  node scripts/cache-warmup.mjs

  # Warm up with faster batching
  node scripts/cache-warmup.mjs --batch-size 10 --delay 500

  # Warm up evidence domain only
  node scripts/cache-warmup.mjs --domain evidence

  # Dry run to see what would be processed
  node scripts/cache-warmup.mjs --dry-run

  # Use different model
  node scripts/cache-warmup.mjs --model gemma3:270m

  # Use custom API URL
  node scripts/cache-warmup.mjs --url http://localhost:3000
`;

// Parse command line arguments
const { values } = parseArgs({
	options: {
		'batch-size': { type: 'string', short: 'b' },
		delay: { type: 'string', short: 'd' },
		model: { type: 'string', short: 'm' },
		domain: { type: 'string' },
		'dry-run': { type: 'boolean' },
		url: { type: 'string' },
		help: { type: 'boolean', short: 'h' },
	},
	strict: false,
	allowPositionals: true,
});

// Show help and exit
if (values.help) {
	console.log(HELP_TEXT);
	process.exit(0);
}

// Parse options
const batchSize = values['batch-size'] ? parseInt(values['batch-size'], 10) : 5;
const delay = values.delay ? parseInt(values.delay, 10) : 1000;
const model = values.model || process.env.GEMMA4_MODEL || 'gemma4-legal-iq4xs-direct.gguf';
const domain = values.domain;
const dryRun = values['dry-run'] || false;
const apiUrl = values.url || 'http://localhost:5173';

// Validate batch size
if (isNaN(batchSize) || batchSize < 1) {
	console.error('Error: --batch-size must be a positive number');
	process.exit(1);
}

// Validate delay
if (isNaN(delay) || delay < 0) {
	console.error('Error: --delay must be a non-negative number');
	process.exit(1);
}

// Validate domain
const validDomains = ['evidence', 'civil-procedure', 'torts', 'contracts', 'criminal', 'evidence-analysis'];
if (domain && !validDomains.includes(domain)) {
	console.error(`Error: --domain must be one of: ${validDomains.join(', ')}`);
	process.exit(1);
}

// Print banner
console.log('═══════════════════════════════════════════');
console.log('  Cache Warm-Up Script (HTTP API Client)');
console.log('═══════════════════════════════════════════');
console.log(`  API URL:     ${apiUrl}`);
console.log(`  Batch size:  ${batchSize}`);
console.log(`  Delay:       ${delay}ms`);
console.log(`  Model:       ${model}`);
console.log(`  Domain:      ${domain || 'all'}`);
console.log(`  Dry run:     ${dryRun}`);
console.log('═══════════════════════════════════════════\n');

try {
	// Check server health first
	console.log(`[warmup] Checking server health at ${apiUrl}...`);
	const healthResponse = await fetch(`${apiUrl}/`).catch(() => null);

	if (!healthResponse || !healthResponse.ok) {
		console.error(`\n❌ Error: Cannot reach server at ${apiUrl}`);
		console.error('   Make sure the SvelteKit dev server is running:');
		console.error('   cd sveltekit-frontend && npm run dev\n');
		process.exit(1);
	}

	console.log(`[warmup] Server is healthy ✓\n`);

	// Build request body
	const requestBody = {
		batchSize,
		delayMs: delay,
		model,
		dryRun,
	};

	if (domain) {
		requestBody.domain = domain;
	}

	// Call warm-up API
	console.log(`[warmup] Calling POST ${apiUrl}/api/cache/warm-up`);
	console.log(`[warmup] Request body:`, JSON.stringify(requestBody, null, 2), '\n');

	const startTime = Date.now();
	const response = await fetch(`${apiUrl}/api/cache/warm-up`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(requestBody),
		signal: AbortSignal.timeout(600000), // 10 minute timeout for warm-up
	});

	const data = await response.json();
	const duration = Date.now() - startTime;

	if (!response.ok) {
		console.error(`\n❌ API Error (${response.status}):`, data.error || 'Unknown error');
		if (data.details) {
			console.error('   Details:', JSON.stringify(data.details, null, 2));
		}
		process.exit(1);
	}

	if (!data.success) {
		console.error('\n❌ Warm-up failed:', data.error || 'Unknown error');
		process.exit(1);
	}

	const config = data.config;

	// Print async warm-up confirmation
	console.log('\n═══════════════════════════════════════════');
	console.log('  Warm-Up Started (Background Processing)');
	console.log('═══════════════════════════════════════════');
	console.log(`  Total queries:   ${config.totalQueries}`);
	console.log(`  Batch size:      ${config.batchSize}`);
	console.log(`  Delay:           ${config.delayMs}ms`);
	console.log(`  Model:           ${config.model}`);
	console.log(`  Domain:          ${config.domain}`);
	console.log(`  Est. duration:   ~${Math.ceil(config.estimatedDurationSeconds / 60)} minutes`);
	console.log('═══════════════════════════════════════════');

	console.log('\n✅ Cache warm-up is running in the background on the server.');
	console.log('   Monitor progress at: http://localhost:5173/cache-monitor');
	console.log('   Or check cache stats: curl http://localhost:5173/api/cache/exact-match/stats');
	console.log('\n💡 Tip: Watch "Total Keys" increase in the monitoring dashboard.');

	// Exit successfully (warm-up is async, will complete in background)
	process.exit(0);
} catch (err) {
	console.error('\n❌ Cache warm-up failed:', err.message || err);
	if (err.cause) {
		console.error('   Cause:', err.cause.message || err.cause);
	}
	process.exit(1);
}
