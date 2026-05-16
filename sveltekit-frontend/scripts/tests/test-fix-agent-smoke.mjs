#!/usr/bin/env node
/**
 * Smoke test for Agentic Fix Recommender
 *
 * Verifies that the refactored /api/codeintel/fix endpoint successfully
 * invokes the Gemma4 Agent loop, utilizes topological context, and
 * potentially uses tools like web_search.
 */

const BASE = process.env.PUBLIC_APP_URL ?? (process.env.BASE_URL || 'http://127.0.0.1:5173');
const ENDPOINT = `${BASE}/api/codeintel/fix`;

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function testFixAgent() {
	console.log(cyan('\n--- POST /api/codeintel/fix (Agentic Loop) ---\n'));

	const body = {
		error: 'TS2322: Type "string" is not assignable to type "number". (at src/lib/components/Counter.svelte:45)',
		filePath: 'src/lib/components/Counter.svelte',
		line: 45,
		includeClusterSummary: true,
		topK: 1
	};

	console.log(dim('  Sending request (max 180s timeout for agentic reasoning)...'));
	const t0 = performance.now();

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 180000);

		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: controller.signal
		});
		clearTimeout(timeoutId);

		const durationMs = Math.round(performance.now() - t0);

		if (!res.ok) {
			console.log(red(`  FAIL: HTTP ${res.status}`));
			const text = await res.text();
			console.log(dim(`  ${text.slice(0, 500)}`));
			return false;
		}

		const data = await res.json();

		console.log(`  status:      ${data.ok ? green('ok') : red('error')}`);
		console.log(`  latency:     ${durationMs}ms`);
		console.log(`  recs:        ${(data.recommendations || []).length}`);
		console.log(`  clusterHit:  ${data.diagnostics?.clusterHit ?? 'none'}`);
		console.log(`  model:       ${data.diagnostics?.modelUsed ?? 'none'}`);

		if (!data.ok) {
			console.log(red(`  ERROR: ${data.error}`));
			return false;
		}

		if (data.recommendations?.length > 0) {
			data.recommendations.forEach((r, i) => {
				console.log(`\n  [Rec ${i + 1}] ${cyan(r.title)} (${(r.confidence * 100).toFixed(0)}%)`);
				console.log(`    Why: ${r.explanation}`);
				console.log(`    Ref: ${r.referenceFiles?.join(', ') || 'none'}`);
			});
		}

		if (data.clusterContext?.summary) {
			console.log(green('\n  PASS: Received Topological Cluster Context'));
			console.log(dim(`    Cluster: ${data.clusterContext.clusterId} (${data.clusterContext.purpose})`));
		} else {
			console.log(yellow('\n  WARN: No cluster context received (expected for specific errors)'));
		}

		console.log(green('\n  PASS: Fix Agent functional\n'));
		return true;
	} catch (e) {
		console.log(red(`  FATAL ERROR: ${e.message}`));
		return false;
	}
}

testFixAgent().then(ok => process.exit(ok ? 0 : 1));
