/**
 * Test Evidence Analysis GPU Pipeline
 *
 * Tests the /api/codebase-index/evidence-analyze endpoint which:
 * - Runs evidence analysis queries through gemma4-legal
 * - Tracks cache hit rates and latency
 * - Stores results in CouchDB evidence_analysis database
 *
 * Usage:
 *   node scripts/tests/test-evidence-analyze.mjs [domain]
 *
 * Examples:
 *   node scripts/tests/test-evidence-analyze.mjs evidence-analysis
 *   node scripts/tests/test-evidence-analyze.mjs evidence
 *   node scripts/tests/test-evidence-analyze.mjs all
 */

const BASE = 'http://localhost:5173';

async function post(path, body) {
	const r = await fetch(BASE + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const text = await r.text();
	if (!r.ok) {
		console.log('POST', path, '->', r.status, text.slice(0, 300));
		return null;
	}
	return JSON.parse(text);
}

async function poll(path, jobId, label, maxWait = 180000) {
	const deadline = Date.now() + maxWait;
	let iterations = 0;

	while (Date.now() < deadline) {
		await new Promise((res) => setTimeout(res, 3000));
		iterations++;

		const r = await fetch(`${BASE}${path}?jobId=${jobId}`);
		if (!r.ok) {
			console.log(`[${label}] Poll failed:`, r.status);
			return null;
		}

		const d = await r.json();
		console.log(`[${label}] iteration=${iterations} status=${d.status} jobId=${jobId}`);

		if (d.status === 'done' || d.status === 'error') {
			console.log(`\n[${label}] FINAL RESULT:`);
			console.log('─'.repeat(80));

			if (d.result) {
				const { totalQueries, successful, failed, durationMs, cacheHitRate, avgLatency, errors } = d.result;
				console.log(`Total Queries:   ${totalQueries}`);
				console.log(`Successful:      ${successful} (${((successful / totalQueries) * 100).toFixed(1)}%)`);
				console.log(`Failed:          ${failed}`);
				console.log(`Duration:        ${(durationMs / 1000).toFixed(1)}s`);
				console.log(`Avg Latency:     ${avgLatency.toFixed(0)}ms per query`);
				console.log(`Cache Hit Rate:  ${(cacheHitRate * 100).toFixed(1)}%`);

				if (errors && errors.length > 0) {
					console.log(`\nErrors (first 3):`);
					errors.slice(0, 3).forEach((err, i) => {
						console.log(`  ${i + 1}. ${err.query.slice(0, 50)}...`);
						console.log(`     Error: ${err.error}`);
					});
				}
			}

			if (d.error) {
				console.log(`ERROR: ${d.error}`);
			}

			console.log('─'.repeat(80));
			return d;
		}
	}

	console.log(`[${label}] TIMEOUT after ${maxWait}ms`);
	return null;
}

async function main() {
	const domain = process.argv[2] || 'evidence-analysis';
	const validDomains = ['evidence', 'evidence-analysis', 'all'];

	if (!validDomains.includes(domain)) {
		console.error(`Invalid domain: ${domain}`);
		console.error(`Valid domains: ${validDomains.join(', ')}`);
		process.exit(1);
	}

	console.log('\n🧪 Testing Evidence Analysis GPU Pipeline\n');
	console.log('═'.repeat(80));
	console.log(`Domain: ${domain}`);
	console.log(`Expected Queries: ${domain === 'all' ? 120 : 20}`);
	console.log('═'.repeat(80));

	// Fire the job
	console.log(`\n🚀 Starting evidence analysis...`);
	const response = await post('/api/codebase-index/evidence-analyze', {
		domain,
		batchSize: 5,
		model: 'gemma4-legal:latest',
	});

	if (!response) {
		console.error('❌ Failed to start job');
		process.exit(1);
	}

	console.log(`✓ Job started: ${response.jobId}`);
	console.log(`  Message: ${response.message}`);

	// Poll for completion
	const result = await poll('/api/codebase-index/evidence-analyze', response.jobId, 'evidence-analyze');

	if (!result) {
		console.error('❌ Job did not complete');
		process.exit(1);
	}

	// Verify CouchDB storage
	console.log('\n📊 Checking CouchDB storage...');
	const dbCheck = await fetch(`${BASE}/api/codebase-index/evidence-analyze?domain=${domain}`);
	if (dbCheck.ok) {
		const dbData = await dbCheck.json();
		console.log(`✓ CouchDB doc found: ${dbData.doc ? 'YES' : 'NO'}`);
		if (dbData.doc) {
			console.log(`  Job ID: ${dbData.doc.jobId}`);
			console.log(`  Created: ${dbData.doc.createdAt}`);
			console.log(`  Success Rate: ${((dbData.doc.successful / dbData.doc.totalQueries) * 100).toFixed(1)}%`);
		}
	} else {
		console.log('⚠️  CouchDB check failed');
	}

	console.log('\n✅ Evidence Analysis Test Complete\n');
}

main().catch((e) => {
	console.error('FATAL:', e.message);
	process.exit(1);
});
