#!/usr/bin/env node
/**
 * Smoke test for /api/codebase-index/orchestrate
 *
 * Usage:
 *   node scripts/tests/test-orchestrator-smoke.mjs              # dry-run (safe, no writes)
 *   node scripts/tests/test-orchestrator-smoke.mjs --live        # real run (writes to Qdrant)
 *   node scripts/tests/test-orchestrator-smoke.mjs --full        # all 9 stages (needs services)
 *   node scripts/tests/test-orchestrator-smoke.mjs --status      # GET status only
 *
 * Requires: dev server running on localhost:5173
 */

const BASE = process.env.PUBLIC_APP_URL ?? (process.env.BASE_URL || 'http://localhost:5173');
const ENDPOINT = `${BASE}/api/codebase-index/orchestrate`;

const args = process.argv.slice(2);
const isLive = args.includes('--live');
const isFull = args.includes('--full');
const isStatus = args.includes('--status');

// ── Color helpers ───────────────────────────────────────────────────────────

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ── Test: GET status ────────────────────────────────────────────────────────

async function testGetStatus() {
	console.log(cyan('\n--- GET /api/codebase-index/orchestrate (status) ---\n'));

	const res = await fetch(ENDPOINT);
	if (!res.ok) {
		console.log(red(`  FAIL: HTTP ${res.status}`));
		return false;
	}

	const data = await res.json();
	const pgMirror = data.pgMirror || {};
	console.log(`  endpoint:    ${data.endpoint}`);
	console.log(`  description: ${data.description?.slice(0, 80)}...`);
	console.log(`  collection:  ${data.collection?.exists ? green('exists') : yellow('missing')} (${data.collection?.points ?? 0} points)`);
	console.log(`  pgMirror:    ${pgMirror.healthy ? green('healthy') : pgMirror.exists === false ? red('missing') : pgMirror.error ? red('error') : yellow('unknown')} (${pgMirror.table ?? 'n/a'})`);
	if (Array.isArray(pgMirror.missingColumns) && pgMirror.missingColumns.length > 0) {
		console.log(`  missingCols: ${pgMirror.missingColumns.join(', ')}`);
	}
	console.log(`  tagCoverage: ${data.tagCoverage?.pct ?? 0}% (${data.tagCoverage?.tagged}/${data.tagCoverage?.total})`);
	console.log(`  cuda:        ${data.cuda ? green('available') : yellow('unavailable')}`);
	console.log(`  stages:      ${(data.stages || []).join(', ')}`);

	const paramKeys = Object.keys(data.params || {});
	console.log(`  params:      ${paramKeys.length} defined`);

	if (paramKeys.length < 10) {
		console.log(red('  FAIL: expected >= 10 params'));
		return false;
	}
	if (pgMirror.table !== 'codebase_chunk_index') {
		console.log(red('  FAIL: expected pgMirror.table=codebase_chunk_index'));
		return false;
	}
	if (pgMirror.exists !== true) {
		console.log(red('  FAIL: expected pgMirror.exists=true'));
		return false;
	}
	if (pgMirror.healthy !== true) {
		console.log(red(`  FAIL: expected pgMirror.healthy=true${pgMirror.error ? ` (${pgMirror.error})` : ''}`));
		return false;
	}
	if (!Array.isArray(pgMirror.missingColumns)) {
		console.log(red('  FAIL: expected pgMirror.missingColumns array'));
		return false;
	}
	if (pgMirror.missingColumns.length > 0) {
		console.log(red(`  FAIL: expected no missing mirror columns, got: ${pgMirror.missingColumns.join(', ')}`));
		return false;
	}
	if (!(data.stages || []).includes('hypergraph_4d')) {
		console.log(red('  FAIL: missing hypergraph_4d stage'));
		return false;
	}

	console.log(green('\n  PASS: GET status\n'));
	return true;
}

// ── Test: POST dry-run ──────────────────────────────────────────────────────

async function testDryRun() {
	console.log(cyan('\n--- POST dry-run sync core (simulated writes) ---\n'));

	const body = {
		scope: 'lib',
		dryRun: true,
		indexFileLimit: 20,
		clusterCount: 5,
		clusterRange: '0-0',
		limit: 10,
		backfillLimit: 50,
		somTopology: false,
		neo4jSync: false,
		pageRank: false,
	};

	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		console.log(red(`  FAIL: HTTP ${res.status}`));
		const text = await res.text();
		console.log(dim(`  ${text.slice(0, 200)}`));
		return false;
	}

	const events = await consumeSSE(res);
	const eventNames = events.map((e) => e.event);
	const requiredEvents = ['started', 'scan_done', 'chunk_done', 'embed_done', 'cluster_done', 'summary_done', 'tag_done', 'complete'];
	const missingEvents = requiredEvents.filter((eventName) => !eventNames.includes(eventName));

	console.log(`  events received: ${events.length}`);
	console.log(`  event types:     ${[...new Set(eventNames)].join(', ')}`);

	const hasStarted = eventNames.includes('started');
	const hasComplete = eventNames.includes('complete');
	const hasOrderedStages = requiredEvents.every((eventName, index) => {
		if (index === 0) return true;
		return eventNames.indexOf(requiredEvents[index - 1]) < eventNames.indexOf(eventName);
	});

	if (!hasStarted) console.log(red('  FAIL: missing "started" event'));
	if (!hasComplete) console.log(red('  FAIL: missing "complete" event'));
	if (missingEvents.length > 0) console.log(red(`  FAIL: missing events: ${missingEvents.join(', ')}`));
	if (!hasOrderedStages) console.log(red('  FAIL: core events were not emitted in order'));

	const completeEvent = events.find((e) => e.event === 'complete');
	if (completeEvent?.data) {
		const d = completeEvent.data;
		console.log(`  completedStages: ${(d.completedStages || []).join(', ')}`);
		if (d.simulatedStages) console.log(`  simulatedStages: ${(d.simulatedStages || []).join(', ')}`);
		console.log(`  totalMs:         ${d.totalMs}ms`);
		console.log(`  stageTimings:    ${JSON.stringify(d.stageTimings || {})}`);
	}

	const ok = hasStarted && hasComplete && missingEvents.length === 0 && hasOrderedStages;
	console.log(ok ? green('\n  PASS: dry-run\n') : red('\n  FAIL: dry-run\n'));
	return ok;
}

// ── Test: POST live quick index ─────────────────────────────────────────────

async function testLiveQuickIndex() {
	console.log(cyan('\n--- POST live quick index (lib, k=5, limit 20 files) ---\n'));

	const body = {
		scope: 'lib',
		clusterCount: 5,
		indexFileLimit: 20,
		limit: 10,
		backfillLimit: 50,
		gpuTag: true,
		summarize: false,
		somTopology: false,
		neo4jSync: false,
		pageRank: false,
	};

	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		console.log(red(`  FAIL: HTTP ${res.status}`));
		const text = await res.text();
		console.log(dim(`  ${text.slice(0, 200)}`));
		return false;
	}

	const events = await consumeSSE(res);
	const eventNames = events.map((e) => e.event);
	console.log(`  events received: ${events.length}`);
	console.log(`  event types:     ${[...new Set(eventNames)].join(', ')}`);

	const completeEvent = events.find((e) => e.event === 'complete');
	const failedEvent = events.find((e) => e.event === 'failed');

	if (failedEvent) {
		console.log(red(`  FAIL: pipeline error: ${failedEvent.data?.message}`));
		return false;
	}

	if (completeEvent?.data) {
		const d = completeEvent.data;
		console.log(`  completedStages: ${(d.completedStages || []).join(', ')}`);
		console.log(`  totalMs:         ${d.totalMs}ms`);
		console.log(`  cuda:            ${d.cuda ? green('yes') : yellow('no')}`);
	}

	const ok = !!completeEvent;
	console.log(ok ? green('\n  PASS: live quick index\n') : red('\n  FAIL: live quick index\n'));
	return ok;
}

// ── Test: POST full backbone ────────────────────────────────────────────────

async function testFullBackbone() {
	console.log(cyan('\n--- POST full backbone (all 9 stages, services required) ---\n'));

	const body = {
		scope: 'lib',
		clusterCount: 10,
		indexFileLimit: 30,
		limit: 10,
		backfillLimit: 100,
		gpuTag: true,
		summarize: false,
		somTopology: true,
		neo4jSync: true,
		pageRank: true,
		exportWiki: true,
		hypergraph: true,
	};

	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		console.log(red(`  FAIL: HTTP ${res.status}`));
		return false;
	}

	const events = await consumeSSE(res);
	const eventNames = events.map((e) => e.event);
	console.log(`  events received: ${events.length}`);

	// Report each stage
	for (const stageName of [
		'scan_done', 'chunk_done', 'embed_done', 'cluster_done',
		'som_done', 'mirror_done', 'pagerank_done', 'summary_done',
		'tag_done', 'wiki_done', 'hypergraph_done', 'complete', 'failed',
	]) {
		const found = eventNames.includes(stageName);
		const skipped = events.some(
			(e) => e.event === 'stage' && e.data?.stage === stageName.replace('_done', '') && e.data?.step === 'skipped',
		);
		const failed = events.some(
			(e) => e.event === 'stage' && e.data?.stage === stageName.replace('_done', '') && e.data?.step === 'failed',
		);
		const status = found ? green('done') : failed ? red('failed') : skipped ? yellow('skipped') : dim('--');
		console.log(`  ${stageName.padEnd(20)} ${status}`);
	}

	const completeEvent = events.find((e) => e.event === 'complete');
	if (completeEvent?.data) {
		console.log(`\n  completedStages: ${(completeEvent.data.completedStages || []).join(', ')}`);
		console.log(`  totalMs:         ${completeEvent.data.totalMs}ms`);
		if (completeEvent.data.stageTimings) {
			for (const [k, v] of Object.entries(completeEvent.data.stageTimings)) {
				console.log(`    ${k}: ${v}ms`);
			}
		}
	}

	const ok = !!completeEvent;
	console.log(ok ? green('\n  PASS: full backbone\n') : red('\n  FAIL: full backbone\n'));
	return ok;
}

// ── SSE consumer ────────────────────────────────────────────────────────────

async function consumeSSE(response) {
	const events = [];
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

		let boundary = buffer.indexOf('\n\n');
		while (boundary !== -1) {
			const chunk = buffer.slice(0, boundary).trim();
			buffer = buffer.slice(boundary + 2);

			if (chunk) {
				let event = 'message';
				const dataLines = [];
				for (const line of chunk.split(/\r?\n/)) {
					if (line.startsWith('event:')) event = line.slice(6).trim();
					if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
				}
				const raw = dataLines.join('\n');
				let data = null;
				try { data = JSON.parse(raw); } catch { data = { raw }; }
				events.push({ event, data });

				// Live progress
				if (event === 'started') console.log(dim(`  [started] mode=${data?.mode} scope=${data?.scope}`));
				else if (event.endsWith('_started')) console.log(dim(`  [${event}]`));
				else if (event.endsWith('_done')) console.log(`  [${green(event)}]`);
				else if (event === 'failed') console.log(`  [${red('failed')}] ${data?.message}`);
				else if (event === 'stage' && data?.step === 'failed') console.log(`  [${red(data.stage + ' failed')}] ${data.error}`);
			}

			boundary = buffer.indexOf('\n\n');
		}

		if (done) break;
	}

	return events;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log(`\n${cyan('Orchestrator Smoke Test')}`);
	console.log(`${dim(`Target: ${ENDPOINT}`)}\n`);

	// Check server is up
	try {
		const ping = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
		if (!ping.ok && ping.status !== 302) throw new Error(`HTTP ${ping.status}`);
	} catch (err) {
		console.log(red(`\n  Dev server not reachable at ${BASE}`));
		console.log(dim('  Run: npm run dev (from sveltekit-frontend/)'));
		process.exit(1);
	}

	const results = [];

	if (isStatus) {
		results.push(await testGetStatus());
	} else {
		results.push(await testGetStatus());
		results.push(await testDryRun());

		if (isLive || isFull) {
			results.push(await testLiveQuickIndex());
		}

		if (isFull) {
			results.push(await testFullBackbone());
		}
	}

	// Summary
	const passed = results.filter(Boolean).length;
	const total = results.length;
	console.log(`\n${'='.repeat(50)}`);
	console.log(passed === total
		? green(`  ALL ${total} TESTS PASSED`)
		: red(`  ${passed}/${total} TESTS PASSED`),
	);
	console.log(`${'='.repeat(50)}\n`);

	process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
	console.error(red(`\nFatal: ${err.message}`));
	process.exit(1);
});
