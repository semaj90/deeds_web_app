#!/usr/bin/env node
/**
 * Golden-breadth query set (50 unjudged queries) for local MCP tool calling.
 *
 * Lanes:
 *   svelte -> local Svelte MCP over stdio (`npx -y @sveltejs/mcp`)
 *   trace  -> TRACE MCP over HTTP (http://127.0.0.1:8788/mcp, stateless)
 *   atlas  -> atlas-tools MCP over stdio (scripts/mcp/atlas-tools-mcp.mjs)
 *
 * Modes:
 *   default      plan only: validates the query set and writes the plan (no MCP calls)
 *   --live       calls each lane, records raw results, status and latency
 *   --limit=N    run only the first N queries (with --live)
 *
 * Writes (receipts only, exclusive-create, under docs/reports/golden-breadth-retrieval/<runId>/):
 *   plan.json, results.json, retrieval-index.json, cache-plan.json, manifest.json
 *
 * Results are candidate evidence, not relevance labels or ACE prompt authority.
 * Never writes to Redis/Valkey, Qdrant, Neo4j or PostgreSQL. cache-plan.json records
 * cache readiness as NOT_WRITTEN; it deliberately proposes no keys.
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const TRACE_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788/mcp';
const CALL_TIMEOUT_MS = 60_000;

/** [id, lanes, query, category]. Lanes: S=svelte, T=trace, A=atlas. */
const RAW = [
	['GB-001', 'S', 'How do SvelteKit 2 load functions return data to +page.svelte?', 'sveltekit2'],
	['GB-002', 'S', 'SvelteKit 2 form actions with use:enhance and superforms', 'sveltekit2'],
	['GB-003', 'S', 'Svelte 5 $props with a TypeScript interface', 'svelte5'],
	['GB-004', 'S', 'Svelte 5 $derived.by for multi-statement derivation', 'svelte5'],
	['GB-005', 'S', 'Svelte 5 $effect cleanup return function', 'svelte5'],
	['GB-006', 'S', 'Svelte 5 snippets replacing slots', 'svelte5'],
	['GB-007', 'S', 'Svelte 5 onclick event attributes instead of on:click', 'svelte5'],
	['GB-008', 'S', 'SvelteKit 2 +server.ts RequestHandler POST returning json', 'sveltekit2'],
	['GB-009', 'S', 'SvelteKit 2 hooks.server.ts handle function and event.locals', 'sveltekit2'],
	['GB-010', 'S', 'SvelteKit 2 error() and redirect() thrown from load', 'sveltekit2'],
	['GB-011', 'S', 'SvelteKit 2 $env/static/private versus $env/dynamic/private', 'sveltekit2'],
	['GB-012', 'S', 'SvelteKit 2 prerender and ssr page options', 'sveltekit2'],
	['GB-013', 'S', 'Svelte 5 bind:value on a component with $bindable props', 'svelte5'],
	['GB-014', 'S', 'SvelteKit 2 route parameter matchers', 'sveltekit2'],
	['GB-015', 'S', 'SvelteKit 2 layout data inheritance with parent()', 'sveltekit2'],
	['GB-016', 'TA', 'Zod schema validating request.json in a SvelteKit route', 'zod'],
	['GB-017', 'S', 'sveltekit-superforms v2 superValidate with the zod adapter', 'zod'],
	['GB-018', 'S', 'svelte-autofixer rules for runes misuse', 'svelte5'],
	['GB-019', 'TA', 'Drizzle migrate versus push on a database with live data', 'drizzle'],
	['GB-020', 'TA', 'pgvector halfvec cosine HNSW index on codebase_chunk_index', 'postgres18'],
	['GB-021', 'TA', 'PostgreSQL 18 io_method worker and io_workers settings', 'postgres18'],
	['GB-022', 'TA', 'Drizzle schema for atlas_packets with a jsonb envelope', 'drizzle'],
	['GB-023', 'TA', 'pg_trgm GIN index for trigram search on function names', 'postgres18'],
	['GB-024', 'TA', 'Canonical packet join on packet_key with source_ref and feature_id', 'identity'],
	['GB-025', 'TA', 'Symbol versions that are revision qualified', 'identity'],
	['GB-026', 'TA', 'Valkey centroid cache key pattern for kmeans, som and domain', 'cache'],
	['GB-027', 'TA', 'BitFrost L1 and L2 cache invalidation after a Postgres write', 'cache'],
	['GB-028', 'TA', 'ioredis lazyConnect and retryStrategy pattern for scripts', 'cache'],
	['GB-029', 'TA', 'Centroid cache partitioned by kmeans, som and domain keys', 'cache'],
	['GB-030', 'TA', 'ACE hit-demand Redis rank key and its TTL', 'cache'],
	['GB-031', 'TA', 'Replacing redis KEYS with SCAN for a hypergraph reset', 'cache'],
	['GB-032', 'TA', 'opencode.jsonc mcp registration for the trace server', 'opencode'],
	['GB-033', 'TA', 'OpenCode agent permission default deny with explicit allows', 'opencode'],
	['GB-034', 'TA', 'OpenCode instructions list must exclude generated cards', 'opencode'],
	['GB-035', 'TA', 'Ornith atlas kernel agent restricted to curated tools', 'opencode'],
	['GB-036', 'TA', 'llama-server model resolver for chat requests on port 8090', 'opencode'],
	['GB-037', 'TA', 'OpenCode SKILL.md loaded on demand', 'opencode'],
	['GB-038', 'TA', 'ACE context editor writes a canonical packet to Redis', 'ace'],
	['GB-039', 'TA', 'ContextManifest checksum and token budget', 'ace'],
	['GB-040', 'TA', 'Sanitising a user query before prompt injection', 'ace'],
	['GB-041', 'TA', 'Hidden thoughts and chain of thought must not persist in cache', 'ace'],
	['GB-042', 'TA', 'Agentic RAG context built from retrieval hits', 'ace'],
	['GB-043', 'TA', 'ACE scoring spine weights for semantic, tag, ast and som', 'ace'],
	['GB-044', 'TA', 'Retrieved text is data and never an instruction to the model', 'ace'],
	['GB-045', 'TA', 'find_feature lookup for an Atlas feature label', 'atlas-tools'],
	['GB-046', 'TA', 'find_source_refs for a symbol source reference', 'atlas-tools'],
	['GB-047', 'TA', 'Count of TRACE MCP tools registered in trace-mcp-server', 'trace'],
	['GB-048', 'TA', 'ATLAS_TOOLS_MOCK must be 0 for live atlas tools', 'atlas-tools'],
	['GB-049', 'TA', 'MCP tool selection narrowed by the tool query hint', 'trace'],
	['GB-050', 'TA', 'KAG search hybrid retrieval with neighbourhood expansion', 'trace'],
];

const QUERIES = RAW.map(([id, lanes, query, category]) => ({
	id,
	lanes: lanes === 'S' ? ['svelte'] : ['trace', 'atlas'],
	query,
	category,
}));

function sha256(text) {
	return createHash('sha256').update(text).digest('hex');
}

function validateQuerySet() {
	const errors = [];
	if (QUERIES.length !== 50) errors.push(`expected 50 queries, found ${QUERIES.length}`);
	const ids = new Set();
	for (const q of QUERIES) {
		if (ids.has(q.id)) errors.push(`duplicate id ${q.id}`);
		ids.add(q.id);
		if (!q.query || q.query.trim().length < 10) errors.push(`${q.id} query too short`);
	}
	return errors;
}

/** Minimal newline-delimited JSON-RPC client for a stdio MCP server. */
function stdioCall(command, args, cwd, env, toolName, toolArgs) {
	return new Promise((resolve) => {
		const started = Date.now();
		const child = spawn(command, args, {
			cwd,
			env: { ...process.env, ...env },
			shell: process.platform === 'win32',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		const pending = new Map();
		let buffer = '';
		let stderr = '';
		const finish = (result) => {
			clearTimeout(timer);
			try { child.kill(); } catch { /* already exited */ }
			resolve({ ...result, latencyMs: Date.now() - started });
		};
		const timer = setTimeout(() => finish({ status: 'TIMEOUT', error: `no response in ${CALL_TIMEOUT_MS}ms`, stderr: stderr.slice(-400) }), CALL_TIMEOUT_MS);
		child.on('error', (err) => finish({ status: 'SPAWN_FAILED', error: err.message }));
		child.on('exit', (code) => finish({ status: 'EXITED_EARLY', error: `exit ${code}`, stderr: stderr.slice(-400) }));
		child.stderr.on('data', (d) => { stderr += d.toString(); });
		child.stdout.on('data', (chunk) => {
			buffer += chunk.toString();
			let nl;
			while ((nl = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				if (!line) continue;
				let msg;
				try { msg = JSON.parse(line); } catch { continue; }
				if (msg.id !== undefined && pending.has(msg.id)) {
					const cb = pending.get(msg.id);
					pending.delete(msg.id);
					cb(msg);
				}
			}
		});
		const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
		const request = (id, method, params) => new Promise((ok) => {
			pending.set(id, ok);
			send({ jsonrpc: '2.0', id, method, params });
		});
		(async () => {
			const init = await request(1, 'initialize', {
				protocolVersion: '2024-11-05',
				capabilities: {},
				clientInfo: { name: 'golden-breadth-retrieval-v1', version: '1' },
			});
			if (init.error) return finish({ status: 'INIT_FAILED', error: JSON.stringify(init.error) });
			send({ jsonrpc: '2.0', method: 'notifications/initialized' });
			const list = await request(2, 'tools/list', {});
			const tools = (list.result?.tools ?? []).map((t) => t.name);
			if (!toolName) return finish({ status: 'OK', tools });
			if (!tools.includes(toolName)) {
				return finish({ status: 'TOOL_NOT_REGISTERED', error: `${toolName} not in tools/list`, tools });
			}
			const call = await request(3, 'tools/call', { name: toolName, arguments: toolArgs });
			if (call.error) return finish({ status: 'CALL_ERROR', error: JSON.stringify(call.error), tools });
			return finish({ status: call.result?.isError ? 'TOOL_ERROR' : 'OK', result: call.result, tools });
		})();
	});
}

/** Stateless streamable-HTTP JSON-RPC call to TRACE. Handles plain JSON or one SSE event. */
async function traceCall(toolName, toolArgs) {
	const started = Date.now();
	const post = async (body, expectedId) => {
		const res = await fetch(TRACE_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
		});
		const text = await res.text();
		if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
		if (!text.trim()) throw new Error('EMPTY_MCP_RESPONSE');
		try {
			return JSON.parse(text);
		} catch {
			const events = text.split(/\r?\n/).filter((line) => line.startsWith('data:'));
			const messages = events.map((line) => {
				try { return JSON.parse(line.slice(5).trim()); } catch { return null; }
			}).filter(Boolean);
			const response = messages.find((message) => message.id === expectedId) ?? messages.at(-1);
			if (response) return response;
			throw new Error('MCP_RESPONSE_MISSING_JSONRPC_RESULT');
		}
	};
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			const list = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, 1);
			const tools = (list.result?.tools ?? []).map((t) => t.name);
			if (!tools.includes(toolName)) {
				return { status: 'TOOL_NOT_REGISTERED', error: `${toolName} not in tools/list`, tools, latencyMs: Date.now() - started, attempts: attempt };
			}
			const call = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs } }, 2);
			if (call.error) return { status: 'CALL_ERROR', error: JSON.stringify(call.error), tools, latencyMs: Date.now() - started, attempts: attempt };
			return { status: call.result?.isError ? 'TOOL_ERROR' : 'OK', result: call.result, tools, latencyMs: Date.now() - started, attempts: attempt };
		} catch (err) {
			if (attempt === 3) return { status: 'UNREACHABLE', error: err.message, latencyMs: Date.now() - started, attempts: attempt };
			await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
		}
	}
}

const LANE_TOOLS = {
	svelte: { command: 'cmd', args: ['/c', 'npx', '-y', '@sveltejs/mcp'], cwd: FRONTEND_ROOT, env: {}, tool: 'get-documentation' },
	atlas: { command: 'node', args: ['./scripts/mcp/atlas-tools-mcp.mjs'], cwd: FRONTEND_ROOT, env: { ATLAS_TOOLS_MOCK: '0' }, tool: 'build_agentic_rag_context' },
};

function svelteSectionFor(query) {
	const sections = {
		'GB-001': 'kit/load',
		'GB-002': 'kit/form-actions',
		'GB-003': 'svelte/$props',
		'GB-004': 'svelte/$derived',
		'GB-005': 'svelte/$effect',
		'GB-006': 'svelte/snippet',
		'GB-007': 'svelte/event-handlers',
		'GB-008': 'kit/routing',
		'GB-009': 'kit/hooks',
		'GB-010': 'kit/load',
		'GB-011': 'kit/$env-static-private',
		'GB-012': 'kit/page-options',
		'GB-013': 'svelte/$bindable',
		'GB-014': 'kit/advanced-routing',
		'GB-015': 'kit/load',
		'GB-017': 'kit/form-actions',
		'GB-018': 'ai/tools',
	};
	return sections[query.id];
}

function candidateEvidence(laneResult, lane, query) {
	const raw = laneResult?.result;
	if (!raw) return null;
	const texts = Array.isArray(raw.content)
		? raw.content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text)
		: [];
	return {
		producer: lane,
		tool: lane === 'trace' ? 'trace.kag_search' : LANE_TOOLS[lane]?.tool ?? 'unknown',
		sourceRef: lane === 'svelte' ? `svelte-docs:${svelteSectionFor(query)}` : null,
		status: laneResult.status,
		isError: Boolean(raw.isError),
		structuredContent: raw.structuredContent ?? null,
		text: texts.join('\n').slice(0, 24_000),
		resultSha256: sha256(JSON.stringify(raw)),
		trust: 'UNTRUSTED_RETRIEVAL_DATA_NOT_PROMPT_AUTHORITY',
	};
}

async function runQuery(q, lane) {
	if (lane === 'svelte') {
		return stdioCall(LANE_TOOLS.svelte.command, LANE_TOOLS.svelte.args, LANE_TOOLS.svelte.cwd, LANE_TOOLS.svelte.env,
			LANE_TOOLS.svelte.tool, { section: svelteSectionFor(q) });
	}
	if (lane === 'trace') return traceCall('trace.kag_search', { query: q.query, limit: 10 });
	if (lane === 'atlas') {
		return stdioCall(LANE_TOOLS.atlas.command, LANE_TOOLS.atlas.args, LANE_TOOLS.atlas.cwd, LANE_TOOLS.atlas.env,
			LANE_TOOLS.atlas.tool, { query: q.query, maxCards: 5, maxPayloadBytes: 4096 });
	}
	return { status: 'UNKNOWN_LANE' };
}

function cachePlan(runId) {
	return {
		schema: 'atlas.golden-breadth-cache-plan.v1',
		runId,
		status: 'NOT_WRITTEN',
		note: 'No cache keys are proposed from unjudged benchmark queries. Cache population requires a separately approved, revision-qualified descriptor and readback.',
		writes: 0,
		plannedKeys: [],
	};
}

async function main() {
	const args = new Set(process.argv.slice(2));
	const limitArg = process.argv.find((a) => a.startsWith('--limit='));
	const limit = limitArg ? Number(limitArg.split('=')[1]) : QUERIES.length;
	const live = args.has('--live');
	const errors = validateQuerySet();
	if (errors.length) {
		console.error('QUERY SET INVALID:\n  ' + errors.join('\n  '));
		process.exit(1);
	}

	const runId = `gb-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
	const outDir = path.join(REPO_ROOT, 'docs', 'reports', 'golden-breadth-retrieval', runId);
	mkdirSync(outDir, { recursive: true });

	const fromArg = process.argv.find((a) => a.startsWith('--from='));
	const from = fromArg ? Number(fromArg.split('=')[1]) : 0;
	if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(from) || from < 0 || from >= QUERIES.length) {
		console.error('Expected --limit=N (positive integer) and --from=N (0-based query offset).');
		process.exit(2);
	}
	const selected = QUERIES.slice(from, from + limit);
	const plan = {
		schema: 'atlas.golden-breadth-plan.v1',
		runId,
		mode: live ? 'LIVE' : 'PLAN_ONLY',
		queryCount: selected.length,
		startIndex: from,
		queriesSha256: sha256(JSON.stringify(QUERIES)),
		queries: selected,
	};
	const planText = JSON.stringify(plan, null, 2) + '\n';
	writeFileSync(path.join(outDir, 'plan.json'), planText, { flag: 'wx' });

	const results = [];
	if (live) {
		for (const q of selected) {
			const laneResults = {};
			for (const lane of q.lanes) {
				laneResults[lane] = await runQuery(q, lane);
			}
			results.push({ id: q.id, query: q.query, lanes: laneResults });
			console.log(`${q.id} ${Object.entries(laneResults).map(([l, r]) => `${l}=${r.status}`).join(' ')}`);
		}
	}
	const resultsText = JSON.stringify({ runId, mode: plan.mode, results }, null, 2) + '\n';
	writeFileSync(path.join(outDir, 'results.json'), resultsText, { flag: 'wx' });

	const index = {
		schema: 'atlas.golden-breadth-retrieval-index.v1',
		runId,
		status: 'CANDIDATE_CORPUS_UNJUDGED',
		note: 'Local JSON evidence corpus derived from MCP results. Content is untrusted retrieval data; not relevance labels, cache authority, or ACE prompt injection.',
		entries: results.map((r) => ({
			id: r.id,
			query: r.query,
			okLanes: Object.entries(r.lanes).filter(([, v]) => v.status === 'OK').map(([l]) => l),
			failedLanes: Object.entries(r.lanes).filter(([, v]) => v.status !== 'OK').map(([l, v]) => ({ lane: l, status: v.status })),
			evidence: Object.fromEntries(Object.entries(r.lanes).map(([lane, value]) => [lane, candidateEvidence(value, lane, QUERIES.find((q) => q.id === r.id))])),
		})),
	};
	const indexText = JSON.stringify(index, null, 2) + '\n';
	writeFileSync(path.join(outDir, 'retrieval-index.json'), indexText, { flag: 'wx' });

	const cacheText = JSON.stringify(cachePlan(runId), null, 2) + '\n';
	writeFileSync(path.join(outDir, 'cache-plan.json'), cacheText, { flag: 'wx' });

	const manifest = {
		schema: 'atlas.golden-breadth-manifest.v1',
		runId,
		mode: plan.mode,
		files: {
			'plan.json': sha256(planText),
			'results.json': sha256(resultsText),
			'retrieval-index.json': sha256(indexText),
			'cache-plan.json': sha256(cacheText),
		},
	};
	writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
	console.log(`receipts: ${path.relative(REPO_ROOT, outDir)} (${plan.mode}, ${selected.length} queries)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
