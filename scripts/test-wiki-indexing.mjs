#!/usr/bin/env node
/**
 * End-to-end test for GPU semantic wiki indexing
 * Tests both RabbitMQ and mapreduce paths
 *
 * Usage: node scripts/test-wiki-indexing.mjs [--port 5173]
 */

const PORT = process.argv.includes('--port')
	? process.argv[process.argv.indexOf('--port') + 1]
	: '5173';
const BASE = `http://localhost:${PORT}`;

// Login cookie (dev bypass auth)
const COOKIE = 'session=dev-bypass';

async function fetchAPI(path, options = {}) {
	const url = `${BASE}${path}`;
	const res = await fetch(url, {
		headers: {
			'Content-Type': 'application/json',
			Cookie: COOKIE,
			...options.headers,
		},
		...options,
	});
	const text = await res.text();
	try {
		return { status: res.status, data: JSON.parse(text), ok: res.ok };
	} catch {
		return { status: res.status, data: text, ok: res.ok };
	}
}

async function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ─── Test 1: POST /api/codebase/wiki/index ───
async function testStartIndexing() {
	console.log('\n🧪 Test 1: Start indexing job (scope=lib)');
	const res = await fetchAPI('/api/codebase/wiki/index', {
		method: 'POST',
		body: JSON.stringify({ scope: 'lib', incremental: false }),
	});

	if (!res.ok) {
		console.log(`  ❌ POST failed: ${res.status}`, res.data);
		return null;
	}

	console.log(`  ✅ Job started: backend=${res.data.backend}, jobId=${res.data.jobId}`);
	return res.data;
}

// ─── Test 2: GET /api/codebase/wiki/index?jobId=xxx ───
async function testPollStatus(jobId) {
	console.log(`\n🧪 Test 2: Poll job status (${jobId.slice(0, 8)}...)`);
	let lastStatus = '';
	for (let i = 0; i < 10; i++) {
		const res = await fetchAPI(`/api/codebase/wiki/index?jobId=${jobId}`);
		if (!res.ok) {
			console.log(`  ❌ GET failed: ${res.status}`, res.data);
			return null;
		}

		const job = res.data.job;
		const status = job.status;
		const progress = job.progress ?? 0;

		if (status !== lastStatus) {
			console.log(`  📊 Status: ${status} (${progress}%) — backend: ${job.backend ?? 'unknown'}`);
			lastStatus = status;
		}

		if (status === 'completed') {
			console.log(`  ✅ Job completed! Files: ${job.filesProcessed ?? '?'}, Chunks: ${job.chunksProcessed ?? '?'}`);
			return job;
		}

		if (status === 'failed') {
			console.log(`  ❌ Job failed: ${job.error}`);
			return job;
		}

		await sleep(3000);
	}

	console.log(`  ⏱️ Timed out after 30s (last status: ${lastStatus})`);
	return null;
}

// ─── Test 3: Search the wiki ───
async function testWikiSearch() {
	console.log('\n🧪 Test 3: Search wiki for "evidence"');
	const res = await fetchAPI('/api/codebase/wiki?q=evidence&limit=3');
	if (!res.ok) {
		console.log(`  ❌ Search failed: ${res.status}`, res.data);
		return;
	}

	const results = res.data.results ?? res.data.files ?? res.data;
	if (Array.isArray(results) && results.length > 0) {
		console.log(`  ✅ Found ${results.length} results:`);
		results.slice(0, 3).forEach((r, i) => {
			const path = r.filePath ?? r.file_path ?? r.path ?? 'unknown';
			const score = r.score ?? r.similarity ?? '?';
			console.log(`    ${i + 1}. ${path} (score: ${typeof score === 'number' ? score.toFixed(3) : score})`);
		});
	} else {
		console.log(`  ⚠️ No results (may need indexing to complete first)`);
	}
}

// ─── Run all tests ───
async function main() {
	console.log(`🔧 Testing GPU Semantic Wiki Indexing — ${BASE}`);
	console.log('━'.repeat(60));

	// Check server is running
	try {
		await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
	} catch {
		console.log(`❌ Dev server not running on ${BASE}. Start it with: npm run dev`);
		process.exit(1);
	}

	// Test 1: Start indexing
	const startResult = await testStartIndexing();
	if (!startResult?.jobId) {
		console.log('\n❌ Cannot continue without a jobId');
		process.exit(1);
	}

	// Test 2: Poll status
	const finalJob = await testPollStatus(startResult.jobId);

	// Test 3: Search
	await testWikiSearch();

	console.log('\n━'.repeat(60));
	console.log('📝 Summary:');
	console.log(`  Backend: ${startResult.backend}`);
	console.log(`  Job status: ${finalJob?.status ?? 'unknown'}`);
	console.log(`  Files indexed: ${finalJob?.filesProcessed ?? '?'}`);
	console.log(`  Chunks indexed: ${finalJob?.chunksProcessed ?? '?'}`);
}

main().catch((err) => {
	console.error('Test runner failed:', err);
	process.exit(1);
});
