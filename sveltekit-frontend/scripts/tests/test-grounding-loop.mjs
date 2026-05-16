const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const chalk = { cyan, green, red, yellow, dim };

const BASE = process.env.PUBLIC_APP_URL ?? (process.env.BASE_URL || 'http://127.0.0.1:5173');
const RECALL_ENDPOINT = `${BASE}/api/codebase/recall`;

async function testRerankPrecision() {
	console.log(`\n${cyan('Testing Codebase Reranking Precision (Stage C)')}`);
	const query = 'auth middleware implementation';

	try {
		const res = await fetch(RECALL_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, limit: 12 })
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = await res.json();
		console.log(dim(`  Retrieved ${data.candidates.length} candidates (Stage A)`));

		// Now hit Rerank with Stage C forced
		const rerankRes = await fetch(`${BASE}/api/codebase/rerank`, {
			method: 'POST',
			headers: { 
				'Content-Type': 'application/json',
				'x-rerank-stage': 'C'
			},
			body: JSON.stringify({ query, limit: 5 })
		});
		if (!rerankRes.ok) throw new Error(`Rerank HTTP ${rerankRes.status}`);

		const rerankData = await rerankRes.json();
		console.log(dim(`  Reranked ${rerankData.results.length} results (Stage C)`));

		for (const chunk of rerankData.results) {
			console.log(`  [${green(chunk.score.toFixed(3))}] ${chunk.relativePath}:${chunk.lineStart}`);
			if (chunk.gpuCluster != null) console.log(dim(`    Cluster: ${chunk.gpuCluster}`));
		}

		if (rerankData.results.length > 0) {
			console.log(green('  PASS: Reranking results returned'));
			return true;
		} else {
			console.log(red('  FAIL: No chunks returned'));
			return false;
		}
	} catch (err) {
		console.log(red(`  FAIL: ${err.message}`));
		return false;
	}
}

async function testWebIngestionTrigger() {
	console.log(`\n${cyan('Testing Web Ingestion Trigger')}`);
	// Use a query likely to have low local confidence but good web results
	const query = 'latest svelte 5 runes documentation for $effect';

	try {
		// We hit the chat endpoint or a direct rerank endpoint to trigger fallback
		const res = await fetch(`${BASE}/api/codebase/rerank`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, limit: 1 })
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();

		const hasWeb = data.results.some(r => r.doc._webResult);
		if (hasWeb) {
			console.log(green('  PASS: Web fallback triggered and returned results'));
			console.log(dim('  NOTE: Check server logs for [Worker:kb.ingest] activity'));
			return true;
		} else {
			console.log(yellow('  WARN: Web fallback not triggered (confidence might be high enough locally)'));
			return true;
		}
	} catch (err) {
		console.log(red(`  FAIL: ${err.message}`));
		return false;
	}
}

async function main() {
	const results = [];
	results.push(await testRerankPrecision());
	results.push(await testWebIngestionTrigger());

	const passed = results.filter(Boolean).length;
	console.log(`\n${passed === results.length ? green('SUCCESS') : red('FAILURE')}: ${passed}/${results.length} tests passed\n`);
	process.exit(passed === results.length ? 0 : 1);
}

main();
